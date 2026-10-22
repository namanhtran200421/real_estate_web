/**
 * Booking data access: bookings, their audit events, and the admin list and dashboard queries.
 */
import { isPgError, PG_ERROR, query, queryOne, type Db } from '../../db/pool.js';
import type { BookingEmailContext } from '../notifications/email.templates.js';
import type { PriceBreakdown } from '../pricing/pricing.js';
import { transferNote } from './booking.rules.js';
import { UNUSED_IDENTITY_RETENTION } from './guest-identity.repository.js';
import type {
  AdminBookingFilters,
  AdminBookingListItem,
  AdminStats,
  AdminSummary,
  AwaitingPayment,
  BalanceDue,
  BookingEvent,
  BookingRecord,
  BookingStatus,
  Page,
  PaymentStatus,
} from './booking.types.js';

interface BookingRow {
  id: string;
  reference: string;
  apartment_id: string;
  apartment_slug: string;
  apartment_name: string;
  check_in: string;
  check_out: string;
  guests: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  message: string | null;
  price_breakdown: PriceBreakdown;
  total_amount: number;
  deposit_amount: number;
  asset_security_amount: number;
  amount_paid: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  hold_expires_at: Date | null;
  promo_code_id: string | null;
  created_ip: string | null;
  created_at: Date;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  completed_at: Date | null;
  actual_check_out_at: Date | null;
  scheduled_check_out_at: Date;
}

const SELECT_BOOKING = `
  SELECT b.id, b.reference, b.apartment_id, a.slug AS apartment_slug, a.name AS apartment_name,
         b.check_in, b.check_out, b.guests, b.customer_name, b.customer_phone, b.customer_email,
         b.message, b.price_breakdown, b.total_amount, b.deposit_amount, b.amount_paid, b.status,
         b.payment_status, b.hold_expires_at, b.promo_code_id, host(b.created_ip) AS created_ip,
         b.created_at, b.confirmed_at, b.cancelled_at, b.cancellation_reason, b.completed_at,
         b.asset_security_amount,
         b.actual_check_out_at,
         ((b.check_out + a.check_out_time) AT TIME ZONE current_setting('TIMEZONE')) AS scheduled_check_out_at
  FROM bookings b
  JOIN apartments a ON a.id = b.apartment_id
`;

function toRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    reference: row.reference,
    apartmentId: row.apartment_id,
    apartmentSlug: row.apartment_slug,
    apartmentName: row.apartment_name,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    message: row.message,
    priceBreakdown: row.price_breakdown,
    totalAmount: row.total_amount,
    depositAmount: row.deposit_amount,
    assetSecurityAmount: row.asset_security_amount,
    amountPaid: row.amount_paid,
    status: row.status,
    paymentStatus: row.payment_status,
    holdExpiresAt: row.hold_expires_at,
    promoCodeId: row.promo_code_id,
    createdIp: row.created_ip,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    completedAt: row.completed_at,
    actualCheckOutAt: row.actual_check_out_at,
    scheduledCheckOutAt: row.scheduled_check_out_at,
  };
}

export interface NewBooking {
  reference: string;
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  customer: { name: string; phone: string; email: string };
  message: string | null;
  depositPercent: number;
  price: PriceBreakdown;
  promoCodeId: string | null;
  holdMinutes: number;
  /** Legacy part-payment of the rent; 0 for a deposit-first booking. */
  depositAmount: number;
  assetSecurityAmount: number;
  ip: string | undefined;
}

/**
 * @returns the new booking id, or undefined if the reference is already taken (the caller
 *          retries with a new one). Overlapping dates raise an exclusion violation.
 */
async function insert(booking: NewBooking, db: Db): Promise<string | undefined> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO bookings (
       reference, apartment_id, check_in, check_out, guests, customer_name, customer_phone,
       customer_email, message, deposit_percent, price_breakdown, subtotal, discount_amount,
       total_amount, deposit_amount, asset_security_amount, promo_code_id, hold_expires_at, created_ip
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17, now() + make_interval(mins => $18), $19)
     ON CONFLICT (reference) DO NOTHING
     RETURNING id`,
    [
      booking.reference,
      booking.apartmentId,
      booking.checkIn,
      booking.checkOut,
      booking.guests,
      booking.customer.name,
      booking.customer.phone,
      booking.customer.email,
      booking.message,
      booking.depositPercent,
      JSON.stringify(booking.price),
      booking.price.subtotal,
      booking.price.discountTotal,
      booking.price.total,
      booking.depositAmount,
      booking.assetSecurityAmount,
      booking.promoCodeId,
      booking.holdMinutes,
      booking.ip ?? null,
    ],
    db,
  );
  return row?.id;
}

/** @param lock hold a row lock until the transaction ends (use before changing the booking) */
async function findByReference(reference: string, db?: Db, lock = false): Promise<BookingRecord | undefined> {
  let sql = `${SELECT_BOOKING} WHERE b.reference = $1`;
  if (lock) sql += ' FOR UPDATE OF b';
  const row = await queryOne<BookingRow>(sql, [reference], db);
  if (!row) return undefined;
  return toRecord(row);
}

async function findById(id: string, db?: Db, lock = false): Promise<BookingRecord | undefined> {
  let sql = `${SELECT_BOOKING} WHERE b.id = $1`;
  if (lock) sql += ' FOR UPDATE OF b';
  const row = await queryOne<BookingRow>(sql, [id], db);
  if (!row) return undefined;
  return toRecord(row);
}

async function addEvent(bookingId: string, type: string, actor: string, data: object, db?: Db): Promise<void> {
  await query('INSERT INTO booking_events (booking_id, type, actor, data) VALUES ($1, $2, $3, $4)', [bookingId, type, actor, JSON.stringify(data)], db);
}

/** Whether the booking's history has an event of this type. */
async function hasEvent(bookingId: string, type: string, db?: Db): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM booking_events WHERE booking_id = $1 AND type = $2) AS exists',
    [bookingId, type],
    db,
  );
  return row!.exists;
}

async function listEvents(bookingId: string): Promise<BookingEvent[]> {
  const rows = await query<{ type: string; actor: string; data: Record<string, unknown>; created_at: Date }>(
    'SELECT type, actor, data, created_at FROM booking_events WHERE booking_id = $1 ORDER BY created_at, id',
    [bookingId],
  );
  return rows.map((row) => ({ type: row.type, actor: row.actor, data: row.data, createdAt: row.created_at.toISOString() }));
}

/**
 * Expires unpaid pending bookings whose hold ran out, freeing their dates, and records an
 * event for each. Their guests' identities are kept at most 3 more days (same statement). Runs
 * before every new booking (in its transaction) and as a background job.
 */
async function expireStaleHolds(db?: Db): Promise<number> {
  const rows = await query<{ id: string }>(
    `WITH expired AS (
       UPDATE bookings SET status = 'expired'
       WHERE status = 'pending' AND amount_paid = 0 AND hold_expires_at < now()
       RETURNING id
     ), identities AS (
       UPDATE booking_guest_identities SET purge_after = least(purge_after, now() + ${UNUSED_IDENTITY_RETENTION})
       WHERE booking_id IN (SELECT id FROM expired)
     )
     INSERT INTO booking_events (booking_id, type, actor)
     SELECT id, 'expired', 'system' FROM expired
     RETURNING booking_id AS id`,
    [],
    db,
  );
  return rows.length;
}

/**
 * Unpaid bookings whose hold runs out within `withinMinutes`, made at least that long ago (so a
 * short hold does not remind right after the new-booking email), not reminded yet. Marks them
 * reminded; run it in the transaction that queues the reminders.
 */
async function claimHoldsEndingSoon(withinMinutes: number, db: Db): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `UPDATE bookings SET owner_reminded_at = now()
     WHERE status = 'pending' AND amount_paid = 0 AND owner_reminded_at IS NULL
       AND hold_expires_at > now() AND hold_expires_at <= now() + make_interval(mins => $1)
       AND created_at <= now() - make_interval(mins => $1)
     RETURNING id`,
    [withinMinutes],
    db,
  );
  return rows.map((row) => row.id);
}

/**
 * Brings an expired booking back to pending: the owner saw its money after the hold ran out.
 * @returns false when another stay now holds the dates. The exclusion constraints refuse the
 *          change, and only that statement is undone (savepoint), not the caller's transaction.
 */
async function reactivate(id: string, db: Db): Promise<boolean> {
  await query('SAVEPOINT reactivate', [], db);
  try {
    await query(`UPDATE bookings SET status = 'pending', hold_expires_at = NULL WHERE id = $1 AND status = 'expired'`, [id], db);
    await query('RELEASE SAVEPOINT reactivate', [], db);
    return true;
  } catch (error) {
    if (!isPgError(error, PG_ERROR.exclusionViolation)) throw error;
    await query('ROLLBACK TO SAVEPOINT reactivate', [], db);
    return false;
  }
}

interface HoldIdentity {
  email: string;
  phone: string;
  ip: string | undefined;
}

/**
 * Serialize creation for any shared identity until this transaction commits. Row locks on
 * existing bookings cannot protect a count-and-insert budget when no matching row exists.
 * Always acquire the namespaced keys in lexical namespace order (email, IP, phone) to avoid
 * lock-order cycles. There is only one key in each namespace for a booking request.
 * PostgreSQL canonicalizes the IP exactly as it does for the budget's inet comparison.
 */
async function lockHoldBudget(identity: HoldIdentity, db: Db): Promise<void> {
  await query("SELECT pg_advisory_xact_lock(hashtextextended('booking-hold:email:' || lower($1), 0))", [identity.email], db);
  if (identity.ip) {
    await query("SELECT pg_advisory_xact_lock(hashtextextended('booking-hold:ip:' || host($1::inet), 0))", [identity.ip], db);
  }
  await query("SELECT pg_advisory_xact_lock(hashtextextended('booking-hold:phone:' || $1, 0))", [identity.phone], db);
}

/** Unpaid bookings blocking dates, including reported transfers awaiting the owner. */
async function countActiveHolds(identity: HoldIdentity, db: Db): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM bookings
     WHERE status = 'pending' AND amount_paid = 0
       AND (hold_expires_at IS NULL OR hold_expires_at > now())
       AND (lower(customer_email) = lower($1) OR customer_phone = $2 OR ($3::inet IS NOT NULL AND created_ip = $3::inet))`,
    [identity.email, identity.phone, identity.ip ?? null],
    db,
  );
  return row!.count;
}

/** Whether this email or phone already has an active stay on any overlapping dates. */
async function hasGuestOverlap(identity: { email: string; phone: string }, checkIn: string, checkOut: string, db: Db): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM bookings
       WHERE status IN ('pending', 'confirmed')
         AND check_in < $4::date AND check_out > $3::date
         AND (lower(customer_email) = lower($1) OR customer_phone = $2)
     ) AS exists`,
    [identity.email, identity.phone, checkIn, checkOut],
    db,
  );
  return row!.exists;
}

async function markConfirmed(id: string, db: Db): Promise<void> {
  await query(`UPDATE bookings SET status = 'confirmed', confirmed_at = now(), hold_expires_at = NULL WHERE id = $1`, [id], db);
}

async function markCancelled(id: string, reason: string, db: Db): Promise<void> {
  await query(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancellation_reason = $2, hold_expires_at = NULL
     WHERE id = $1`,
    [id, reason],
    db,
  );
}

async function markCompleted(id: string, db: Db): Promise<void> {
  await query(
    `UPDATE bookings
     SET status = 'completed', completed_at = now(), actual_check_out_at = coalesce(actual_check_out_at, now())
     WHERE id = $1`,
    [id],
    db,
  );
}

/** Holds the dates without a deadline (a reported transfer is being checked). */
async function clearHold(id: string, db: Db): Promise<void> {
  await query('UPDATE bookings SET hold_expires_at = NULL WHERE id = $1', [id], db);
}

/** Gives an unpaid booking a fresh payment deadline. */
async function holdForMinutes(id: string, minutes: number, db: Db): Promise<void> {
  await query('UPDATE bookings SET hold_expires_at = now() + make_interval(mins => $2) WHERE id = $1', [id, minutes], db);
}

/** Stores the money received so far; once anything is paid the dates are held without a deadline. */
async function setPaymentProgress(id: string, amountPaid: number, paymentStatus: PaymentStatus, db: Db): Promise<void> {
  await query(
    `UPDATE bookings
     SET amount_paid = $2, payment_status = $3,
         hold_expires_at = CASE WHEN $2 > 0 THEN NULL ELSE hold_expires_at END
     WHERE id = $1`,
    [id, amountPaid, paymentStatus],
    db,
  );
}

/**
 * Completes confirmed stays whose scheduled check-out passed more than 24 hours before `now`
 * without the owner recording it, with a `completed` event (reason `auto_after_checkout`). The
 * actual check-out time stays null: only the owner records it.
 */
async function completeFinishedStays(now: Date): Promise<number> {
  const rows = await query<{ id: string }>(
    `WITH done AS (
       UPDATE bookings b SET status = 'completed', completed_at = now()
       FROM apartments a
       WHERE a.id = b.apartment_id AND b.status = 'confirmed'
         AND ((b.check_out + a.check_out_time) AT TIME ZONE current_setting('TIMEZONE')) < $1::timestamptz - interval '24 hours'
       RETURNING b.id
     )
     INSERT INTO booking_events (booking_id, type, actor, data)
     SELECT id, 'completed', 'system', '{"reason":"auto_after_checkout"}'::jsonb FROM done
     RETURNING booking_id AS id`,
    [now],
  );
  return rows.length;
}

/** Claims upcoming check-outs once, so each guest receives at most one reminder. */
async function claimCheckoutReminders(db: Db): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `UPDATE bookings b SET checkout_reminder_sent_at = now()
     FROM apartments a
     WHERE a.id = b.apartment_id AND b.status = 'confirmed' AND b.actual_check_out_at IS NULL
       AND b.checkout_reminder_sent_at IS NULL
       AND ((b.check_out + a.check_out_time) AT TIME ZONE current_setting('TIMEZONE')) > now()
       AND ((b.check_out + a.check_out_time) AT TIME ZONE current_setting('TIMEZONE')) <= now() + interval '24 hours'
     RETURNING b.id`,
    [],
    db,
  );
  return rows.map((row) => row.id);
}

/**
 * Claims, once, the confirmed deposit-first bookings whose rent is still owed on check-in morning
 * (08:00 local time), unless the guest already reported a transfer for it or the stay is over.
 */
async function claimRentRequests(timezone: string, db: Db): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `UPDATE bookings b SET rent_request_sent_at = now()
     FROM apartments a
     WHERE a.id = b.apartment_id AND b.status = 'confirmed' AND b.asset_security_amount > 0
       AND b.total_amount - b.amount_paid >= 1000
       AND NOT EXISTS (
         SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.state = 'pending')
       AND b.rent_request_sent_at IS NULL
       AND ((b.check_in + time '08:00') AT TIME ZONE $1) <= now()
       AND ((b.check_out + a.check_out_time) AT TIME ZONE $1) > now()
     RETURNING b.id`,
    [timezone],
    db,
  );
  return rows.map((row) => row.id);
}

/** Claims check-outs at least 15 minutes late once, for an Owner alert. */
async function claimLateCheckoutAlerts(db: Db): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `UPDATE bookings b SET late_checkout_alert_sent_at = now()
     FROM apartments a
     WHERE a.id = b.apartment_id AND b.status = 'confirmed' AND b.actual_check_out_at IS NULL
       AND b.late_checkout_alert_sent_at IS NULL
       AND ((b.check_out + a.check_out_time) AT TIME ZONE current_setting('TIMEZONE')) <= now() - interval '15 minutes'
     RETURNING b.id`,
    [],
    db,
  );
  return rows.map((row) => row.id);
}

async function nextArrival(booking: BookingRecord, db?: Db): Promise<string | null> {
  const row = await queryOne<{ reference: string }>(
    `SELECT reference FROM bookings
     WHERE apartment_id = $1 AND check_in = $2 AND id <> $3
       AND status IN ('pending', 'confirmed')
       AND (status = 'confirmed' OR hold_expires_at IS NULL OR hold_expires_at > now())
     ORDER BY check_in, created_at LIMIT 1`,
    [booking.apartmentId, booking.checkOut, booking.id],
    db,
  );
  return row?.reference ?? null;
}

const EMAIL_CONTEXT_COLUMNS = `b.reference, b.customer_name AS "customerName", b.customer_email AS "customerEmail",
            b.customer_phone AS "customerPhone", a.name AS "apartmentName", a.address AS "apartmentAddress",
            b.check_in AS "checkIn", b.check_out AS "checkOut",
            to_char(a.check_in_time, 'HH24:MI') AS "checkInTime", to_char(a.check_out_time, 'HH24:MI') AS "checkOutTime",
            b.guests, (b.check_out - b.check_in) AS nights, b.total_amount AS total, b.deposit_amount AS deposit,
            b.asset_security_amount AS "assetSecurityAmount",
            (SELECT coalesce(sum(p.amount), 0)::int FROM payments p
              WHERE p.booking_id = b.id AND p.purpose = 'asset_security' AND p.state = 'succeeded')
            - (SELECT coalesce(sum(rf.amount), 0)::int FROM refunds rf JOIN payments p ON p.id = rf.payment_id
                WHERE p.booking_id = b.id AND p.purpose = 'asset_security' AND rf.state = 'succeeded') AS "depositReceivedNet",
            b.amount_paid AS "amountPaid", b.hold_expires_at AS "holdExpiresAt", b.status::text AS status, b.message`;

async function emailContext(bookingId: string, db?: Db): Promise<BookingEmailContext> {
  const row = await queryOne<BookingEmailContext>(
    `SELECT ${EMAIL_CONTEXT_COLUMNS}
     FROM bookings b JOIN apartments a ON a.id = b.apartment_id
     WHERE b.id = $1`,
    [bookingId],
    db,
  );
  return row!;
}

export interface BookingNotificationContext extends BookingEmailContext {
  id: string;
  nextArrivalReference: string | null;
}

/** All claimed notifications share one read, including the next arrival for late check-outs. */
async function emailContexts(bookingIds: string[], db?: Db): Promise<BookingNotificationContext[]> {
  if (bookingIds.length === 0) return [];
  return query<BookingNotificationContext>(
    `SELECT b.id, ${EMAIL_CONTEXT_COLUMNS}, arrival.reference AS "nextArrivalReference"
     FROM bookings b JOIN apartments a ON a.id = b.apartment_id
     LEFT JOIN LATERAL (
       SELECT n.reference FROM bookings n
       WHERE n.apartment_id = b.apartment_id AND n.check_in = b.check_out AND n.id <> b.id
         AND n.status IN ('pending', 'confirmed')
         AND (n.status = 'confirmed' OR n.hold_expires_at IS NULL OR n.hold_expires_at > now())
       ORDER BY n.check_in, n.created_at LIMIT 1
     ) arrival ON true
     WHERE b.id = ANY($1::uuid[])`,
    [bookingIds],
    db,
  );
}

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

interface ListRow {
  reference: string;
  apartment_slug: string;
  apartment_name: string;
  check_in: string;
  check_out: string;
  guests: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  total_amount: number;
  amount_paid: number;
  hold_expires_at: Date | null;
  created_at: Date;
  total_count: number;
}

const LIST_COLUMNS = `
  b.reference, a.slug AS apartment_slug, a.name AS apartment_name, b.check_in, b.check_out, b.guests,
  b.customer_name, b.customer_phone, b.customer_email, b.status, b.payment_status, b.total_amount,
  b.amount_paid, b.hold_expires_at, b.created_at
`;

function toListItem(row: Omit<ListRow, 'total_count'>): AdminBookingListItem {
  return {
    reference: row.reference,
    apartmentSlug: row.apartment_slug,
    apartmentName: row.apartment_name,
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    status: row.status,
    paymentStatus: row.payment_status,
    totalAmount: row.total_amount,
    amountPaid: row.amount_paid,
    holdExpiresAt: row.hold_expires_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

async function list(filters: AdminBookingFilters): Promise<Page<AdminBookingListItem>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.status) conditions.push(`b.status = ${param(filters.status)}`);
  if (filters.apartmentSlug) conditions.push(`a.slug = ${param(filters.apartmentSlug)}`);
  if (filters.from) conditions.push(`b.check_out > ${param(filters.from)}`);
  if (filters.to) conditions.push(`b.check_in <= ${param(filters.to)}`);
  if (filters.search) {
    const pattern = param(`%${filters.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    conditions.push(
      `(b.reference ILIKE ${pattern} OR b.customer_name ILIKE ${pattern} OR b.customer_email ILIKE ${pattern} OR b.customer_phone ILIKE ${pattern})`,
    );
  }

  let where = '';
  if (conditions.length > 0) where = `WHERE ${conditions.join(' AND ')}`;

  let order = 'b.created_at DESC';
  if (filters.sort === 'check_in') order = 'b.check_in, b.created_at';

  const rows = await query<ListRow>(
    `SELECT ${LIST_COLUMNS}, count(*) OVER ()::int AS total_count
     FROM bookings b JOIN apartments a ON a.id = b.apartment_id
     ${where}
     ORDER BY ${order}
     LIMIT ${param(filters.pageSize)} OFFSET ${param((filters.page - 1) * filters.pageSize)}`,
    params,
  );

  return {
    items: rows.map(toListItem),
    total: rows[0]?.total_count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/** Five independent reads, run in parallel on separate pool connections. */
async function summary(today: string, weekAhead: string): Promise<AdminSummary> {
  const countsQuery = queryOne<
    Omit<AdminSummary, 'arrivalsNext7Days' | 'transfersToCheck' | 'bookingsAwaitingPayment' | 'bookingsWithBalanceDue'>
  >(
    `SELECT
       (SELECT count(*)::int FROM bookings WHERE status = 'pending' AND amount_paid > 0) AS "awaitingConfirmation",
       (SELECT count(*)::int FROM bookings
         WHERE status = 'pending' AND amount_paid = 0 AND hold_expires_at > now()) AS "awaitingPayment",
       (SELECT count(*)::int FROM bookings
         WHERE status = 'confirmed' AND check_in <= $1 AND check_out > $1) AS "inHouse",
       (SELECT count(*)::int FROM bookings b JOIN apartments a ON a.id = b.apartment_id
         WHERE b.status = 'confirmed' AND b.actual_check_out_at IS NULL
           AND ((b.check_out + a.check_out_time) AT TIME ZONE current_setting('TIMEZONE')) <= now()) AS "lateCheckouts",
       (SELECT coalesce(sum(amount), 0)::int FROM payments
         WHERE state = 'succeeded' AND purpose <> 'asset_security' AND paid_at >= date_trunc('month', now()))
       - (SELECT coalesce(sum(amount), 0)::int FROM refunds
         WHERE state = 'succeeded' AND completed_at >= date_trunc('month', now())
           AND payment_id IN (SELECT id FROM payments WHERE purpose <> 'asset_security')) AS "revenueThisMonth",
       (SELECT count(*)::int FROM contact_messages WHERE handled_at IS NULL) AS "unhandledMessages"`,
    [today],
  );

  const arrivalsQuery = query<Omit<ListRow, 'total_count'>>(
    `SELECT ${LIST_COLUMNS}
     FROM bookings b JOIN apartments a ON a.id = b.apartment_id
     WHERE b.status IN ('pending', 'confirmed') AND b.check_in BETWEEN $1 AND $2
       AND (b.status = 'confirmed' OR b.amount_paid > 0)
     ORDER BY b.check_in
     LIMIT 20`,
    [today, weekAhead],
  );

  const transfersQuery = query<{
    payment_id: string;
    reference: string;
    customer_name: string;
    apartment_name: string;
    amount: number;
    note: string | null;
    reported_at: Date;
  }>(
    `SELECT p.id AS payment_id, b.reference, b.customer_name, a.name AS apartment_name, p.amount, p.note,
            p.created_at AS reported_at
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     JOIN apartments a ON a.id = b.apartment_id
     WHERE p.state = 'pending'
     ORDER BY p.created_at`,
  );

  const awaitingQuery = query<{
    reference: string;
    customer_name: string;
    apartment_name: string;
    deposit_amount: number;
    total_amount: number;
    hold_expires_at: Date;
    created_at: Date;
    asset_security_amount: number;
  }>(
    `SELECT b.reference, b.customer_name, a.name AS apartment_name, b.deposit_amount, b.total_amount,
            b.asset_security_amount, b.hold_expires_at, b.created_at
     FROM bookings b
     JOIN apartments a ON a.id = b.apartment_id
     WHERE b.status = 'pending' AND b.amount_paid = 0 AND b.hold_expires_at > now()
     ORDER BY b.hold_expires_at
     LIMIT 50`,
  );

  // Part paid (or deposit-first and confirmed), stay not over yet: the owner collects the rest, usually at check-in.
  const balanceQuery = query<{
    reference: string;
    customer_name: string;
    apartment_name: string;
    check_in: string;
    check_out: string;
    total_amount: number;
    amount_paid: number;
    asset_security_amount: number;
  }>(
    `SELECT b.reference, b.customer_name, a.name AS apartment_name, b.check_in, b.check_out, b.total_amount, b.amount_paid,
            b.asset_security_amount
     FROM bookings b
     JOIN apartments a ON a.id = b.apartment_id
     WHERE b.status IN ('pending', 'confirmed') AND b.amount_paid < b.total_amount
       AND (b.amount_paid > 0 OR (b.asset_security_amount > 0 AND b.status = 'confirmed'))
       AND b.check_out > $1
     ORDER BY b.check_in
     LIMIT 50`,
    [today],
  );

  const [counts, arrivals, transfers, awaiting, balances] = await Promise.all([
    countsQuery,
    arrivalsQuery,
    transfersQuery,
    awaitingQuery,
    balanceQuery,
  ]);

  return {
    ...counts!,
    bookingsWithBalanceDue: balances.map(
      (row): BalanceDue => ({
        reference: row.reference,
        customerName: row.customer_name,
        apartmentName: row.apartment_name,
        checkIn: row.check_in,
        checkOut: row.check_out,
        totalAmount: row.total_amount,
        amountPaid: row.amount_paid,
        balance: row.total_amount - row.amount_paid,
        note: row.reference.replaceAll('-', ''),
        depositFirst: row.asset_security_amount > 0,
      }),
    ),
    bookingsAwaitingPayment: awaiting.map(
      (row): AwaitingPayment => ({
        reference: row.reference,
        customerName: row.customer_name,
        apartmentName: row.apartment_name,
        note: transferNote(row.reference, row.asset_security_amount > 0 ? 'asset_security' : 'accommodation'),
        depositFirst: row.asset_security_amount > 0,
        depositAmount: row.asset_security_amount > 0 ? row.asset_security_amount : row.deposit_amount,
        totalAmount: row.total_amount,
        holdExpiresAt: row.hold_expires_at.toISOString(),
        createdAt: row.created_at.toISOString(),
      }),
    ),
    transfersToCheck: transfers.map((row) => ({
      paymentId: row.payment_id,
      reference: row.reference,
      customerName: row.customer_name,
      apartmentName: row.apartment_name,
      amount: row.amount,
      note: row.note ?? row.reference.replaceAll('-', ''),
      reportedAt: row.reported_at.toISOString(),
    })),
    arrivalsNext7Days: arrivals.map(toListItem),
  };
}

/**
 * Month-by-month figures for the dashboard charts, from 11 months back to 6 months ahead. Months
 * follow the business time zone (the database session's zone, see db/pool.ts).
 * @param today in the business time zone
 */
async function monthlyStats(today: string): Promise<AdminStats> {
  const rows = await query<{
    month: string;
    revenue: number;
    bookings: number;
    nights_booked: number;
    nights_available: number;
  }>(
    `WITH months AS (
       SELECT m::date AS month, (m + interval '1 month')::date AS next
       FROM generate_series(date_trunc('month', $1::date) - interval '11 months',
                            date_trunc('month', $1::date) + interval '6 months', interval '1 month') AS m
     ),
     span AS (SELECT min(month) AS first, max(next) AS last FROM months),
     received AS (
       SELECT date_trunc('month', paid_at)::date AS month, sum(amount) AS amount
       FROM payments, span
       WHERE state = 'succeeded' AND purpose <> 'asset_security' AND paid_at >= span.first GROUP BY 1
     ),
     refunded AS (
       SELECT date_trunc('month', r.completed_at)::date AS month, sum(r.amount) AS amount
       FROM refunds r JOIN payments p ON p.id = r.payment_id, span
       WHERE r.state = 'succeeded' AND p.purpose <> 'asset_security' AND r.completed_at >= span.first GROUP BY 1
     ),
     confirmed AS (
       SELECT date_trunc('month', confirmed_at)::date AS month, count(*) AS bookings
       FROM bookings, span
       WHERE status IN ('confirmed', 'completed') AND confirmed_at >= span.first GROUP BY 1
     ),
     nights AS (
       SELECT date_trunc('month', night)::date AS month, count(*) AS nights
       FROM bookings b, span, generate_series(b.check_in, b.check_out - 1, interval '1 day') AS night
       WHERE b.status IN ('confirmed', 'completed') AND b.check_out > span.first AND b.check_in < span.last
       GROUP BY 1
     ),
     listed AS (SELECT count(*) AS apartments FROM apartments WHERE is_active)
     SELECT to_char(m.month, 'YYYY-MM') AS month,
            (coalesce(r.amount, 0) - coalesce(f.amount, 0))::float8 AS revenue,
            coalesce(c.bookings, 0)::int AS bookings,
            coalesce(n.nights, 0)::int AS nights_booked,
            (listed.apartments * (m.next - m.month))::int AS nights_available
     FROM months m
     CROSS JOIN listed
     LEFT JOIN received r ON r.month = m.month
     LEFT JOIN refunded f ON f.month = m.month
     LEFT JOIN confirmed c ON c.month = m.month
     LEFT JOIN nights n ON n.month = m.month
     ORDER BY m.month`,
    [today],
  );
  return {
    currentMonth: today.slice(0, 7),
    months: rows.map((row) => ({
      month: row.month,
      revenue: row.revenue,
      bookings: row.bookings,
      nightsBooked: row.nights_booked,
      nightsAvailable: row.nights_available,
    })),
  };
}

export const bookingRepository = {
  insert,
  findByReference,
  findById,
  addEvent,
  hasEvent,
  listEvents,
  expireStaleHolds,
  claimHoldsEndingSoon,
  reactivate,
  lockHoldBudget,
  countActiveHolds,
  hasGuestOverlap,
  markConfirmed,
  markCancelled,
  markCompleted,
  clearHold,
  holdForMinutes,
  setPaymentProgress,
  completeFinishedStays,
  claimCheckoutReminders,
  claimRentRequests,
  claimLateCheckoutAlerts,
  nextArrival,
  emailContext,
  emailContexts,
  list,
  summary,
  monthlyStats,
};
