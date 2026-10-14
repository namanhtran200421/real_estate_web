# VN Booking Hub

Direct booking for one owner-run apartment in Đà Lạt: guests book online and pay by bank transfer, and the owner confirms each payment by hand.

## Language

### People

**Guest**:
The person who books a stay. Guests have no accounts; a booking is theirs through its reference and their email or phone.
_Avoid_: Customer, user, client

**Owner**:
The person who runs the apartment and the admin area, and the only one who can confirm money.
_Avoid_: Host, admin (when meaning the person), landlord

### Bookings

**Booking**:
A guest's request for one stay (dates, guest count, price), identified by its **Reference**.
_Avoid_: Reservation, order

**Reference**:
The code that identifies a booking, such as `RE-2611-K7Q3M`.
_Avoid_: Booking ID, code, order number

**Hold**:
The time an unpaid booking keeps its dates blocked for other guests. When it runs out the booking expires and the dates are free again.
_Avoid_: Reservation window, lock, timeout

**Deposit** (_Tiền đặt cọc_):
A guarantee of a percentage of the price (set per apartment; 20% by the house rules), paid when booking. Its arrival confirms the booking. It is held apart from the rent, is never revenue, and goes back to the guest after the check-out **Inspection**, minus any **Incident** charged to it. In code: payment purpose `asset_security`.
_Avoid_: Security, asset security, down payment, advance

**Rent** (_Tiền phòng_):
The price of the stay, paid in full by transfer from check-in day. In code: payment purpose `accommodation`.
_Avoid_: Balance, remainder, room charge

**Legacy booking**:
A booking made before deposits existed (no deposit amount). Its deposit was an optional part of the rent paid up front, and a rent payment confirms it.
_Avoid_: Old booking

**House rules** (_Chính sách lưu trú_):
The owner's 21 published rules and policies (`/policy`). A guest agrees to them each time they report a transfer, and the agreement is recorded with the version of the rules.
_Avoid_: Terms, T&C, policy page

### Check-out

**Inspection** (_Kiểm tra trả phòng_):
The owner's room-by-room check of the apartment's equipment at check-out, against the apartment's checklist. Each item is fine or has a problem with a note.
_Avoid_: Checklist (that is the list, not the check), audit

**Incident**:
Damage or loss found during a stay, with its cost. Part of the cost may be taken from the deposit; the rest the guest pays separately.
_Avoid_: Damage claim, fine, penalty

**Deposit refund** (_Hoàn cọc_):
Sending back what is still held of the deposit once the guest has checked out, the rent is paid, the inspection is saved and no incident is open. The owner makes the transfer and records it in one step.
_Avoid_: Return, release

### Payments

**Transfer note**:
The text a guest's bank transfer carries so the owner can match it to a booking: the reference without dashes.
_Avoid_: Memo, description, payment content

**Reported transfer**:
A transfer the guest says they made, waiting for the owner to find it in the bank app and verify or reject it. It does not count as money received until verified.
_Avoid_: Pending payment, unconfirmed payment

**Transfer screenshot**:
The picture of a successful transfer, taken in the guest's bank app, that a guest must attach to a reported transfer.
_Avoid_: Proof of payment, receipt, payment image, bill

**Screenshot check**:
The automatic reading of a transfer screenshot for signs of a bank transfer (the transfer note, the amount, banking words). It can flag an image that shows no transfer at all; it never confirms that money arrived.
_Avoid_: Receipt validation, fraud detection, fake detection

**Verify / Reject**:
The owner's answer to a reported transfer: the money arrived (it counts, and the booking is confirmed), or it did not (the guest gets a new hold to pay or explain).
_Avoid_: Approve, decline, accept
