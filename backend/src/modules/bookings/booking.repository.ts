/**
 * Booking data access: bookings, their audit events, and the admin list and dashboard queries.
 */
import { query, queryOne, type Db } from '../../db/pool.js';
import type { BookingEmailContext } from '../notifications/email.templates.js';
import type { PriceBreakdown } from '../pricing/pricing.js';
import type {
  AdminBookingFilters,
  AdminBookingListItem,
  AdminSummary,
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
}

const SELECT_BOOKING = `
  SELECT b.id, b.reference, b.apartment_id, a.slug AS apartment_slug, a.name AS apartment_name,
         b.check_in, b.check_out, b.guests, b.customer_name, b.customer_phone, b.customer_email,
         b.message, b.price_breakdown, b.total_amount, b.deposit_amount, b.amount_paid, b.status,
         b.payment_status, b.hold_expires_at, b.promo_code_id, host(b.created_ip) AS created_ip,
         b.created_at, b.confirmed_at, b.cancelled_at, b.cancellation_reason, b.completed_at
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
       total_amount, deposit_amount, promo_code_id, hold_expires_at, created_ip
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               now() + make_interval(mins => $17), $18)
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
      booking.price.deposit,
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

async function listEvents(bookingId: string): Promise<BookingEvent[]> {
  const rows = await query<{ type: string; actor: string; data: Record<string, unknown>; created_at: Date }>(
    'SELECT type, actor, data, created_at FROM booking_events WHERE booking_id = $1 ORDER BY created_at, id',
    [bookingId],
  );
  return rows.map((row) => ({ type: row.type, actor: row.actor, data: row.data, createdAt: row.created_at.toISOString() }));
}

/**
 * Expires unpaid pending bookings whose hold ran out, freeing their dates, and records an
 * event for each. Runs before every new booking (in its transaction) and as a background job.
 */
async function expireStaleHolds(db?: Db): Promise<number> {
  const rows = await query<{ id: string }>(
    `WITH expired AS (
       UPDATE bookings SET status = 'expired'
       WHERE status = 'pending' AND amount_paid = 0 AND hold_expires_at < now()
       RETURNING id
     )
     INSERT INTO booking_events (booking_id, type, actor)
     SELECT id, 'expired', 'system' FROM expired
     RETURNING booking_id AS id`,
    [],
    db,
  );
  return rows.length;
}

/** Unpaid bookings currently holding dates for this email, phone or IP. */
async function countActiveHolds(identity: { email: string; phone: string; ip: string | undefined }, db: Db): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM bookings
     WHERE status = 'pending' AND amount_paid = 0 AND hold_expires_at > now()
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
  await query(`UPDATE bookings SET status = 'completed', completed_at = now() WHERE id = $1`, [id], db);
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

/** Confirmed stays whose check-out date has passed become completed. */
async function completeFinishedStays(today: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `WITH done AS (
       UPDATE bookings SET status = 'completed', completed_at = now()
       WHERE status = 'confirmed' AND check_out <= $1
       RETURNING id
     )
     INSERT INTO booking_events (booking_id, type, actor)
     SELECT id, 'completed', 'system' FROM done
     RETURNING booking_id AS id`,
    [today],
  );
  return rows.length;
}

async function emailContext(bookingId: string, db?: Db): Promise<BookingEmailContext> {
  const row = await queryOne<BookingEmailContext>(
    `SELECT b.reference, b.customer_name AS "customerName", b.customer_email AS "customerEmail",
            b.customer_phone AS "customerPhone", a.name AS "apartmentName", a.address AS "apartmentAddress",
            b.check_in AS "checkIn", b.check_out AS "checkOut",
            to_char(a.check_in_time, 'HH24:MI') AS "checkInTime", to_char(a.check_out_time, 'HH24:MI') AS "checkOutTime",
            b.guests, (b.check_out - b.check_in) AS nights, b.total_amount AS total, b.amount_paid AS "amountPaid",
            b.status::text AS status, b.message
     FROM bookings b JOIN apartments a ON a.id = b.apartment_id
     WHERE b.id = $1`,
    [bookingId],
    db,
  );
  return row!;
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

/** Three independent reads, run in parallel on separate pool connections. */
async function summary(today: string, weekAhead: string): Promise<AdminSummary> {
  const countsQuery = queryOne<Omit<AdminSummary, 'arrivalsNext7Days' | 'transfersToCheck'>>(
    `SELECT
       (SELECT count(*)::int FROM bookings WHERE status = 'pending' AND amount_paid > 0) AS "awaitingConfirmation",
       (SELECT count(*)::int FROM bookings
         WHERE status = 'pending' AND amount_paid = 0 AND hold_expires_at > now()) AS "awaitingPayment",
       (SELECT count(*)::int FROM bookings
         WHERE status = 'confirmed' AND check_in <= $1 AND check_out > $1) AS "inHouse",
       (SELECT coalesce(sum(amount), 0)::int FROM payments
         WHERE state = 'succeeded' AND paid_at >= date_trunc('month', now()))
       - (SELECT coalesce(sum(amount), 0)::int FROM refunds
         WHERE state = 'succeeded' AND completed_at >= date_trunc('month', now())) AS "revenueThisMonth",
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

  const [counts, arrivals, transfers] = await Promise.all([countsQuery, arrivalsQuery, transfersQuery]);

  return {
    ...counts!,
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

export const bookingRepository = {
  insert,
  findByReference,
  findById,
  addEvent,
  listEvents,
  expireStaleHolds,
  countActiveHolds,
  hasGuestOverlap,
  markConfirmed,
  markCancelled,
  markCompleted,
  clearHold,
  holdForMinutes,
  setPaymentProgress,
  completeFinishedStays,
  emailContext,
  list,
  summary,
};
