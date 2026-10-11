-- Guests no longer report their transfer: they scan the VietQR code and pay, and the owner
-- confirms once the money shows in the bank app. The owner is emailed when a booking is made
-- and reminded once shortly before its hold runs out; this records that reminder.
ALTER TABLE bookings ADD COLUMN owner_reminded_at timestamptz;

COMMENT ON COLUMN bookings.owner_reminded_at IS 'When the owner was reminded that this unpaid booking''s hold is about to run out';
