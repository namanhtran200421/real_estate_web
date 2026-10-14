# Deposit-first payments, policy page and check-out inspection: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** guests pay a 20% security deposit when booking, the full rent from check-in day and get the deposit back after the owner's check-out inspection. They must agree to a new policy page before paying.

**Architecture:** the work builds on migration 014's payment purposes (`asset_security` = the deposit, `accommodation` = the rent) and on asset incidents. A pure rules module decides what is payable. The services use it everywhere. Migration 015 adds the checklist, the inspection and the rent-request marker. Angular guest pages get a policy checkbox and a deposit/rent/refund timeline, and the admin gets an inspection checklist and a "Hoàn cọc" action.

**Tech stack:**
- Backend: Express 5 + PostgreSQL (`pg`), zod, `node:test` (run with `npm test`).
- Frontend: Angular 22 (zoneless, SSR) + Transloco (vi/en) + Tailwind v4. Tests run with Vitest (`npx ng test --watch=false`, `vi` global).

**Spec:** `docs/superpowers/specs/2026-10-14-deposit-first-payments-design.md`. Read it first; it is the authority.

## Global Constraints

- **Never use `backend/.env` for anything.** It points at the production database. Local runs and tests use `DATABASE_URL=postgresql://localhost/real_estate_test DB_SSL=false`, and the integration test uses `TEST_DATABASE_URL=postgresql://localhost/real_estate_test`. Never print a database URL from `.env`. Never run migrations against anything but `postgresql://localhost/real_estate_test`.
- **Deposit-first** means `assetSecurityAmount > 0`. Legacy bookings (`= 0`) keep today's behaviour exactly; every change must leave them untouched.
- **Names:**
  - deposit = payment purpose `asset_security`, transfer note suffix `TS`;
  - rent = `accommodation`, no suffix;
  - damage = `incident`, suffix `BT`.
- **Guest copy:** Vietnamese "Tiền đặt cọc", "Tiền phòng", "Hoàn cọc", "Chính sách lưu trú"; English "Deposit", "Rent", "Deposit refund", "House rules & policies".
- **Money:** integers in VND; never offer an amount below `MIN_TRANSFER` (1.000 ₫). The deposit is never revenue (keep the existing `purpose <> 'asset_security'` revenue filters).
- **Policy version:** `POLICY_VERSION = '2026-10-14'`, exported from `backend/src/modules/bookings/booking.rules.ts`.
- **Rent opens:** at 08:00 business time on the check-in date. Rules take `today` (a `YYYY-MM-DD` string in the business time zone, from `todayIn(env.timezone)`): rent is payable when `today >= checkIn`. The job sends its email from 08:00.
- **Code style:** follow the surrounding code. That means doc comments on exported functions, Vietnamese owner/guest error messages in the backend and English identifiers. No new dependencies.
- **Commits:** end each commit message with `Co-Authored-By: <your model name> <noreply@anthropic.com>`. Never commit `frontend/real-estate/src/environments/environment.ts`. Commit only the files your task touches (`git add <paths>`, never `git add -A`).

## Review Focus

1. **Legacy bookings:** a booking with `assetSecurityAmount = 0` must still offer deposit/full rent and be confirmed by a rent payment. The rules tests cover both kinds.
2. **Deposit-first confirmed before check-in day:** nothing is payable. The payment page must send the guest to the confirmation page; it must never say "contact the owner".
3. **Report without the policy box:** the API returns 422 `POLICY_NOT_ACCEPTED`, and the frontend keeps the button disabled.
4. **Hoàn cọc twice, or with an open incident:** refused. The refund never exceeds what is held (received − refunded − applied).
5. **Rent request email:** sent once per booking. It is not sent for legacy bookings, cancelled bookings, bookings with the rent already paid, or bookings whose check-out time has passed.

---

### Task 1: Payment rules for deposit-first bookings (backend, pure)

**Files:**
- Modify: `backend/src/modules/bookings/booking.rules.ts`
- Modify: `backend/src/modules/bookings/booking.rules.test.ts`
- Modify: `backend/src/modules/bookings/booking.types.ts` (only if a type is needed)

**Interfaces:**
- Produces (exact):
  - `isDepositFirst(booking: Pick<BookingRecord, 'assetSecurityAmount'>): boolean`
  - `confirmingPurpose(booking: Pick<BookingRecord, 'assetSecurityAmount'>): PaymentPurpose`
  - `paymentOptions(booking: PayableBooking, financials: Pick<BookingFinancials, 'assetSecurityDue' | 'incidentAmountDue'>, now: Date, today: string, transferPending: boolean): PaymentOptions`, where `type PayableBooking = Pick<BookingRecord, 'status' | 'amountPaid' | 'holdExpiresAt' | 'totalAmount' | 'depositAmount' | 'assetSecurityAmount' | 'checkIn'>`
  - `rentDueFrom(booking: Pick<BookingRecord, 'status' | 'amountPaid' | 'totalAmount' | 'assetSecurityAmount' | 'checkIn'>): string | null`
  - `derivePaymentStatus(money: { total: number; rentReceived: number; rentRefunded: number; depositReceived: number; depositRefunded: number }): PaymentStatus`
  - `POLICY_VERSION = '2026-10-14'`
- Consumers (Task 2) call these. The old signatures go away; Task 2 updates their callers. To keep this task compiling, update the two callers minimally:
  - `toGuestBooking` in `booking.service.ts`: pass `financials` and `todayIn(env.timezone)`, and drop its own `assetSecurity`/`incident` computation, because the rules now return them.
  - `amountFor` in `payment.service.ts`: fetch financials with `assetIncidentRepository.financials(...)` and look the option up in the returned options.
  - `recalculate`: pass deposit totals of 0 for now (Task 2 adds the real totals).

- [ ] **Step 1: Write the failing tests** in `booking.rules.test.ts`. Keep the existing `assertValidStay` and `isPayable` tests. Rewrite the `paymentOptions` and `derivePaymentStatus` describes to cover:

```ts
const NOW = new Date('2026-11-01T03:00:00Z');
const financials = (assetSecurityDue = 0, incidentAmountDue = 0) => ({ assetSecurityDue, incidentAmountDue });
const legacy = { status: 'pending', amountPaid: 0, holdExpiresAt: new Date('2026-11-01T05:00:00Z'), totalAmount: 3_400_000, depositAmount: 1_020_000, assetSecurityAmount: 0, checkIn: '2026-11-10' } as const;
const depositFirst = { ...legacy, depositAmount: 0, assetSecurityAmount: 680_000 } as const;

// legacy, unchanged behaviour
paymentOptions(legacy, financials(), NOW, '2026-11-01', false)
  → { deposit: 1_020_000, full: 3_400_000, assetSecurity: null, incident: null }
paymentOptions({ ...legacy, amountPaid: 1_020_000 }, financials(), NOW, '2026-11-01', false)
  → { deposit: null, full: 2_380_000, assetSecurity: null, incident: null }
// deposit-first, pending: only the deposit
paymentOptions(depositFirst, financials(680_000), NOW, '2026-11-01', false)
  → { deposit: null, full: null, assetSecurity: 680_000, incident: null }
// deposit-first, pending, hold ran out → nothing
paymentOptions({ ...depositFirst, holdExpiresAt: new Date('2026-11-01T02:00:00Z') }, financials(680_000), NOW, '2026-11-01', false) → all null
// deposit-first, confirmed before check-in day → nothing
paymentOptions({ ...depositFirst, status: 'confirmed', holdExpiresAt: null }, financials(0), NOW, '2026-11-09', false) → all null
// deposit-first, confirmed on check-in day → the full rent
paymentOptions({ ...depositFirst, status: 'confirmed', holdExpiresAt: null }, financials(0), NOW, '2026-11-10', false)
  → { deposit: null, full: 3_400_000, assetSecurity: null, incident: null }
// deposit-first, completed with an incident due and rent paid → only the incident
paymentOptions({ ...depositFirst, status: 'completed', amountPaid: 3_400_000, holdExpiresAt: null }, financials(0, 500_000), NOW, '2026-11-12', false)
  → { deposit: null, full: null, assetSecurity: null, incident: 500_000 }
// a transfer being checked → nothing, for both kinds
// amounts below 1.000 ₫ are never offered (deposit due 500 → assetSecurity null)

rentDueFrom(depositFirst) → '2026-11-10'
rentDueFrom({ ...depositFirst, amountPaid: 3_400_000 }) → null
rentDueFrom(legacy) → null
rentDueFrom({ ...depositFirst, status: 'cancelled' }) → null   // also 'expired'

derivePaymentStatus({ total: 100, rentReceived: 100, rentRefunded: 0, depositReceived: 20, depositRefunded: 20 }) → 'fully_paid'
derivePaymentStatus({ total: 100, rentReceived: 30, rentRefunded: 0, depositReceived: 0, depositRefunded: 0 }) → 'deposit_paid'
derivePaymentStatus({ total: 100, rentReceived: 0, rentRefunded: 0, depositReceived: 20, depositRefunded: 0 }) → 'deposit_paid'
derivePaymentStatus({ total: 100, rentReceived: 0, rentRefunded: 0, depositReceived: 20, depositRefunded: 20 }) → 'refunded'
derivePaymentStatus({ total: 100, rentReceived: 0, rentRefunded: 0, depositReceived: 0, depositRefunded: 0 }) → 'unpaid'
confirmingPurpose(legacy) → 'accommodation'; confirmingPurpose(depositFirst) → 'asset_security'
```

- [ ] **Step 2: Run the tests and see them fail.** Run `cd backend && npm test`.

- [ ] **Step 3: Implement** in `booking.rules.ts`:

```ts
/** Version of the house rules a guest agrees to when reporting a transfer (the /policy page). */
export const POLICY_VERSION = '2026-10-14';

/** Deposit-first bookings pay a security deposit to confirm, then the rent from check-in day. */
export function isDepositFirst(booking: Pick<BookingRecord, 'assetSecurityAmount'>): boolean {
  return booking.assetSecurityAmount > 0;
}

/** The payment whose arrival confirms a pending booking (and whose report clears its hold). */
export function confirmingPurpose(booking: Pick<BookingRecord, 'assetSecurityAmount'>): PaymentPurpose {
  return isDepositFirst(booking) ? 'asset_security' : 'accommodation';
}

type PayableBooking = Pick<
  BookingRecord,
  'status' | 'amountPaid' | 'holdExpiresAt' | 'totalAmount' | 'depositAmount' | 'assetSecurityAmount' | 'checkIn'
>;

const NOTHING: PaymentOptions = { deposit: null, full: null, assetSecurity: null, incident: null };

function worthTransferring(amount: number): number | null {
  return amount >= MIN_TRANSFER ? amount : null;
}

/**
 * What the guest may transfer now. Nothing while a reported transfer is still being checked, so
 * a guest never pays twice by accident. Deposit-first: the deposit while the hold runs, then the
 * full rent from check-in day. Legacy: part of the rent (the old deposit) or all of it.
 * @param today the business date, YYYY-MM-DD
 */
export function paymentOptions(
  booking: PayableBooking,
  financials: Pick<BookingFinancials, 'assetSecurityDue' | 'incidentAmountDue'>,
  now: Date,
  today: string,
  transferPending: boolean,
): PaymentOptions {
  if (transferPending) return NOTHING;
  const stayLive = booking.status === 'confirmed' || booking.status === 'completed';
  const incident = stayLive ? worthTransferring(financials.incidentAmountDue) : null;
  const rentDue = booking.totalAmount - booking.amountPaid;

  if (isDepositFirst(booking)) {
    if (booking.status === 'pending') {
      return { ...NOTHING, assetSecurity: isPayable(booking, now) ? worthTransferring(financials.assetSecurityDue) : null };
    }
    const rentOpen = stayLive && today >= booking.checkIn;
    return { ...NOTHING, full: rentOpen ? worthTransferring(rentDue) : null, incident };
  }

  if (!isPayable(booking, now) || rentDue < MIN_TRANSFER) return { ...NOTHING, incident };
  const depositUseful = booking.depositAmount >= MIN_TRANSFER && booking.depositAmount < rentDue;
  const deposit = booking.amountPaid === 0 && depositUseful ? booking.depositAmount : null;
  return { deposit, full: rentDue, assetSecurity: null, incident };
}

/** The date the rent becomes payable (check-in day) while it is still owed; null otherwise. */
export function rentDueFrom(
  booking: Pick<BookingRecord, 'status' | 'amountPaid' | 'totalAmount' | 'assetSecurityAmount' | 'checkIn'>,
): string | null {
  if (!isDepositFirst(booking) || booking.status === 'cancelled' || booking.status === 'expired') return null;
  return booking.totalAmount - booking.amountPaid >= MIN_TRANSFER ? booking.checkIn : null;
}

/** Payment status from the rent and the deposit received and refunded (all in VND). */
export function derivePaymentStatus(money: {
  total: number;
  rentReceived: number;
  rentRefunded: number;
  depositReceived: number;
  depositRefunded: number;
}): PaymentStatus {
  const rent = money.rentReceived - money.rentRefunded;
  const deposit = money.depositReceived - money.depositRefunded;
  if (rent >= money.total && rent > 0) return 'fully_paid';
  if (rent > 0 || deposit > 0) return 'deposit_paid';
  if (money.rentRefunded + money.depositRefunded > 0) return 'refunded';
  return 'unpaid';
}
```

Note that legacy completed bookings used to get `incident` from `toGuestBooking`. They still do, because `incident` is computed before the legacy branch returns.

- [ ] **Step 4: Update the three callers** as described under Interfaces, so `npm run typecheck` passes. In `toGuestBooking`, replace the hand-built `paymentOptions: {...}` with `paymentOptions(booking, financials, new Date(), todayIn(env.timezone), pending !== undefined)`.

- [ ] **Step 5: Run** `cd backend && npm run typecheck && npm test`. Expect everything to pass.

- [ ] **Step 6: Commit** `backend/src/modules/bookings/booking.rules.ts`, the test, and the touched callers, with the message "Decide deposit-first payments in pure rules: deposit to confirm, rent from check-in day".

---

### Task 2: Deposit-first money flow in the backend (migration 015, services, emails, job)

**Files:**
- Create: `backend/migrations/015_inspections_and_rent_requests.sql`
- Modify: `backend/src/modules/payments/payment.service.ts`, `payment.repository.ts`
- Modify: `backend/src/modules/bookings/booking.service.ts`, `booking.repository.ts`, `booking.types.ts`, `booking.controller.ts`, `booking.router.ts` (doc comment)
- Modify: `backend/src/modules/apartments/apartment.types.ts`, `apartment.repository.ts`, `apartment.admin.controller.ts` (remove `longStaySecurityAmount`)
- Modify: `backend/src/modules/notifications/email.templates.ts`, `email.service.ts`
- Modify: `backend/src/jobs/index.ts`
- Modify: `backend/src/modules/payments/transfer-report.test.ts`

**Interfaces:**
- Consumes the Task 1 rules.
- Produces:
  - `GuestBooking` gains `depositFirst: boolean` and `rentDueFrom: string | null`.
  - `POST /bookings/:reference/transfer?option=…&acceptPolicy=true[&sendAnyway=true]`. A missing or `false` `acceptPolicy` returns 422 `POLICY_NOT_ACCEPTED` with the message "Vui lòng đồng ý với chính sách lưu trú trước khi gửi.". This is checked **before** the screenshot is read.
  - The option enum accepts `deposit | full | asset_security | incident` (unchanged).
  - `bookingService.sendRentRequests(): Promise<number>`, run by the job `rent-requests` every 15 minutes.

- [ ] **Step 1: Migration 015.** Write `backend/migrations/015_inspections_and_rent_requests.sql`:

```sql
-- Deposit-first payments: the check-out inspection, its checklist, and the check-in rent request.
ALTER TABLE apartments
  ADD COLUMN inspection_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  DROP COLUMN long_stay_security_amount;

ALTER TABLE bookings
  ADD COLUMN rent_request_sent_at timestamptz;

CREATE TABLE booking_inspections (
  booking_id   uuid        PRIMARY KEY REFERENCES bookings (id) ON DELETE CASCADE,
  results      jsonb       NOT NULL,
  inspected_by uuid        REFERENCES admin_users (id) ON DELETE SET NULL,
  inspected_at timestamptz NOT NULL DEFAULT now()
);
```

Apply it locally only: `cd backend && DATABASE_URL=postgresql://localhost/real_estate_test DB_SSL=false npm run db:migrate:dev`. That also applies 014 if it is missing.

- [ ] **Step 2: Remove the long-stay security draft.**
  - Delete `longStaySecurityAmount` from the apartment types, repository and admin controller zod schema.
  - In `createBooking`, set `assetSecurityAmount: price.deposit` (the quote's deposit, percent × total rounded to 1.000 ₫).
  - Set `depositAmount: 0` for the new booking. A new booking is deposit-first whenever the apartment's deposit percent is above 0. If the percent is 0, `price.deposit` is 0 and the booking is legacy: the rent is paid up front, as before.
  - Check `bookingRepository.insert` and the `bookings` table for the columns it writes, and set `deposit_amount` from the input rather than from the price.

- [ ] **Step 3: Payments use the confirming purpose.** In `payment.service.ts`:
  - `amountFor(booking, option, db)`:
    - A pending transfer gives 409 `TRANSFER_BEING_CHECKED` (as now).
    - Otherwise look up `paymentOptions(booking, financials, now, todayIn(env.timezone), false)[key]`, where `key` is `deposit | full | assetSecurity | incident`.
    - If that is null:
      - for a pending booking whose hold has run out, or an expired one, return 409 `BOOKING_NOT_PAYABLE` (current message);
      - for a deposit-first booking asking for `full` before check-in day, return 422 `RENT_NOT_DUE_YET` with "Tiền phòng được thanh toán từ ngày nhận phòng (dd/MM/yyyy).";
      - otherwise return 422 `PAYMENT_OPTION_UNAVAILABLE` (current message).
  - `reportTransfer(..., acceptPolicy: boolean)`:
    - Without it, throw 422 `POLICY_NOT_ACCEPTED` first.
    - Clear the hold when `purpose === confirmingPurpose(booking)` and the booking is pending.
    - Inside the transaction, add an event `policy_accepted` from `'guest'` with `{ version: POLICY_VERSION, paymentId }`.
  - `verifyTransfer` and `recordManualPayment`:
    - Confirm when `payment.purpose === confirmingPurpose(booking)`, through `confirmIfPending`.
    - `recordManualPayment` reactivates an expired booking for the confirming purpose (not only `accommodation`).
  - `rejectTransfer`: give the fresh hold when `payment.purpose === confirmingPurpose(booking)` and the booking is pending with `amountPaid === 0`. Pass the hold minutes to the email on the same condition.
  - `recalculate`: `paymentRepository.totals` returns `{ received, refunded, depositReceived, depositRefunded }`, where the deposit figures are `asset_security` succeeded payments and their succeeded refunds. Call the new `derivePaymentStatus`. `amount_paid` stays `received - refunded` (rent only).
  - In the controller, the report schema gains `acceptPolicy: z.enum(['true', 'false']).optional()`. Pass `acceptPolicy === 'true'`. Update the router and controller doc comments.

- [ ] **Step 4: Guest view.**
  - `toGuestBooking` adds `depositFirst: isDepositFirst(booking)` and `rentDueFrom: rentDueFrom(booking)`.
  - Admin `confirm()`: for deposit-first bookings, require `financials.assetSecurityReceived > 0` instead of `amountPaid > 0`, with the message "Chưa nhận tiền đặt cọc. Hãy xác nhận khoản chuyển khoản hoặc ghi nhận thanh toán, đặt phòng sẽ được xác nhận.".

- [ ] **Step 5: Rent request job.**
  - Add `bookingRepository.claimRentRequests(timezone: string, db: Db): Promise<string[]>`. It updates `rent_request_sent_at = now()` and returns the ids of bookings where all of these hold:
    - `status = 'confirmed'`;
    - `asset_security_amount > 0`;
    - `amount_paid < total_amount`;
    - `rent_request_sent_at IS NULL`;
    - `((check_in + time '08:00') AT TIME ZONE $1) <= now()`;
    - the scheduled check-out time has not passed. Use the same scheduled check-out expression `claimCheckoutReminders` uses, or `check_out` at the apartment's check-out time. Read the repository to find it.
  - `bookingService.sendRentRequests()` claims inside a transaction and queues `emailService.queueRentRequest(context, db)` for each id.
  - Register `{ name: 'rent-requests', intervalMs: 15 * MINUTE, run: bookingService.sendRentRequests }` and add a row to the job table comment.

- [ ] **Step 6: Emails** (Vietnamese, the same `render()` layout as the others):
  - `bookingHeldEmail`: for deposit-first bookings, ask for the deposit. Show the amount, the transfer note `transferNote(ref, 'asset_security')` and the deadline. Add one paragraph: "Tiền phòng {total} ₫ được thanh toán bằng chuyển khoản từ ngày nhận phòng {date}. Tiền đặt cọc được hoàn lại khi trả phòng, sau khi kiểm tra căn hộ." Legacy bookings keep the current text. `createBooking` passes the right note.
  - `bookingConfirmedEmail`: for deposit-first bookings, say the deposit was received, the rent amount and the date it opens, and the refund rule.
  - New `rentRequestEmail(booking)`: heading "Thanh toán tiền phòng", the rent amount, the transfer note (`transferNote(ref)`, no suffix), and a button "Thanh toán tiền phòng" linking to `lookupUrl(reference)`. Wire `emailService.queueRentRequest` the way `queueCheckoutReminder` is wired.
  - `BookingEmailContext` gains whatever fields these need (for example `assetSecurityAmount`). Read `emailContext` in the repository.

- [ ] **Step 7: Update `transfer-report.test.ts`.**
  - Its booking is now deposit-first (the test apartment's deposit percent > 0), so it reports `option=asset_security&acceptPolicy=true`.
  - Add a case: a report without `acceptPolicy` returns 422 `POLICY_NOT_ACCEPTED` and stores nothing.
  - Add a case: after the owner verifies the deposit (call `paymentService.verifyTransfer` or the admin route the test already uses), the booking is `confirmed` with `paymentStatus` `deposit_paid`, and `paymentOptions` are all null before check-in day.
  - Run it: `cd backend && TEST_DATABASE_URL=postgresql://localhost/real_estate_test npm test`.

- [ ] **Step 8: Run** `cd backend && npm run typecheck && npm run build && TEST_DATABASE_URL=postgresql://localhost/real_estate_test npm test`. Everything must pass. Commit the touched backend files with the message "Take a security deposit to confirm, ask for the rent on check-in morning, and require the policy".

---

### Task 3: Check-out inspection and deposit refund (backend)

**Files:**
- Create: `backend/src/modules/bookings/inspection.ts` (default checklist and validation)
- Create: `backend/src/modules/bookings/inspection.repository.ts`
- Create: `backend/src/modules/bookings/inspection.test.ts`
- Modify: `backend/src/modules/apartments/*` (checklist field), `booking.service.ts`, `booking.admin.controller.ts`, `admin.router.ts`, `booking.types.ts`, `payment.service.ts`, `payment.repository.ts`, `booking.repository.ts` (summary query)

**Interfaces:**
- `type InspectionChecklist = { room: string; items: string[] }[]`
- `type InspectionResult = { room: string; item: string; ok: boolean; note: string | null }`
- `DEFAULT_INSPECTION_CHECKLIST: InspectionChecklist` (below)
- `checklistFor(apartment): InspectionChecklist` returns the apartment's list, or the default when it is empty
- `AdminBookingDetail` gains:
  - `inspection: { results: InspectionResult[]; inspectedBy: string | null; inspectedAt: string } | null`
  - `checklist: InspectionChecklist`
  - `depositRefundable: number` (= `financials.assetSecurityHeld`)
- Admin routes (the same auth and CSRF as the other admin booking routes):
  - `PUT /admin/bookings/:reference/inspection`, body `{ results: InspectionResult[] }` (zod: 1–200 results, room/item 1–120 chars, note ≤ 500 or null). It returns the detail.
    - Allowed for `confirmed` or `completed` bookings on or after check-in day; otherwise 409 `INVALID_STATUS`.
    - It upserts the row and adds the event `inspection_saved` with `{ problems: <count of ok=false> }`.
  - `POST /admin/bookings/:reference/deposit-refund`, no body. It returns the detail.
    - It needs a saved inspection (else 409 `INSPECTION_REQUIRED` "Hãy lưu kết quả kiểm tra trả phòng trước khi hoàn cọc."), no open incident (else 409 `INCIDENT_OPEN` "Còn khoản hư hỏng chưa xử lý."), and held ≥ 1.000 ₫ (else 409 `NOTHING_TO_REFUND` "Không còn tiền cọc để hoàn.").
    - It refunds the held amount across the booking's succeeded `asset_security` payments, the largest refundable first, inside one transaction with the booking locked.
    - Each refund has the reason "Hoàn cọc sau kiểm tra trả phòng". It adds the event `deposit_refunded` with `{ amount }`, runs `recalculate`, and queues the existing refund email once with the total.
    - Put the money part in `paymentService.refundDeposit(reference, admin)` and reuse `paymentRepository.insertRefund`.
- Admin apartment edit accepts `inspectionChecklist` (zod: ≤ 20 rooms, each with 1–60 items, strings 1–120 chars) and returns it in the admin apartment shape.
- Summary (`bookingsAwaitingPayment`): each item gains `depositFirst: boolean`, and for deposit-first bookings `depositAmount` is the `asset_security_amount`.

Default checklist (Sun Garden A04-12, drafted from its amenities; the owner can edit it):

```ts
export const DEFAULT_INSPECTION_CHECKLIST: InspectionChecklist = [
  { room: 'Phòng khách', items: ['Sofa (giường sofa)', 'TV màn hình phẳng và điều khiển', 'Quạt trần', 'Bàn làm việc', 'Rèm cửa', 'Đèn'] },
  { room: 'Bếp', items: ['Bếp từ đôi', 'Máy hút mùi', 'Tủ lạnh', 'Ấm siêu tốc', 'Nồi, chảo, dụng cụ nấu ăn', 'Bộ bát đũa, ly', 'Bồn rửa và vòi nước'] },
  { room: 'Phòng ngủ 1', items: ['Giường và nệm', 'Chăn, ga, gối', 'Tủ quần áo và móc treo', 'Rèm cửa', 'Đèn'] },
  { room: 'Phòng ngủ 2', items: ['Giường và nệm', 'Chăn, ga, gối', 'Tủ quần áo và móc treo', 'Rèm cửa', 'Đèn'] },
  { room: 'Phòng tắm', items: ['Máy nóng lạnh', 'Vòi sen', 'Bồn cầu', 'Lavabo và gương', 'Khăn tắm'] },
  { room: 'Giặt phơi', items: ['Máy giặt / sấy', 'Giá phơi đồ'] },
  { room: 'Ban công', items: ['Cửa ban công và khoá', 'Lan can'] },
  { room: 'Chung', items: ['Chìa khoá / thẻ ra vào', 'Bộ phát Wi-Fi', 'Dép lê (4 đôi)', 'Quạt cây', 'Bình chữa cháy', 'Thiết bị báo cháy', 'Không có mùi khói thuốc', 'Rác đã được bỏ', 'Điện, nước đã tắt'] },
];
```

- [ ] **Step 1: Failing tests** in `inspection.test.ts`:
  - `checklistFor({ inspectionChecklist: [] })` returns the default;
  - a custom list is returned as is;
  - a pure helper `depositRefundPlan(payments: { id: string; refundable: number }[], held: number): { paymentId: string; amount: number }[]` splits 900k held over refundables `[500k, 600k]` as `[{600k payment: 600k}, {500k payment: 300k}]`, returns `[]` for held 0, and never exceeds a payment's refundable amount.
- [ ] **Step 2: Implement** the module, the repository (`get(bookingId, db?)`, `upsert(bookingId, results, adminId, db)`), the routes, `refundDeposit` (using `depositRefundPlan`), the apartment checklist field, and the summary change.
- [ ] **Step 3: Extend `transfer-report.test.ts`** (or add `deposit-refund.test.ts` with the same `TEST_DATABASE_URL` guard and setup) to cover: deposit verified → booking marked completed (call the check-out route or service) → inspection saved → deposit refund records refunds equal to the held amount → a second refund gives 409 `NOTHING_TO_REFUND`.
- [ ] **Step 4: Run** `cd backend && npm run typecheck && npm run build && TEST_DATABASE_URL=postgresql://localhost/real_estate_test npm test`. Commit with "Add the check-out inspection checklist and a one-step deposit refund".

---

### Task 4: Guest pages: deposit, rent and refund, and the policy checkbox

**Files:**
- Modify: `frontend/real-estate/src/app/models/booking.ts` (`GuestBooking.depositFirst`, `rentDueFrom`)
- Modify: `frontend/real-estate/src/app/services/booking.service.ts` (`reportTransfer(reference, option, screenshot, sendAnyway, acceptPolicy)` sends `&acceptPolicy=true`)
- Modify: `frontend/real-estate/src/app/pages/booking-payment/booking-payment.{ts,html}`
- Modify: `frontend/real-estate/src/app/pages/booking-confirmation/booking-confirmation.{ts,html}`
- Modify: `frontend/real-estate/src/app/pages/booking-review/booking-review.{ts,html}`
- Modify: `frontend/real-estate/src/i18n/vi.json`, `en.json`
- Test: `frontend/real-estate/src/app/pages/booking-payment/booking-payment.spec.ts` (create)

**Interfaces:**
- Consumes the Task 2 API (`depositFirst`, `rentDueFrom`, `acceptPolicy`, the `RENT_NOT_DUE_YET` and `POLICY_NOT_ACCEPTED` codes).
- The policy route `/policy` comes from Task 5; link to it with `routerLink="/policy"`.

- [ ] **Step 1: Payment page.**
  - Add `protected readonly acceptedPolicy = signal(false)`. `canSubmit` also requires it.
  - Above the continue button (and above "send anyway"), add a checkbox row: `<input type="checkbox" id="accept-policy" [checked]="acceptedPolicy()" (change)="acceptedPolicy.set($any($event.target).checked)" class="mt-1 h-5 w-5 accent-accent-deep" />` with a `<label for="accept-policy">`. The label reads "Tôi đã đọc và đồng ý với" followed by `<a routerLink="/policy" target="_blank" rel="noopener" class="underline underline-offset-4">chính sách lưu trú</a>` (en: "I have read and agree to the" + "house rules & policies"). The checkbox and label need a ≥ 44 px tap area.
  - When a screenshot is picked but the box is unticked, show the hint "Vui lòng đánh dấu đồng ý với chính sách lưu trú để tiếp tục.".
  - `submit` passes `true` for `acceptPolicy`. The API code `POLICY_NOT_ACCEPTED` shows its message.
  - Amount cards:
    - `options.assetSecurity` is labelled "Tiền đặt cọc ({{percent}}%)", with `b.quote.depositPercent`.
    - Its note: "Giữ lịch cho bạn. Hoàn lại khi trả phòng, sau khi kiểm tra căn hộ."
    - When `b.depositFirst`, show a second muted line: "Tiền phòng {{amount}} ₫ thanh toán từ ngày nhận phòng {{date}}" (`b.rentDueFrom`).
    - For a deposit-first `full` option, the label is "Tiền phòng" and the note is "Thanh toán đủ tiền phòng khi nhận phòng.".
  - `expired()` becomes: `status === 'expired'`, or `status === 'pending'` with no pending transfer and every option null.
  - Nothing payable and `b.depositFirst` and `b.rentDueFrom` in the future: show a card "Đặt phòng đã được xác nhận" with "Tiền phòng thanh toán từ ngày {{date}}. Chúng tôi sẽ gửi email nhắc vào sáng ngày nhận phòng." and the view-booking button, instead of "contact the owner".
  - `checkForPayment` also navigates to the confirmation page when the status changes from `pending` to `confirmed`.
- [ ] **Step 2: Confirmation page.** For `b.depositFirst`, show a three-step money timeline in a paper panel, replacing the old asset section where it overlaps:
  1. **Tiền đặt cọc** `{{b.financials.assetSecurityRequired | number}} ₫`: "Đã nhận" when `assetSecurityReceived ≥ required`, "Đang kiểm tra" when the pending transfer has purpose `asset_security`, otherwise "Chưa thanh toán".
  2. **Tiền phòng** `{{b.quote.total | number}} ₫`: "Đã thanh toán" when `amountDue === 0`. Otherwise "Thanh toán từ ngày {{rentDueFrom | date: 'dd/MM/yyyy'}}", with a primary button "Thanh toán tiền phòng" to `/book/payment?ref=` when `paymentOptions.full !== null`.
  3. **Hoàn cọc**: "Sau khi trả phòng và kiểm tra căn hộ". When refunded (`assetSecurityRefunded > 0`) show "Đã hoàn {{amount}} ₫". If deposit was applied to damage, list the incidents (as the existing section does).
  
  Legacy bookings keep the current page.
- [ ] **Step 3: Review page (step 2, before the booking exists).** When `quote.deposit > 0`, the summary shows "Thanh toán bây giờ: Tiền đặt cọc {{deposit}} ₫ ({{percent}}%)", then "Tiền phòng {{total}} ₫: thanh toán khi nhận phòng", then "Tiền cọc được hoàn lại khi trả phòng", then a link "Xem chính sách lưu trú" to `/policy`.
- [ ] **Step 4: i18n.** Add every new string to both `vi.json` and `en.json`. Reuse keys where they fit. Never add a duplicate key, and check with a JSON parse that each file has no duplicate key at the same level.
- [ ] **Step 5: Tests** in `booking-payment.spec.ts`, with a stubbed `BookingService`:
  - the continue button stays disabled with a screenshot picked until the policy box is ticked;
  - a deposit-first pending booking shows only the deposit card with the rent line;
  - a deposit-first confirmed booking before check-in shows the "confirmed, rent from" card, not "contact the owner".
- [ ] **Step 6: Run** `cd frontend/real-estate && npx ng test --watch=false && npx ng build`. Commit with "Show deposit, rent and refund to guests and require the policy before paying".

---

### Task 5: Policy page

**Files:**
- Create: `frontend/real-estate/src/app/pages/policy/policy.{ts,html}`
- Create: `frontend/real-estate/src/app/pages/policy/policy.spec.ts`
- Modify: `frontend/real-estate/src/app/app.routes.ts` (route `policy`, Tier 2, no `data: STORY`; title and meta description keys like the other routes)
- Modify: `frontend/real-estate/src/app/components/site-footer/site-footer.html` (link)
- Modify: `frontend/real-estate/src/app/pages/apartment-detail/apartment-detail.html` (link under the rules list: "Xem toàn bộ chính sách lưu trú →")
- Modify: the guest identity form component (`frontend/real-estate/src/app/components/guest-identity-form/`): link "Vì sao cần thông tin này?" to `/policy` with fragment `item-4` (`routerLink="/policy" fragment="item-4"`, never a raw `href="#…"`)
- Modify: `vi.json`, `en.json`

**Content:**
- **The 21 items**, Vietnamese exactly as written by the team, in `policy.items` as an ordered list of `{ "title": string, "body": string[] }`. Each body entry is one paragraph or one list line.
  - **Item 2:** use `{{percent}}` where the text says 20%, filled with the deposit percent of the published apartment from `ApartmentService` (fallback 20).
  - **Item 3:** the main-column text, with its two clauses as two paragraphs.
  - **Item 21:** five numbered steps plus the closing line. Render the steps as `<ol>` (mark them with a `steps` array).
- **English:** a faithful, warm translation of every item with the same structure.
- Do not publish the internal notes: Chị Tiên's alternative wording, the 250k extra-guest idea, the children under 12 / 12–17 rules, the pet-surcharge idea, and the "link tham khảo" note.

The Vietnamese source (the main column) is in `.superpowers/sdd/2026-10-14-deposit-first-payments/policy-source.md`. The controller writes that file before dispatching this task.

**Page:**
- `<h1>` "Chính sách lưu trú" / "House rules & policies", a short intro, and "Cập nhật 14/10/2026".
- A two-column layout on desktop: a sticky list of item links on the left (routerLink with fragment), the items on the right, each an `<article id="item-N">` with `<h2>` "N. Title".
- Use the guest tokens and classes (`.label-caps`, `.display-section`, `.panel`); no motion.
- The page must render fully on the server (SSR).

- [ ] **Step 1: Failing test** in `policy.spec.ts`: the page renders 21 `article[id^="item-"]`, `#item-2` contains the apartment's percent (stub `ApartmentService` with 25 and expect "25%"), and `#item-21` has an `ol` with 5 `li`.
- [ ] **Step 2: Implement.** Use `TranslocoService.translateObject('policy.items', { percent })` or the existing loader pattern. Read how other pages read translations, and keep it SSR-safe.
- [ ] **Step 3: Run** `npx ng test --watch=false && npx ng build`. Open `/policy` and `/en/policy` on the dev site (the controller runs one on :4377) to check them. Commit with "Add the house rules and policies page and link it from the booking flow".

---

### Task 6: Admin: checklist editor, inspection, Hoàn cọc, dashboard

**Files:**
- Create: `frontend/real-estate/src/app/admin/inspection-checklist.ts`, `inspection-checklist.spec.ts`
- Modify: `frontend/real-estate/src/app/admin/admin.types.ts`, `admin-api.service.ts`
- Modify: `frontend/real-estate/src/app/admin/pages/apartment-edit/apartment-edit.{ts,html}`
- Modify: `frontend/real-estate/src/app/admin/pages/booking-detail/booking-detail.{ts,html}`
- Modify: `frontend/real-estate/src/app/admin/pages/dashboard/dashboard.ts`
- Modify: the payment-status labels (`deposit_paid` → "Đã đặt cọc"). Find where `PAYMENT_STATUS_LABELS` (or similar) is defined.

**Interfaces:**
- `parseChecklist(text: string): InspectionChecklist` and `formatChecklist(list: InspectionChecklist): string`. A non-empty line not starting with `-` starts a room; a `- item` line adds an item to the current room; blank lines are ignored; item lines before any room go under "Chung"; rooms without items are dropped.
- API: `saveInspection(reference, results)` sends PUT `/admin/bookings/:ref/inspection`; `refundDeposit(reference)` sends POST `/admin/bookings/:ref/deposit-refund`.

- [ ] **Step 1: Failing tests** for parse/format: a round trip of the default-shaped list; item lines before a room go to "Chung"; blank lines and empty rooms are dropped.
- [ ] **Step 2: Apartment edit.**
  - Remove the long-stay security field.
  - Add the textarea "Danh sách kiểm tra trả phòng". Its help text: "Mỗi phòng một dòng, các vật dụng bắt đầu bằng dấu -". Fill it from `formatChecklist(apartment.inspectionChecklist)`. When the list is empty, show the default that the API returns (`checklist` on the booking detail, or a new `defaultInspectionChecklist` on the apartment admin shape; pick the simpler one and say which in the report).
  - On save, send `parseChecklist(text)`.
- [ ] **Step 3: Booking detail.**
  - Add the section "Kiểm tra trả phòng" for confirmed or completed bookings from check-in day on.
  - It shows each room with its items as rows, each with an "OK" / "Có vấn đề" toggle and a note field shown when there is a problem. Rows are prefilled from `inspection.results`, or all OK.
  - It has "Lưu kết quả kiểm tra" and shows the last saved time and who saved it.
  - When some rows have problems, show a hint pointing at the existing incident form ("Ghi nhận hư hỏng").
  - Add the button "Hoàn cọc {{depositRefundable | number}} ₫" with a confirm step. It is disabled with a reason when there is no saved inspection, an incident is open, or nothing is held.
  - For deposit-first bookings, show the money as three lines: Tiền đặt cọc (received / applied / refunded / held), Tiền phòng (paid / due from check-in), and Hư hỏng (if any).
- [ ] **Step 4: Dashboard.** For awaiting-payment items with `depositFirst`, show only "Đã nhận cọc {{depositAmount}} ₫". It records `{ method: 'bank_transfer', purpose: 'asset_security', amount: depositAmount }`, and there is no "Đã nhận đủ" button. Legacy items are unchanged.
- [ ] **Step 5: Run** `npx ng test --watch=false && npx ng build`. Commit with "Give the owner a check-out checklist and a one-step deposit refund".

---

### Task 7: Domain docs

**Files:**
- Modify: `CONTEXT.md` (Deposit redefined; add Rent, Inspection, Deposit refund and Legacy booking, each with *Avoid* lists in the existing style)
- Create: `docs/adr/0003-deposit-first-payments.md` (context, decision, consequences: revenue excludes the deposit, legacy bookings are unchanged, the deposit percent is per apartment, the tiers are deferred)
- Modify: `UX-CONTRACT.md` (business-context source rows for the policy and the deposit-first model)

- [ ] **Step 1:** Write them in the voice of the existing documents and commit with "Record the deposit-first payment model".
