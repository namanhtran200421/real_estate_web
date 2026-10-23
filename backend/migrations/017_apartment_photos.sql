-- Listing photos are durable public content, separate from private transfer screenshots.
-- Content hashes deduplicate retries and make photo URLs immutable.
CREATE TABLE apartment_photos (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);
