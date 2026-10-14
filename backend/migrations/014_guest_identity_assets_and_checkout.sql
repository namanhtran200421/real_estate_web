-- Guest registration details, long-stay asset security, incident charges and actual check-out.
-- Identity documents are encrypted by the application before they reach PostgreSQL.

CREATE TYPE payment_purpose AS ENUM ('accommodation', 'asset_security', 'incident');
CREATE TYPE asset_incident_status AS ENUM ('open', 'settled', 'waived');

ALTER TABLE apartments
  ADD COLUMN long_stay_security_amount integer NOT NULL DEFAULT 0
    CHECK (long_stay_security_amount >= 0);

ALTER TABLE bookings
  ADD COLUMN asset_security_amount integer NOT NULL DEFAULT 0
    CHECK (asset_security_amount >= 0),
  ADD COLUMN actual_check_out_at timestamptz,
  ADD COLUMN checkout_reminder_sent_at timestamptz,
  ADD COLUMN late_checkout_alert_sent_at timestamptz;

ALTER TABLE payments
  ADD COLUMN purpose payment_purpose NOT NULL DEFAULT 'accommodation';

CREATE INDEX payments_booking_purpose_idx
  ON payments (booking_id, purpose, state);

CREATE TABLE booking_guest_identities (
  booking_id        uuid        NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  guest_index       smallint    NOT NULL CHECK (guest_index >= 0),
  encrypted_payload text        NOT NULL,
  purge_after       timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, guest_index)
);

CREATE INDEX booking_guest_identities_purge_idx
  ON booking_guest_identities (purge_after);

CREATE TABLE booking_asset_incidents (
  id               uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid                  NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  description      text                  NOT NULL,
  amount           integer               NOT NULL CHECK (amount > 0),
  security_applied integer               NOT NULL DEFAULT 0 CHECK (security_applied >= 0),
  status           asset_incident_status NOT NULL DEFAULT 'open',
  created_by       uuid                  REFERENCES admin_users (id) ON DELETE SET NULL,
  resolved_by      uuid                  REFERENCES admin_users (id) ON DELETE SET NULL,
  resolved_at      timestamptz,
  created_at       timestamptz           NOT NULL DEFAULT now(),
  updated_at       timestamptz           NOT NULL DEFAULT now(),

  CHECK (security_applied <= amount),
  CHECK ((status = 'open') = (resolved_at IS NULL))
);

CREATE INDEX booking_asset_incidents_booking_idx
  ON booking_asset_incidents (booking_id, created_at);

CREATE TRIGGER booking_asset_incidents_set_updated_at
BEFORE UPDATE ON booking_asset_incidents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX bookings_checkout_attention_idx
  ON bookings (check_out)
  WHERE status = 'confirmed' AND actual_check_out_at IS NULL;
