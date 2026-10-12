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

**Deposit**:
The part of the price (a percentage set per apartment) a guest may pay up front instead of the full price; the rest is due at check-in.
_Avoid_: Down payment, advance

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
