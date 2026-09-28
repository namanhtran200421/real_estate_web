/**
 * Payments and refunds data access.
 *
 * A payment is either reported by the guest ("I have transferred", state `pending`) and then
 * verified or rejected by the owner, or recorded directly by the owner (state `succeeded`).
 */
import { query, queryOne, type Db } from '../../db/pool.js';
import type { PaymentProvider, PaymentState } from '../bookings/booking.types.js';

export interface PaymentRecord {
  id: string;
  bookingId: string;
  provider: PaymentProvider;
  amount: number;
  state: PaymentState;
  failureReason: string | null;
  note: string | null;
  /** Email of the admin who recorded or verified it. */
  recordedBy: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface RefundRecord {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  createdBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

const PAYMENT_COLUMNS = `
  p.id, p.booking_id AS "bookingId", p.provider, p.amount, p.state,
  p.failure_reason AS "failureReason", p.note, u.email AS "recordedBy",
  p.paid_at AS "paidAt", p.created_at AS "createdAt"
`;

const FROM_PAYMENTS = 'FROM payments p LEFT JOIN admin_users u ON u.id = p.recorded_by';

const REFUND_COLUMNS = `
  r.id, r.payment_id AS "paymentId", r.amount, r.reason, u.email AS "createdBy",
  r.completed_at AS "completedAt", r.created_at AS "createdAt"
`;

const FROM_REFUNDS = 'FROM refunds r LEFT JOIN admin_users u ON u.id = r.created_by';

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** The guest says they transferred `amount`; waits for the owner to check the bank account. */
async function insertReported(bookingId: string, amount: number, note: string, db: Db): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO payments (booking_id, provider, amount, state, note) VALUES ($1, 'bank_transfer', $2, 'pending', $3) RETURNING id`,
    [bookingId, amount, note],
    db,
  );
  return row!.id;
}

/** Money the owner received and records directly (cash, or a transfer the guest did not report). */
async function insertManual(
  payment: { bookingId: string; provider: PaymentProvider; amount: number; note: string | undefined; recordedBy: string },
  db: Db,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO payments (booking_id, provider, amount, state, note, recorded_by, paid_at)
     VALUES ($1, $2, $3, 'succeeded', $4, $5, now())
     RETURNING id`,
    [payment.bookingId, payment.provider, payment.amount, payment.note ?? null, payment.recordedBy],
    db,
  );
  return row!.id;
}

async function findById(id: string, db?: Db, lock = false): Promise<PaymentRecord | undefined> {
  let sql = `SELECT ${PAYMENT_COLUMNS} ${FROM_PAYMENTS} WHERE p.id = $1`;
  if (lock) sql += ' FOR UPDATE OF p';
  return queryOne<PaymentRecord>(sql, [id], db);
}

async function listForBooking(bookingId: string, db?: Db): Promise<PaymentRecord[]> {
  return query<PaymentRecord>(`SELECT ${PAYMENT_COLUMNS} ${FROM_PAYMENTS} WHERE p.booking_id = $1 ORDER BY p.created_at`, [bookingId], db);
}

/** The transfer the guest reported and the owner has not checked yet, if any. */
async function findPendingForBooking(bookingId: string, db?: Db): Promise<PaymentRecord | undefined> {
  return queryOne<PaymentRecord>(
    `SELECT ${PAYMENT_COLUMNS} ${FROM_PAYMENTS} WHERE p.booking_id = $1 AND p.state = 'pending' ORDER BY p.created_at DESC LIMIT 1`,
    [bookingId],
    db,
  );
}

/** The owner saw the money arrive; `amount` is what actually arrived. */
async function markVerified(id: string, amount: number, adminId: string, db: Db): Promise<void> {
  await query(
    `UPDATE payments SET state = 'succeeded', amount = $2, recorded_by = $3, paid_at = now(), failure_reason = NULL WHERE id = $1`,
    [id, amount, adminId],
    db,
  );
}

async function markFailed(id: string, reason: string, adminId: string | null, db: Db): Promise<void> {
  await query(`UPDATE payments SET state = 'failed', failure_reason = $2, recorded_by = $3 WHERE id = $1`, [
    id,
    reason.slice(0, 500),
    adminId,
  ], db);
}

/** Closes unchecked reports of a booking that is being cancelled. */
async function failPendingForBooking(bookingId: string, reason: string, db: Db): Promise<void> {
  await query(`UPDATE payments SET state = 'failed', failure_reason = $2 WHERE booking_id = $1 AND state = 'pending'`, [bookingId, reason], db);
}

/** Money received and refunded for a booking. */
async function totals(bookingId: string, db: Db): Promise<{ received: number; refunded: number }> {
  const row = await queryOne<{ received: number; refunded: number }>(
    `SELECT
       (SELECT coalesce(sum(amount), 0)::int FROM payments WHERE booking_id = $1 AND state = 'succeeded') AS received,
       (SELECT coalesce(sum(r.amount), 0)::int FROM refunds r JOIN payments p ON p.id = r.payment_id
         WHERE p.booking_id = $1 AND r.state = 'succeeded') AS refunded`,
    [bookingId],
    db,
  );
  return row!;
}

// ---------------------------------------------------------------------------
// Refunds (made by the owner, recorded here)
// ---------------------------------------------------------------------------

async function insertRefund(refund: { paymentId: string; amount: number; reason: string; createdBy: string }, db: Db): Promise<void> {
  await query(
    `INSERT INTO refunds (payment_id, amount, reason, created_by, state, completed_at) VALUES ($1, $2, $3, $4, 'succeeded', now())`,
    [refund.paymentId, refund.amount, refund.reason, refund.createdBy],
    db,
  );
}

async function refundedTotal(paymentId: string, db: Db): Promise<number> {
  const row = await queryOne<{ total: number }>(
    `SELECT coalesce(sum(amount), 0)::int AS total FROM refunds WHERE payment_id = $1 AND state = 'succeeded'`,
    [paymentId],
    db,
  );
  return row!.total;
}

async function listRefundsForBooking(bookingId: string): Promise<RefundRecord[]> {
  return query<RefundRecord>(
    `SELECT ${REFUND_COLUMNS} ${FROM_REFUNDS}
     JOIN payments p ON p.id = r.payment_id
     WHERE p.booking_id = $1 AND r.state = 'succeeded'
     ORDER BY r.created_at`,
    [bookingId],
  );
}

export const paymentRepository = {
  insertReported,
  insertManual,
  findById,
  listForBooking,
  findPendingForBooking,
  markVerified,
  markFailed,
  failPendingForBooking,
  totals,
  insertRefund,
  refundedTotal,
  listRefundsForBooking,
};
