-- A guest may have only one active booking for any overlapping stay, including
-- when requests for different apartments arrive concurrently. Email is stored
-- lowercase by the API; lower() also covers rows created before that rule.
-- Adjacent stays remain valid because check_out is exclusive.
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_guest_email_overlap EXCLUDE USING gist (
    (lower(customer_email)) WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_guest_phone_overlap EXCLUDE USING gist (
    customer_phone WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));
