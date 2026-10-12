-- Guests report their transfer again, now with a screenshot from their bank app attached
-- (docs/adr/0001). Each screenshot sits beside the reported transfer it belongs to and is deleted
-- 35 days after upload unless the owner has yet to check that transfer (docs/adr/0002).
CREATE TABLE transfer_screenshots (
  payment_id   uuid        PRIMARY KEY REFERENCES payments (id) ON DELETE CASCADE,
  content_type text        NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data         bytea       NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 5242880),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Images are already compressed: store them out of line without trying to compress them again.
ALTER TABLE transfer_screenshots ALTER COLUMN data SET STORAGE EXTERNAL;

CREATE INDEX transfer_screenshots_created_idx ON transfer_screenshots (created_at);

COMMENT ON TABLE transfer_screenshots IS 'Screenshot of a reported bank transfer, taken by the guest; deleted 35 days after upload';
COMMENT ON COLUMN transfer_screenshots.content_type IS 'Read from the image bytes on upload, never from the request header';
