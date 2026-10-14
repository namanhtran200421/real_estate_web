# Deposit first, rent at check-in, deposit back at check-out

Status: decided with the owner on 14/10/2026 (answers recorded below). Branch `redesign/light-cinematic`.

## What the owner asked for

From the team's notes (Vietnamese, pasted by the owner):

1. When a guest confirms a booking they pay a **20% deposit**. After they check in they transfer **100% of the rent**. At check-out, if nothing was damaged or lost, the 20% deposit held since booking is **transferred back**.
2. A table/procedure for **inspecting the apartment's equipment** (used at check-out before the deposit goes back).
3. On the payment page, next to **"Tiếp tục thanh toán"**, a **checkbox**: "by ticking this you agree to our policy". The word *policy* is underlined and opens a **policy page** with the house rules the team wrote (21 items, "Nội Quy Lưu Trú dành cho Quý Khách").
4. "Phần số 4 sẽ bỏ vô Policy": item 4 (registration details / ID documents) lives in the policy page.

Owner's answers to the open questions (14/10/2026):

| Question | Answer |
|---|---|
| Deposit amount | **20% of the rent** (the apartment's deposit percent, editable in admin). The 2tr/3tr tiers by stay length are still being discussed and are **not** built now. |
| How the rent is paid | **On the site, from check-in day**: on check-in morning (08:00 business time) the guest gets an email; the booking page shows the VietQR for the rent with the same screenshot upload; the owner verifies as today. |
| Equipment inspection | **Checklist in admin**: room-by-room list per apartment (drafted from the amenities, editable); on the booking the owner ticks it at check-out, then presses **"Hoàn cọc"** or records damage taken from the deposit. |
| Policy text | Publish the main "Điều khoản & điều kiện" column, with the **numbered check-out list** for item 21. Internal notes (Chị Tiên's alternative for item 3, the 250k extra-guest idea, children under 12, 200k/night pets) stay internal. |

## Domain changes (CONTEXT.md)

- **Deposit** (*Tiền đặt cọc*) changes meaning. It is now a *security deposit*: `depositPercent`% of the stay total (20% by the policy), paid when booking. Its verified transfer confirms the booking. It is held separately from the rent, is **not revenue**, and goes back to the guest at check-out after the inspection, minus damage applied to it. Code keeps the existing names from migration 014: payment purpose `asset_security`, booking column `asset_security_amount`.
- **Rent** (*Tiền phòng*): the stay total. It is paid in full by transfer from check-in day (payment purpose `accommodation`, as today).
- **Inspection** (*Kiểm tra trả phòng*): the owner's room-by-room equipment check at check-out. Each item is OK or a problem with a note. A problem with a cost becomes an **Incident** (existing).
- **Deposit refund** (*Hoàn cọc*): the owner sends back what is still held of the deposit and records it. It needs a saved inspection and no open incident.
- The old meaning, "a part of the rent paid up front", is retired for new bookings. **Legacy bookings** (made before this change, `asset_security_amount = 0`) keep the old flow untouched: they may pay part of the rent or all of it up front, and they are confirmed by a rent payment.

An ADR (`docs/adr/0003-deposit-first-payments.md`) records why: it is the owner's policy, money paid as a guarantee is not revenue, and the site never takes money it cannot see.

## Rules (pure, unit-tested in `booking.rules.ts`)

A booking is **deposit-first** when `assetSecurityAmount > 0`.

The booking's *confirming purpose* is `asset_security` for deposit-first bookings and `accommodation` for legacy ones. Verifying or recording a payment of the confirming purpose confirms a pending booking. Reporting that payment clears the hold, and rejecting it gives a fresh hold. Recording it on an expired booking reactivates the booking if the dates are free.

What the guest may pay now (`paymentOptions`). Nothing is payable while a reported transfer is being checked.

| Booking | `assetSecurity` | `full` (rent) | `deposit` (legacy part-rent) | `incident` |
|---|---|---|---|---|
| deposit-first, pending, hold live, deposit not yet received | deposit still due | null | null | null |
| deposit-first, confirmed, today < check-in | null | null | null | due if any |
| deposit-first, confirmed or completed, today ≥ check-in, rent due ≥ 1.000 ₫ | null | rent due | null | due if any |
| legacy | null | as today | as today | due if any |

Two values are added to the guest view:

- `rentDueFrom`: the check-in date for a deposit-first booking whose rent is not fully paid, otherwise null. It lets the pages say "Tiền phòng thanh toán từ ngày 30/10".
- `depositFirst: boolean`.

Payment status (`derivePaymentStatus`) also counts the deposit:

1. rent net ≥ total → `fully_paid`
2. rent net > 0 → `deposit_paid` (legacy part-rent)
3. deposit net > 0 → `deposit_paid` (admin label "Đã đặt cọc")
4. any refund → `refunded`
5. otherwise → `unpaid`

`amount_paid` stays "rent received net of refunds".

## Money flow and emails

1. **Booking created** (deposit-first): the hold email asks for the deposit (amount and transfer note `REF…TS`). It explains that the rent is paid from check-in day and the deposit is returned at check-out.
2. **Deposit verified**: the booking is confirmed. The confirmation email shows the deposit received, the rent amount and its date, and the refund rule.
3. **Check-in morning** (new job `rent-requests`, every 15 minutes): it claims confirmed deposit-first bookings where `(check_in + 08:00) at business tz ≤ now`, rent is due, the check-out time has not passed and `rent_request_sent_at` is null. It sends "Thanh toán tiền phòng" with the lookup link.
4. **Rent verified**: the existing payment-received email.
5. **Check-out**: the owner records check-out (existing), saves the inspection, records incidents (existing, deposit applied), then presses **Hoàn cọc**. That refunds `assetSecurityHeld` across the booking's deposit payments, with the reason "Hoàn cọc sau kiểm tra trả phòng", and the guest gets the refund email.

The owner's dashboard quick actions ("Đã nhận cọc X ₫") record an `asset_security` payment for deposit-first bookings. The amount awaiting payment is the deposit.

## Policy page

- Route `/policy` (and `/en/policy`), Tier 2 (no motion). Title "Chính sách lưu trú" / "House rules & policies".
- 21 numbered items with anchors `item-1` … `item-21`. The text is in the i18n files (vi as written by the team, en translated).
- Item 2 shows the apartment's real deposit percent, not a hard-coded 20, so the policy and the charge never disagree.
- Item 21 is the numbered check-out list.
- Links to it:
  - the payment-page checkbox (opens in a new tab so the upload in progress is kept);
  - the footer;
  - the apartment page's "Nhận phòng & nội quy" section;
  - the guest-identity form (to item 4).

## Payment-page checkbox

- Above "Tiếp tục thanh toán": an unticked checkbox, required. The text is "Tôi đã đọc và đồng ý với **chính sách lưu trú**", with the underlined part linking to the policy page. The continue button stays disabled until the box is ticked, and a hint says why.
- The API requires `acceptPolicy=true` on every transfer report (422 `POLICY_NOT_ACCEPTED` otherwise). The report records the event `policy_accepted` with the policy version `2026-10-14`.

## Inspection checklist

- Each apartment has `inspection_checklist jsonb`: `[{ "room": "Phòng khách", "items": ["Sofa giường", …] }, …]`. When it is empty, a built-in default drafted from Sun Garden's amenities is used.
- In admin → apartment edit, a textarea edits the checklist. A non-empty line not starting with `-` is a room, and `- …` lines are its items. Parse and serialise are pure and unit-tested.
- Admin → booking detail gets a "Kiểm tra trả phòng" section for confirmed or completed bookings from check-in day on.
  - Every item is listed per room, OK by default, with "Có vấn đề" and a note.
  - Saving stores `booking_inspections` (one row per booking, results jsonb, inspected_by, inspected_at; saving again replaces it) and records the event `inspection_saved`.
  - Any problem items are shown next to the existing incident form.
- The **Hoàn cọc** button shows the held amount. It is enabled when the inspection is saved, no incident is open and held ≥ 1.000 ₫.

## Data (migration 015)

- `apartments.inspection_checklist jsonb NOT NULL DEFAULT '[]'`
- `bookings.rent_request_sent_at timestamptz`
- `booking_inspections` (booking_id PK → bookings ON DELETE CASCADE, results jsonb NOT NULL, inspected_by uuid → admin_users ON DELETE SET NULL, inspected_at timestamptz NOT NULL DEFAULT now())
- `apartments.long_stay_security_amount` is dropped. It came from the earlier long-stay draft, and the owner chose 20% for every stay. Its admin field and logic go too.

## Out of scope

- 2tr/3tr deposit tiers by stay length (to be discussed).
- The extra-guest surcharge, pet surcharge and children rules (internal notes).
- Cancellation refunds (unchanged: the owner refunds per payment).
- Automatic bank feed.

## Acceptance

- New booking: the hold email and the payment page ask only for the deposit (percent × total, rounded to 1.000 ₫). After the owner verifies it the booking is confirmed and no rent is payable before check-in day.
- On check-in day at 08:00 the guest gets the rent email. The payment page offers the full rent, and verifying it makes the booking `fully_paid`.
- At check-out: inspection saved → incident with deposit applied (optional) → Hoàn cọc refunds the rest. Revenue never includes the deposit.
- Legacy bookings behave exactly as before.
- The payment page cannot continue without the policy box ticked, and the API refuses a report without it. `/policy` renders all 21 items in vi and en, with the real deposit percent.
- Backend typecheck and tests, frontend tests and the production build all pass. The booking flow is checked end to end in a browser against a local database with migrations 014 and 015.
