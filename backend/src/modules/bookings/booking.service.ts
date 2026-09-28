/**
 * Booking business logic.
 *
 * Lifecycle:
 *   pending ──(owner confirms the money arrived)──▶ confirmed ──(check-out passes)──▶ completed
 *      │                                                │
 *      ├──(hold runs out, no transfer reported)──▶ expired └──(owner cancels)──▶ cancelled
 *      └──(owner cancels)──▶ cancelled
 *
 * A new booking holds its dates for BOOKING_HOLD_MINUTES while the guest transfers; a reported
 * transfer holds them until the owner has checked it (see payment.service.ts). Double bookings
 * are prevented by the database (exclusion constraint), not by application checks alone, so
 * two guests racing for the same dates can never both succeed.
 */
import { env } from '../../config/env.js';
import { isPgError, PG_ERROR, withTransaction, type Db } from '../../db/pool.js';
import { invalidateCaches } from '../../lib/cache.js';
import { readableCode } from '../../lib/crypto.js';
import { addDays, nightsOf, todayIn } from '../../lib/dates.js';
import { HttpError, type FieldIssue } from '../../lib/http-error.js';
import type { AdminIdentity } from '../admin-auth/admin-auth.types.js';
import { apartmentRepository } from '../apartments/apartment.repository.js';
import type { AdminApartment } from '../apartments/apartment.types.js';
import { holidayService } from '../holidays/holiday.service.js';
import { emailService } from '../notifications/email.service.js';
import { paymentRepository, type PaymentRecord, type RefundRecord } from '../payments/payment.repository.js';
import { priceStay } from '../pricing/pricing.js';
import { promoCodeService } from '../promo-codes/promo-code.service.js';
import { accessTokenFor, assertAccess } from './booking-access.js';
import { bookingRepository } from './booking.repository.js';
import { assertValidStay, MAX_ACTIVE_HOLDS, paymentOptions } from './booking.rules.js';
import type {
  AdminBookingDetail,
  AdminBookingFilters,
  AdminBookingListItem,
  AdminPayment,
  AdminSummary,
  BookingRecord,
  CreateBookingRequest,
  GuestBooking,
  GuestPayment,
  Page,
  Quote,
  QuoteRequest,
} from './booking.types.js';

const REFERENCE_ATTEMPTS = 5;

function notFound(): HttpError {
  return HttpError.notFound('Không tìm thấy đặt phòng.');
}

/** @param dates the taken dates, listed in `details` when known */
function datesUnavailable(dates: string[]): HttpError {
  let details: FieldIssue[] | undefined;
  if (dates.length > 0) details = [{ path: 'dates', message: dates.join(', ') }];
  return new HttpError(409, 'DATES_UNAVAILABLE', 'Một số ngày bạn chọn đã có người đặt. Vui lòng chọn ngày khác.', details);
}

function duplicateGuestBooking(): HttpError {
  return HttpError.conflict(
    'DUPLICATE_BOOKING',
    'Email hoặc số điện thoại này đã có đặt phòng trùng ngày. Vui lòng kiểm tra đặt phòng hiện có trước khi đặt lại.',
  );
}

function isGuestOverlapConstraint(error: unknown): boolean {
  return isPgError(error, PG_ERROR.exclusionViolation)
    && (error as { constraint?: string }).constraint !== undefined
    && ['bookings_no_guest_email_overlap', 'bookings_no_guest_phone_overlap']
      .includes((error as { constraint: string }).constraint);
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

interface PricedStay {
  quote: Quote;
  apartment: AdminApartment;
  promoCodeId: string | null;
}

/**
 * Validates a stay and prices it.
 * @param lockPromo lock the promo code row (inside the booking transaction)
 */
async function priceRequest(request: QuoteRequest, db: Db | undefined, lockPromo: boolean): Promise<PricedStay> {
  const today = todayIn(env.timezone);
  const nights = assertValidStay(request.checkIn, request.checkOut, today);

  const apartment = await apartmentRepository.findBySlug(request.apartmentSlug, db);
  if (!apartment || !apartment.isActive) throw HttpError.notFound('Không tìm thấy căn hộ.');
  if (request.guests > apartment.guests) {
    throw HttpError.unprocessable('TOO_MANY_GUESTS', `Căn hộ này nhận tối đa ${apartment.guests} khách.`);
  }

  // Independent lookups, run together (one round trip instead of three on the pool; a
  // transaction client queues them). All of them finish before any result is used, so no query
  // outlives a transaction that is rolled back; taken dates are reported before a bad promo code.
  const [unavailableResult, holidaysResult, promoResult] = await Promise.allSettled([
    apartmentRepository.findUnavailableDates([apartment.id], request.checkIn, request.checkOut, db),
    holidayService.holidayDatesBetween(request.checkIn, addDays(request.checkOut, -1), db),
    request.promoCode ? promoCodeService.resolveForStay(request.promoCode, nights, today, db, lockPromo) : null,
  ]);
  if (unavailableResult.status === 'rejected') throw unavailableResult.reason;
  const taken = unavailableResult.value.get(apartment.id) ?? [];
  if (taken.length > 0) throw datesUnavailable(taken);
  if (holidaysResult.status === 'rejected') throw holidaysResult.reason;
  if (promoResult.status === 'rejected') throw promoResult.reason;
  const holidays = holidaysResult.value;
  const promo = promoResult.value;

  const price = priceStay(
    nightsOf(request.checkIn, request.checkOut),
    { ...apartment.pricing, depositPercent: apartment.depositPercent },
    holidays,
    promo?.rule ?? null,
  );

  return {
    quote: {
      apartmentSlug: apartment.slug,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      guests: request.guests,
      nights,
      ...price,
    },
    apartment,
    promoCodeId: promo?.id ?? null,
  };
}

/** Price for a stay; throws when the dates are taken or invalid. */
async function quote(request: QuoteRequest): Promise<Quote> {
  const priced = await priceRequest(request, undefined, false);
  return priced.quote;
}

// ---------------------------------------------------------------------------
// Guest views
// ---------------------------------------------------------------------------

function toGuestPayment(payment: PaymentRecord): GuestPayment {
  return {
    id: payment.id,
    provider: payment.provider,
    amount: payment.amount,
    state: payment.state,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

function toGuestBooking(booking: BookingRecord, payments: PaymentRecord[]): GuestBooking {
  const pending = payments.find((payment) => payment.state === 'pending');
  let pendingTransfer: GuestBooking['pendingTransfer'] = null;
  if (pending) pendingTransfer = { amount: pending.amount, reportedAt: pending.createdAt.toISOString() };

  return {
    reference: booking.reference,
    apartmentSlug: booking.apartmentSlug,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: booking.guests,
    customer: { name: booking.customerName, phone: booking.customerPhone, email: booking.customerEmail },
    message: booking.message,
    quote: { ...booking.priceBreakdown, nights: booking.priceBreakdown.lines.length },
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    amountPaid: booking.amountPaid,
    amountDue: Math.max(booking.totalAmount - booking.amountPaid, 0),
    paymentOptions: paymentOptions(booking, new Date(), pending !== undefined),
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    pendingTransfer,
    createdAt: booking.createdAt.toISOString(),
    // Guests see money that arrived; a transfer still being checked is `pendingTransfer`.
    payments: payments.filter((payment) => payment.state === 'succeeded').map(toGuestPayment),
  };
}

async function guestView(booking: BookingRecord): Promise<GuestBooking> {
  return toGuestBooking(booking, await paymentRepository.listForBooking(booking.id));
}

function newReference(today: string): string {
  // RE-yymm-XXXXX, e.g. RE-2611-K7Q3M
  return `RE-${today.slice(2, 4)}${today.slice(5, 7)}-${readableCode(5)}`;
}

/**
 * Creates a pending booking that holds the dates while the guest pays.
 * @returns the booking and the guest's access token
 * @throws 409 DATES_UNAVAILABLE, 422 (guests, promo), 429 TOO_MANY_PENDING_BOOKINGS
 */
async function createBooking(
  request: CreateBookingRequest,
  ip: string | undefined,
): Promise<{ booking: GuestBooking; accessToken: string }> {
  const bookingId = await withTransaction(async (db) => {
    // Free dates held by abandoned bookings first; the database still counts them until then.
    await bookingRepository.expireStaleHolds(db);

    if (await bookingRepository.hasGuestOverlap(request.customer, request.checkIn, request.checkOut, db)) {
      throw duplicateGuestBooking();
    }

    const holds = await bookingRepository.countActiveHolds(
      { email: request.customer.email, phone: request.customer.phone, ip },
      db,
    );
    if (holds >= MAX_ACTIVE_HOLDS) {
      throw new HttpError(
        429,
        'TOO_MANY_PENDING_BOOKINGS',
        'Bạn đang có đặt phòng chưa thanh toán. Vui lòng thanh toán hoặc chờ đặt phòng đó hết hạn giữ chỗ.',
      );
    }

    const { quote: price, apartment, promoCodeId } = await priceRequest(request, db, true);
    const today = todayIn(env.timezone);

    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
      let id: string | undefined;
      try {
        id = await bookingRepository.insert(
          {
            reference: newReference(today),
            apartmentId: apartment.id,
            checkIn: request.checkIn,
            checkOut: request.checkOut,
            guests: request.guests,
            customer: request.customer,
            message: request.message ?? null,
            depositPercent: apartment.depositPercent,
            price,
            promoCodeId,
            holdMinutes: env.booking.holdMinutes,
            ip,
          },
          db,
        );
      } catch (error) {
        if (isGuestOverlapConstraint(error)) throw duplicateGuestBooking();
        if (isPgError(error, PG_ERROR.exclusionViolation)) throw datesUnavailable([]);
        throw error;
      }
      if (id) {
        await bookingRepository.addEvent(id, 'created', 'guest', { total: price.total, promoCode: request.promoCode }, db);
        return id;
      }
    }
    throw new Error('Could not generate a unique booking reference');
  });

  const booking = await bookingRepository.findById(bookingId);
  return { booking: await guestView(booking!), accessToken: accessTokenFor(bookingId) };
}

/** @throws 404 when the booking does not exist or the token is wrong */
async function getForGuest(reference: string, token: string | undefined): Promise<GuestBooking> {
  const booking = await bookingRepository.findByReference(reference);
  if (!booking) throw notFound();
  assertAccess(booking.id, token);
  return guestView(booking);
}

function normalizePhone(value: string): string {
  return value.replace(/[\s.-]/g, '').replace(/^\+84/, '0');
}

/**
 * Finds a booking by reference plus the email or phone used to make it, and returns a fresh
 * access token so the guest can view and pay it on this device.
 */
async function lookup(reference: string, contact: string): Promise<{ booking: GuestBooking; accessToken: string }> {
  const booking = await bookingRepository.findByReference(reference);
  const value = contact.trim().toLowerCase();
  const matches =
    booking && (value === booking.customerEmail.toLowerCase() || normalizePhone(value) === booking.customerPhone);
  if (!booking || !matches) throw HttpError.notFound('Không tìm thấy đặt phòng với mã và thông tin liên hệ này.');

  return { booking: await guestView(booking), accessToken: accessTokenFor(booking.id) };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

function toAdminPayment(payment: PaymentRecord, refunds: RefundRecord[]): AdminPayment {
  const own = refunds.filter((refund) => refund.paymentId === payment.id);
  const refunded = own.reduce((total, refund) => total + refund.amount, 0);

  let refundable = 0;
  if (payment.state === 'succeeded') refundable = payment.amount - refunded;

  return {
    ...toGuestPayment(payment),
    failureReason: payment.failureReason,
    note: payment.note,
    recordedBy: payment.recordedBy,
    refundable,
    refunds: own.map((refund) => ({
      id: refund.id,
      amount: refund.amount,
      reason: refund.reason,
      createdBy: refund.createdBy,
      createdAt: refund.createdAt.toISOString(),
    })),
  };
}

async function adminDetail(reference: string): Promise<AdminBookingDetail> {
  const booking = await bookingRepository.findByReference(reference);
  if (!booking) throw notFound();

  const [payments, refunds, events] = await Promise.all([
    paymentRepository.listForBooking(booking.id),
    paymentRepository.listRefundsForBooking(booking.id),
    bookingRepository.listEvents(booking.id),
  ]);

  const { payments: _guestPayments, ...guest } = toGuestBooking(booking, payments);
  return {
    ...guest,
    apartmentName: booking.apartmentName,
    promoCode: booking.priceBreakdown.promo?.code ?? null,
    createdIp: booking.createdIp,
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    cancellationReason: booking.cancellationReason,
    completedAt: booking.completedAt?.toISOString() ?? null,
    payments: payments.map((payment) => toAdminPayment(payment, refunds)),
    events,
  };
}

async function adminList(filters: AdminBookingFilters): Promise<Page<AdminBookingListItem>> {
  return bookingRepository.list(filters);
}

function invalidStatus(message: string): HttpError {
  return HttpError.conflict('INVALID_STATUS', message);
}

/** Runs an admin change on a locked booking, then returns the fresh detail view. */
async function adminChange(
  reference: string,
  change: (booking: BookingRecord, db: Db) => Promise<void>,
): Promise<AdminBookingDetail> {
  await withTransaction(async (db) => {
    const booking = await bookingRepository.findByReference(reference, db, true);
    if (!booking) throw notFound();
    await change(booking, db);
  });
  return adminDetail(reference);
}

async function confirm(reference: string, admin: AdminIdentity): Promise<AdminBookingDetail> {
  return adminChange(reference, async (booking, db) => {
    if (booking.status !== 'pending') throw invalidStatus('Chỉ xác nhận được đặt phòng đang chờ xác nhận.');
    // A booking only counts once its money has arrived; that path confirms it automatically.
    if (booking.amountPaid === 0) {
      throw invalidStatus('Chưa nhận thanh toán. Hãy xác nhận khoản chuyển khoản hoặc ghi nhận thanh toán, đặt phòng sẽ được xác nhận.');
    }
    await bookingRepository.markConfirmed(booking.id, db);
    await bookingRepository.addEvent(booking.id, 'confirmed', admin.email, {}, db);
    await emailService.queueBookingConfirmed(await bookingRepository.emailContext(booking.id, db), db);
  });
}

/** Cancels a booking. Money already received is refunded as a separate, explicit step. */
async function cancel(reference: string, reason: string, admin: AdminIdentity): Promise<AdminBookingDetail> {
  return adminChange(reference, async (booking, db) => {
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      throw invalidStatus('Chỉ huỷ được đặt phòng đang chờ hoặc đã xác nhận.');
    }
    await bookingRepository.markCancelled(booking.id, reason, db);
    await paymentRepository.failPendingForBooking(booking.id, 'Đặt phòng đã huỷ', db);
    await bookingRepository.addEvent(booking.id, 'cancelled', admin.email, { reason }, db);
    await emailService.queueBookingCancelled(await bookingRepository.emailContext(booking.id, db), reason, db);
  });
}

async function complete(reference: string, admin: AdminIdentity): Promise<AdminBookingDetail> {
  return adminChange(reference, async (booking, db) => {
    if (booking.status !== 'confirmed') throw invalidStatus('Chỉ hoàn thành được đặt phòng đã xác nhận.');
    if (booking.checkIn > todayIn(env.timezone)) throw invalidStatus('Khách chưa đến ngày nhận phòng.');
    await bookingRepository.markCompleted(booking.id, db);
    await bookingRepository.addEvent(booking.id, 'completed', admin.email, {}, db);
  });
}

async function summary(): Promise<AdminSummary> {
  const today = todayIn(env.timezone);
  return bookingRepository.summary(today, addDays(today, 7));
}

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

// Jobs change bookings outside any request, so they drop the public cache themselves.

async function expireStaleHolds(): Promise<number> {
  const expired = await bookingRepository.expireStaleHolds();
  if (expired > 0) invalidateCaches();
  return expired;
}

async function completeFinishedStays(): Promise<number> {
  const completed = await bookingRepository.completeFinishedStays(todayIn(env.timezone));
  if (completed > 0) invalidateCaches();
  return completed;
}

export const bookingService = {
  quote,
  createBooking,
  getForGuest,
  lookup,
  adminList,
  adminDetail,
  confirm,
  cancel,
  complete,
  summary,
  expireStaleHolds,
  completeFinishedStays,
};
