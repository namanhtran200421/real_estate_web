-- Performance and hardening (September 2026).

-- Admin dashboard aggregates: revenue this month, and contact messages still to handle.
CREATE INDEX payments_succeeded_paid_at_idx     ON payments (paid_at)         WHERE state = 'succeeded';
CREATE INDEX refunds_succeeded_completed_at_idx ON refunds (completed_at)     WHERE state = 'succeeded';
CREATE INDEX contact_messages_unhandled_idx     ON contact_messages (created_at DESC) WHERE handled_at IS NULL;

-- Email retention job (purge-emails): finds finished outbox rows by age.
CREATE INDEX email_outbox_created_at_idx ON email_outbox (created_at);

-- Defence in depth: the API already bounds these guest-typed fields; the database now refuses
-- oversized values from any other path too. Existing rows are checked when this runs.
ALTER TABLE bookings
  ADD CONSTRAINT bookings_customer_name_length  CHECK (char_length(customer_name) BETWEEN 1 AND 120),
  ADD CONSTRAINT bookings_customer_email_length CHECK (char_length(customer_email) BETWEEN 3 AND 254),
  ADD CONSTRAINT bookings_customer_phone_length CHECK (char_length(customer_phone) BETWEEN 6 AND 20),
  ADD CONSTRAINT bookings_message_length        CHECK (message IS NULL OR char_length(message) <= 1000);

ALTER TABLE contact_messages
  ADD CONSTRAINT contact_messages_name_length    CHECK (char_length(name) BETWEEN 1 AND 120),
  ADD CONSTRAINT contact_messages_topic_length   CHECK (char_length(topic) BETWEEN 1 AND 80),
  ADD CONSTRAINT contact_messages_message_length CHECK (char_length(message) BETWEEN 1 AND 3000);
