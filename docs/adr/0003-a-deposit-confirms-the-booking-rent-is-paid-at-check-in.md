# A deposit confirms the booking; the rent is paid at check-in

A new booking asks only for a deposit: a percentage of the price set per apartment (20% by the owner's house rules of 14/10/2026). The owner's confirmation of that transfer confirms the booking. The full rent is paid by transfer from check-in day; the site emails the guest at 08:00 that morning and offers the rent on their booking page. At check-out the owner inspects the apartment against a checklist, charges any damage to the deposit, and refunds what is left in one step.

This is the owner's policy, written into the house rules guests agree to before paying. It replaces the earlier model, where the "deposit" was an optional part of the rent paid up front.

The deposit is money held as a guarantee, not income: it is kept apart from the rent (payment purpose `asset_security`, transfer note suffix `TS`), never counted as revenue, and refunded through its own guarded action, which needs the stay checked out, the rent paid, a saved inspection and no open incident. Bookings made before the change have no deposit amount and keep the old flow unchanged.

## Considered options

- **Deposit as part of the rent** (the old model): simpler, but leaves nothing to cover damage once the rent is spent, and does not match the policy the owner publishes.
- **A fixed deposit by stay length** (2.000.000 ₫ under 10 nights, 3.000.000 ₫ under 30): still being discussed by the owner's team. A percentage set per apartment covers today's policy; tiers can be added to the pricing rules later without changing the payment flow.
- **Taking the rent up front as well**: rejected by the owner; guests pay the rent when they arrive.

## Consequences

- The booking page and emails show three steps: deposit, rent from check-in day, deposit back at check-out.
- The owner's tools record a deposit first: recording rent on an unconfirmed deposit-first booking is refused, and a deposit larger than what is due is refused, so a guest is never asked to pay twice and rent is never refunded as deposit.
- The deposit percentage is per apartment; migration 015 sets Sun Garden to 20%.
