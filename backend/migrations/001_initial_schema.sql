-- Initial schema: apartments, owner-blocked dates and bookings.
-- Money is stored in whole VND (integer), matching the frontend's `Pricing` model.

-- Lets the bookings exclusion constraint combine `=` on apartment_id with `&&` on date ranges.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Keeps `updated_at` current on every UPDATE without relying on application code.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Apartments
-- ---------------------------------------------------------------------------
CREATE TABLE apartments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                text        NOT NULL,
  area                text        NOT NULL,
  address             text        NOT NULL,
  map_query           text        NOT NULL,          -- search query for the embedded map
  tagline             text        NOT NULL,          -- one-line pitch shown on cards
  description         text[]      NOT NULL DEFAULT '{}',  -- one element per paragraph
  photos              jsonb       NOT NULL DEFAULT '[]',  -- ordered [{ src, alt }]; first is the cover
  guests              smallint    NOT NULL CHECK (guests > 0),
  bedrooms            smallint    NOT NULL CHECK (bedrooms >= 0),
  beds                smallint    NOT NULL CHECK (beds >= 0),
  bathrooms           smallint    NOT NULL CHECK (bathrooms >= 0),
  key_facilities      text[]      NOT NULL DEFAULT '{}',
  facilities          text[]      NOT NULL DEFAULT '{}',
  rules               text[]      NOT NULL DEFAULT '{}',
  nearby              jsonb       NOT NULL DEFAULT '[]',  -- [{ place, distance }]
  check_in_time       time        NOT NULL,
  check_out_time      time        NOT NULL,
  price_weekday       integer     NOT NULL CHECK (price_weekday >= 0),  -- Mon–Thu, per night
  price_weekend       integer     NOT NULL CHECK (price_weekend >= 0),  -- Fri–Sun, per night
  price_holiday       integer     NOT NULL CHECK (price_holiday >= 0),  -- per night
  price_weekly        integer     NOT NULL CHECK (price_weekly >= 0),
  price_monthly       integer     NOT NULL CHECK (price_monthly >= 0),
  long_stay_discounts jsonb       NOT NULL DEFAULT '[]',  -- [{ nights, percent }]
  sort_order          integer     NOT NULL DEFAULT 0,     -- display order; lowest is the default apartment
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CHECK (jsonb_typeof(photos) = 'array'),
  CHECK (jsonb_typeof(nearby) = 'array'),
  CHECK (jsonb_typeof(long_stay_discounts) = 'array')
);

CREATE INDEX apartments_sort_order_idx ON apartments (sort_order, name);

CREATE TRIGGER apartments_set_updated_at
BEFORE UPDATE ON apartments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Dates the owner closes manually (maintenance, personal use, bookings taken elsewhere).
-- ---------------------------------------------------------------------------
CREATE TABLE apartment_blocked_dates (
  apartment_id uuid        NOT NULL REFERENCES apartments (id) ON DELETE CASCADE,
  date         date        NOT NULL,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (apartment_id, date)
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE payment_status AS ENUM ('unpaid', 'deposit_paid', 'fully_paid', 'refunded');

CREATE TABLE bookings (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text           NOT NULL UNIQUE,  -- shown to guests, e.g. RE-2611-0042
  apartment_id    uuid           NOT NULL REFERENCES apartments (id) ON DELETE RESTRICT,
  check_in        date           NOT NULL,
  check_out       date           NOT NULL,         -- exclusive: the guest leaves this morning
  guests          smallint       NOT NULL CHECK (guests > 0),
  customer_name   text           NOT NULL,
  customer_phone  text           NOT NULL,
  customer_email  text           NOT NULL,
  message         text,
  deposit_percent smallint       NOT NULL CHECK (deposit_percent BETWEEN 0 AND 100),
  status          booking_status NOT NULL DEFAULT 'pending',
  payment_status  payment_status NOT NULL DEFAULT 'unpaid',
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),

  CHECK (check_out > check_in),

  -- The database itself refuses double bookings: two active bookings for the same apartment
  -- can never overlap, even if two requests race each other.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    apartment_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
  -- The GiST index behind this constraint also serves availability lookups.
);

CREATE TRIGGER bookings_set_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
