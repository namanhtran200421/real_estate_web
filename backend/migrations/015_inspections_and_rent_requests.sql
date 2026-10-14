-- Deposit-first payments: the check-out inspection, its checklist, and the check-in rent request.
ALTER TABLE apartments
  ADD COLUMN inspection_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  DROP COLUMN IF EXISTS long_stay_security_amount;

-- The owner's policy (14/10/2026): the security deposit is 20% of the rent. Sun Garden was seeded at 30%.
UPDATE apartments SET deposit_percent = 20 WHERE slug = 'sun-garden-a04-12';

ALTER TABLE bookings
  ADD COLUMN rent_request_sent_at timestamptz;

CREATE TABLE booking_inspections (
  booking_id   uuid        PRIMARY KEY REFERENCES bookings (id) ON DELETE CASCADE,
  results      jsonb       NOT NULL,
  inspected_by uuid        REFERENCES admin_users (id) ON DELETE SET NULL,
  inspected_at timestamptz NOT NULL DEFAULT now()
);
