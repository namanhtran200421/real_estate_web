-- Admin sessions also end after a stretch without activity (ADMIN_IDLE_MINUTES), not only at their
-- absolute expiry, and the owner can see each signed-in device and sign it out.
ALTER TABLE admin_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX admin_sessions_admin_idx ON admin_sessions (admin_id);

COMMENT ON COLUMN admin_sessions.last_seen_at IS 'Last authenticated request; the session ends ADMIN_IDLE_MINUTES after it';
