-- Payments move from MoMo/ZaloPay to direct bank transfer (VietQR) confirmed by the owner.
--
-- A guest who has transferred reports it: a `pending` bank_transfer payment. The owner checks the
-- bank account and marks it `succeeded` (money arrived, the booking is confirmed) or `failed`.
-- Money the owner receives in person is recorded directly as a `succeeded` cash / bank_transfer
-- payment. Refunds are made by the owner and recorded as `succeeded`.

-- Existing MoMo/ZaloPay rows: attempts that never completed moved no money and are dropped;
-- money that did arrive is kept, as a transfer, with a note saying how it was paid.
DELETE FROM payments WHERE provider IN ('momo', 'zalopay') AND state <> 'succeeded';
UPDATE payments
SET provider = 'bank_transfer', note = concat_ws(' · ', note, 'Thanh toán qua ' || provider::text)
WHERE provider IN ('momo', 'zalopay');

-- Provider-gateway bookkeeping is no longer needed.
ALTER TABLE payments
  DROP CONSTRAINT payments_check,
  DROP COLUMN provider_order_id,
  DROP COLUMN provider_transaction_id,
  DROP COLUMN pay_url,
  DROP COLUMN provider_data,
  DROP COLUMN last_checked_at;

ALTER TABLE refunds
  DROP COLUMN provider_refund_id,
  DROP COLUMN provider_data,
  DROP COLUMN last_checked_at;

DROP INDEX IF EXISTS refunds_pending_idx;

-- Only the payment methods still in use.
ALTER TYPE payment_provider RENAME TO payment_provider_old;
CREATE TYPE payment_provider AS ENUM ('bank_transfer', 'cash');
ALTER TABLE payments ALTER COLUMN provider TYPE payment_provider USING provider::text::payment_provider;
DROP TYPE payment_provider_old;

COMMENT ON COLUMN payments.recorded_by IS 'Admin who recorded or verified the payment';
COMMENT ON COLUMN payments.paid_at IS 'When the owner confirmed the money arrived';
