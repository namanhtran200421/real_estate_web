-- One verified guest review per completed booking.
CREATE TABLE guest_reviews (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid        NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE CASCADE,
  apartment_id uuid        NOT NULL REFERENCES apartments (id) ON DELETE CASCADE,
  rating       smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      text        NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 20 AND 2000),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guest_reviews_apartment_created_idx ON guest_reviews (apartment_id, created_at DESC);
