-- Booking flow, payments, refunds, owner administration, contact form and email outbox.

-- An unpaid booking whose payment window closed. Frees its dates (only pending/confirmed block them).
-- Postgres cannot use a new enum value in the transaction that adds it; nothing below does.
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'expired';

-- ---------------------------------------------------------------------------
-- Apartments: deposit rule and visibility
-- ---------------------------------------------------------------------------
ALTER TABLE apartments
  ADD COLUMN deposit_percent smallint NOT NULL DEFAULT 30 CHECK (deposit_percent BETWEEN 0 AND 100),
  ADD COLUMN is_active       boolean  NOT NULL DEFAULT true;  -- false hides it from the public site

-- ---------------------------------------------------------------------------
-- Holidays: nights on these dates use the holiday rate and get no long-stay discount.
-- Fixed-date national holidays are preloaded; the owner adds lunar ones (Tết, Giỗ Tổ) each year.
-- ---------------------------------------------------------------------------
CREATE TABLE holidays (
  date       date        PRIMARY KEY,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO holidays (date, name) VALUES
  ('2026-01-01', 'Tết Dương lịch'),
  ('2026-04-30', 'Ngày Giải phóng miền Nam'),
  ('2026-05-01', 'Quốc tế Lao động'),
  ('2026-09-02', 'Quốc khánh'),
  ('2027-01-01', 'Tết Dương lịch'),
  ('2027-04-30', 'Ngày Giải phóng miền Nam'),
  ('2027-05-01', 'Quốc tế Lao động'),
  ('2027-09-02', 'Quốc khánh');

-- ---------------------------------------------------------------------------
-- Admin accounts (the owner and staff) and their login sessions
-- ---------------------------------------------------------------------------
CREATE TABLE admin_users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  name          text        NOT NULL,
  password_hash text        NOT NULL,  -- scrypt, see src/modules/admin-auth/password.ts
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admin_users_email_idx ON admin_users (lower(email));

CREATE TRIGGER admin_users_set_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE admin_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid        NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  token_hash   text        NOT NULL UNIQUE,  -- SHA-256 of the bearer token; the token itself is never stored
  expires_at   timestamptz NOT NULL,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------
CREATE TABLE promo_codes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  description      text,
  discount_percent smallint    CHECK (discount_percent BETWEEN 1 AND 100),
  discount_amount  integer     CHECK (discount_amount > 0),        -- fixed VND off
  max_redemptions  integer     NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  min_nights       smallint    NOT NULL DEFAULT 1 CHECK (min_nights > 0),
  valid_from       date,
  valid_until      date,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Exactly one kind of discount.
  CHECK ((discount_percent IS NULL) <> (discount_amount IS NULL)),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE TRIGGER promo_codes_set_updated_at
BEFORE UPDATE ON promo_codes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings: price snapshot, payment progress and lifecycle timestamps.
-- Prices are frozen at booking time so later price changes never alter an existing booking.
-- ---------------------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN price_breakdown     jsonb       NOT NULL DEFAULT '{}',  -- nightly lines, discounts (see pricing.ts)
  ADD COLUMN subtotal            integer     NOT NULL CHECK (subtotal >= 0),
  ADD COLUMN discount_amount     integer     NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN total_amount        integer     NOT NULL CHECK (total_amount >= 0),
  ADD COLUMN deposit_amount      integer     NOT NULL CHECK (deposit_amount >= 0),
  ADD COLUMN amount_paid         integer     NOT NULL DEFAULT 0,  -- received minus refunded; kept by the payments service
  ADD COLUMN promo_code_id       uuid        REFERENCES promo_codes (id) ON DELETE RESTRICT,
  ADD COLUMN hold_expires_at     timestamptz,                     -- unpaid pending bookings expire at this time
  ADD COLUMN created_ip          inet,
  ADD COLUMN confirmed_at        timestamptz,
  ADD COLUMN cancelled_at        timestamptz,
  ADD COLUMN cancellation_reason text,
  ADD COLUMN completed_at        timestamptz,
  ADD CONSTRAINT bookings_deposit_within_total CHECK (deposit_amount <= total_amount);

CREATE INDEX bookings_status_check_in_idx ON bookings (status, check_in);
CREATE INDEX bookings_created_at_idx      ON bookings (created_at DESC);
CREATE INDEX bookings_hold_idx            ON bookings (hold_expires_at) WHERE hold_expires_at IS NOT NULL;
CREATE INDEX bookings_promo_code_idx      ON bookings (promo_code_id) WHERE promo_code_id IS NOT NULL;
CREATE INDEX bookings_customer_email_idx  ON bookings (lower(customer_email));
CREATE INDEX bookings_customer_phone_idx  ON bookings (customer_phone);

-- Audit trail shown on the admin booking page.
CREATE TABLE booking_events (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id uuid        NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  type       text        NOT NULL,  -- e.g. created, payment_succeeded, confirmed, cancelled
  actor      text        NOT NULL,  -- guest | system | momo | zalopay | admin email
  data       jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_events_booking_idx ON booking_events (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Payments and refunds
-- ---------------------------------------------------------------------------
CREATE TYPE payment_provider AS ENUM ('momo', 'zalopay', 'cash', 'bank_transfer');
CREATE TYPE payment_state    AS ENUM ('pending', 'succeeded', 'failed', 'expired');
CREATE TYPE refund_state     AS ENUM ('pending', 'succeeded', 'failed');

CREATE TABLE payments (
  id                      uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              uuid             NOT NULL REFERENCES bookings (id) ON DELETE RESTRICT,
  provider                payment_provider NOT NULL,
  amount                  integer          NOT NULL CHECK (amount > 0),
  state                   payment_state    NOT NULL DEFAULT 'pending',
  provider_order_id       text             UNIQUE,  -- MoMo orderId / ZaloPay app_trans_id
  provider_transaction_id text,                     -- MoMo transId / ZaloPay zp_trans_id, needed for refunds
  pay_url                 text,
  failure_reason          text,
  note                    text,                     -- manual payments: what the owner wrote
  recorded_by             uuid             REFERENCES admin_users (id) ON DELETE SET NULL,
  provider_data           jsonb,                    -- last payload from the provider, for audits and disputes
  last_checked_at         timestamptz,
  paid_at                 timestamptz,
  created_at              timestamptz      NOT NULL DEFAULT now(),
  updated_at              timestamptz      NOT NULL DEFAULT now(),

  -- Online payments are identified at the provider; manual ones never are.
  CHECK ((provider IN ('momo', 'zalopay')) = (provider_order_id IS NOT NULL))
);

CREATE INDEX payments_booking_idx ON payments (booking_id, created_at);
CREATE INDEX payments_pending_idx ON payments (created_at) WHERE state = 'pending';

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refunds (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id         uuid         NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
  amount             integer      NOT NULL CHECK (amount > 0),
  reason             text         NOT NULL,
  state              refund_state NOT NULL DEFAULT 'pending',
  provider_refund_id text         UNIQUE,  -- MoMo refund orderId / ZaloPay m_refund_id
  provider_data      jsonb,
  failure_reason     text,
  created_by         uuid         REFERENCES admin_users (id) ON DELETE SET NULL,
  last_checked_at    timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX refunds_payment_idx ON refunds (payment_id);
CREATE INDEX refunds_pending_idx ON refunds (created_at) WHERE state = 'pending';

CREATE TRIGGER refunds_set_updated_at
BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Contact form messages
-- ---------------------------------------------------------------------------
CREATE TABLE contact_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  phone        text        NOT NULL,
  email        text,
  topic        text        NOT NULL,
  apartment_id uuid        REFERENCES apartments (id) ON DELETE SET NULL,
  message      text        NOT NULL,
  ip           inet,
  handled_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_messages_created_idx ON contact_messages (created_at DESC);

-- ---------------------------------------------------------------------------
-- Email outbox: emails are written in the same transaction as the change they announce and
-- sent by a background job with retries, so a slow or failing email service never breaks a
-- booking and no email is lost when the process restarts.
-- ---------------------------------------------------------------------------
CREATE TABLE email_outbox (
  id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_address          text        NOT NULL,
  subject             text        NOT NULL,
  html                text        NOT NULL,
  text                text        NOT NULL,
  attempts            smallint    NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  provider_message_id text,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE sent_at IS NULL;
