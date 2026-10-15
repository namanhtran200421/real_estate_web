/**
 * Booking business logic.
 *
 * Lifecycle:
 *   pending ──(owner sees the money arrive)──▶ confirmed ──(owner records check-out, or 24 h after it)──▶ completed
 *      │                                           │
 *      ├──(hold runs out, unpaid)──▶ expired        └──(owner cancels)──▶ cancelled
 *      │      (money seen late, dates still free: back to pending and confirmed)
 *      └──(owner cancels)──▶ cancelled
 *
 * A new booking holds its dates for BOOKING_HOLD_MINUTES. The guest scans the VietQR code, pays,
 * and reports the transfer with a screenshot, which holds the dates until the owner answers. The
 * owner is emailed at once, reminded shortly before an unreported hold runs out, and confirms
 * when the transfer shows in the bank app (see payment.service.ts). Double bookings
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
import { transferNote } from '../payments/payment.service.js';
import { priceStay } from '../pricing/pricing.js';
import { promoCodeService } from '../promo-codes/promo-code.service.js';
import { accessTokenFor, assertAccess } from './booking-access.js';
import { assetIncidentRepository } from './asset-incident.repository.js';
import { bookingRepository } from './booking.repository.js';
import { guestIdentityRepository } from './guest-identity.repository.js';
import { checklistFor, type InspectionResult } from './inspection.js';
import { inspectionRepository } from './inspection.repository.js';
import {
  assertValidStay,
  confirmingPurpose,
  isDepositFirst,
  MAX_ACTIVE_HOLDS,
  paymentOptions,
  rentDueFrom,
} from './booking.rules.js';
import type {
  AdminBookingDetail,
  AdminBookingFilters,
  AdminBookingListItem,
  AdminPayment,
  AdminStats,
  AdminSummary,
  AssetIncidentStatus,
  BookingFinancials,
  BookingRecord,
  CreateBookingRequest,
  GuestBooking,
  GuestPayment,
  Page,
  Quote,
  QuoteRequest,
} from './booking.types.js';

const REFERENCE_ATTEMPTS = 5;
/** How long before an unpaid booking's hold runs out the owner is reminded to look for the transfer. */
const REMINDER_LEAD_MINUTES = 30;

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
    purpose: payment.purpose,
    amount: payment.amount,
    state: payment.state,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

function toGuestBooking(
  booking: BookingRecord,
  payments: PaymentRecord[],
  financials: BookingFinancials,
  incidents: Awaited<ReturnType<typeof assetIncidentRepository.list>>,
): GuestBooking {
  const pending = payments.find((payment) => payment.state === 'pending');
  let pendingTransfer: GuestBooking['pendingTransfer'] = null;
  if (pending) {
    pendingTransfer = {
      amount: pending.amount,
      purpose: pending.purpose,
      reportedAt: pending.createdAt.toISOString(),
      hasScreenshot: pending.hasScreenshot,
    };
  }

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
    financials,
    paymentOptions: paymentOptions(booking, financials, new Date(), todayIn(env.timezone), pending !== undefined),
    depositFirst: isDepositFirst(booking),
    rentDueFrom: rentDueFrom(booking),
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    pendingTransfer,
    createdAt: booking.createdAt.toISOString(),
    // Guests see money that arrived; a transfer still being checked is `pendingTransfer`.
    payments: payments.filter((payment) => payment.state === 'succeeded').map(toGuestPayment),
    incidents: incidents.map(assetIncidentRepository.toGuest),
  };
}

async function guestView(booking: BookingRecord): Promise<GuestBooking> {
  const [payments, financials, incidents] = await Promise.all([
    paymentRepository.listForBooking(booking.id),
    assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount),
    assetIncidentRepository.list(booking.id),
  ]);
  return toGuestBooking(booking, payments, financials, incidents);
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
    if (request.guestIdentities.length !== request.guests) {
      throw HttpError.validation([
        { path: 'guestIdentities', message: 'Cần thông tin giấy tờ cho từng khách lưu trú.' },
      ]);
    }
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
            // Deposit-first when the apartment asks a deposit; with 0% the rent is paid up front as before.
            depositAmount: apartment.depositPercent > 0 ? 0 : price.deposit,
            assetSecurityAmount: apartment.depositPercent > 0 ? price.deposit : 0,
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
        await guestIdentityRepository.insertAll(id, request.checkOut, request.guestIdentities, db);
        await bookingRepository.addEvent(id, 'created', 'guest', { total: price.total, promoCode: request.promoCode }, db);
        const context = await bookingRepository.emailContext(id, db);
        await emailService.queueBookingHeld(
          context,
          transferNote(context.reference, confirmingPurpose({ assetSecurityAmount: context.assetSecurityAmount })),
          db,
        );
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
    hasScreenshot: payment.hasScreenshot,
    screenshotShowsTransfer: payment.screenshotShowsTransfer,
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

  const [payments, refunds, events, stored, financials, incidents, nextArrivalReference, inspection, apartment] = await Promise.all([
    paymentRepository.listForBooking(booking.id),
    paymentRepository.listRefundsForBooking(booking.id),
    bookingRepository.listEvents(booking.id),
    guestIdentityRepository.forAdmin(booking.id),
    assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount),
    assetIncidentRepository.list(booking.id),
    bookingRepository.nextArrival(booking),
    inspectionRepository.get(booking.id),
    apartmentRepository.findBySlug(booking.apartmentSlug),
  ]);

  const { payments: _guestPayments, incidents: _guestIncidents, ...guest } = toGuestBooking(
    booking,
    payments,
    financials,
    incidents,
  );
  const minutesLate = Math.max(Math.floor((Date.now() - booking.scheduledCheckOutAt.getTime()) / 60_000), 0);
  let lateState: AdminBookingDetail['lateCheckout']['state'] = 'not_due';
  // A stay completed without the owner recording the time (24 h after check-out) is over too.
  if (booking.actualCheckOutAt || booking.status === 'completed') lateState = 'checked_out';
  else if (booking.status !== 'confirmed') lateState = 'not_due';
  else if (minutesLate >= 30 && nextArrivalReference) lateState = 'urgent';
  else if (minutesLate >= 15) lateState = 'late';
  else if (booking.scheduledCheckOutAt.getTime() <= Date.now()) lateState = 'due';
  // "Deleted after retention" only when the booking had identities: rows past their date not purged
  // yet, or the purge job's event. A booking made before identities were collected never had any.
  const { identities } = stored;
  const purged = identities.length === 0
    && (stored.expired > 0 || events.some((event) => event.type === 'identities_purged'));
  return {
    ...guest,
    apartmentName: booking.apartmentName,
    promoCode: booking.priceBreakdown.promo?.code ?? null,
    createdIp: booking.createdIp,
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    cancellationReason: booking.cancellationReason,
    completedAt: booking.completedAt?.toISOString() ?? null,
    identities,
    identitiesPurged: purged,
    identitiesMissing: identities.length === 0 && events.some((event) => event.type === 'identities_missing'),
    incidents,
    lateCheckout: {
      state: lateState,
      scheduledAt: booking.scheduledCheckOutAt.toISOString(),
      actualAt: booking.actualCheckOutAt?.toISOString() ?? null,
      minutesLate,
      nextArrivalReference,
    },
    payments: payments.map((payment) => toAdminPayment(payment, refunds)),
    events,
    inspection,
    checklist: checklistFor(apartment ?? { inspectionChecklist: [] }),
    depositRefundable: financials.assetSecurityHeld,
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
    if (isDepositFirst(booking)) {
      const { assetSecurityReceived, assetSecurityRefunded } = await assetIncidentRepository.financials(
        booking.id,
        booking.assetSecurityAmount,
        db,
      );
      if (assetSecurityReceived - assetSecurityRefunded <= 0) {
        throw invalidStatus('Chưa nhận tiền đặt cọc. Hãy xác nhận khoản chuyển khoản hoặc ghi nhận thanh toán, đặt phòng sẽ được xác nhận.');
      }
    } else if (booking.amountPaid === 0) {
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
    // The stay will not happen: its guests' identities are kept at most 3 more days.
    await guestIdentityRepository.shortenRetention(booking.id, db);
    await bookingRepository.addEvent(booking.id, 'cancelled', admin.email, { reason }, db);
    await emailService.queueBookingCancelled(await bookingRepository.emailContext(booking.id, db), reason, db);
  });
}

async function checkOut(reference: string, admin: AdminIdentity): Promise<AdminBookingDetail> {
  return adminChange(reference, async (booking, db) => {
    if (booking.status !== 'confirmed') throw invalidStatus('Chỉ hoàn thành được đặt phòng đã xác nhận.');
    if (booking.checkIn > todayIn(env.timezone)) throw invalidStatus('Khách chưa đến ngày nhận phòng.');
    await bookingRepository.markCompleted(booking.id, db);
    await bookingRepository.addEvent(booking.id, 'checked_out', admin.email, { actualAt: new Date().toISOString() }, db);
  });
}

/**
 * Saves what the owner found when the guest left. Allowed from check-in day on, until the deposit
 * is refunded: the refund was decided on this inspection.
 * @throws 409 INVALID_STATUS, INSPECTION_LOCKED
 */
async function saveInspection(
  reference: string,
  results: InspectionResult[],
  admin: AdminIdentity,
): Promise<AdminBookingDetail> {
  return adminChange(reference, async (booking, db) => {
    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      throw invalidStatus('Chỉ kiểm tra được đặt phòng đã xác nhận hoặc đã hoàn thành.');
    }
    if (booking.checkIn > todayIn(env.timezone)) throw invalidStatus('Khách chưa đến ngày nhận phòng.');
    if (await bookingRepository.hasEvent(booking.id, 'deposit_refunded', db)) {
      throw HttpError.conflict('INSPECTION_LOCKED', 'Đã hoàn cọc; không sửa được kết quả kiểm tra.');
    }
    await inspectionRepository.upsert(booking.id, results, admin.id, db);
    await bookingRepository.addEvent(
      booking.id,
      'inspection_saved',
      admin.email,
      { problems: results.filter((result) => !result.ok).length },
      db,
    );
  });
}

async function addIncident(
  reference: string,
  input: { description: string; amount: number; securityApplied: number },
  admin: AdminIdentity,
): Promise<AdminBookingDetail> {
  return adminChange(reference, async (booking, db) => {
    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      throw invalidStatus('Chỉ ghi nhận hư hỏng hoặc thất lạc cho đặt phòng đã xác nhận.');
    }
    const financials = await assetIncidentRepository.financials(booking.id, booking.assetSecurityAmount, db);
    if (input.securityApplied > financials.assetSecurityHeld) {
      throw HttpError.unprocessable(
        'SECURITY_APPLIED_TOO_LARGE',
        `Chỉ còn ${financials.assetSecurityHeld.toLocaleString('vi-VN')} ₫ tiền đặt cọc có thể cấn trừ.`,
      );
    }
    await assetIncidentRepository.insert({ bookingId: booking.id, ...input, createdBy: admin.id }, db);
    await bookingRepository.addEvent(booking.id, 'asset_incident_recorded', admin.email, input, db);
  });
}

async function resolveIncident(
  reference: string,
  incidentId: string,
  status: Exclude<AssetIncidentStatus, 'open'>,
  admin: AdminIdentity,
): Promise<AdminBookingDetail> {
  return adminChange(reference, async (booking, db) => {
    const changed = await assetIncidentRepository.setStatus(booking.id, incidentId, status, admin.id, db);
    if (!changed) throw HttpError.conflict('INVALID_STATUS', 'Khoản bồi thường này đã được xử lý hoặc không tồn tại.');
    await bookingRepository.addEvent(booking.id, `asset_incident_${status}`, admin.email, { incidentId }, db);
  });
}

async function stats(): Promise<AdminStats> {
  return bookingRepository.monthlyStats(todayIn(env.timezone));
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

/**
 * Completes confirmed stays 24 hours after their scheduled check-out when the owner has not
 * recorded it (the owner may still be away; the stay is over either way).
 * @param now the job's clock (tests pass another one)
 */
async function completeFinishedStays(now = new Date()): Promise<number> {
  const completed = await bookingRepository.completeFinishedStays(now);
  if (completed > 0) invalidateCaches();
  return completed;
}

/** Reminds the owner, once per booking, to look for the transfer before the hold runs out. */
async function remindOwnerOfEndingHolds(): Promise<number> {
  return withTransaction(async (db) => {
    const ids = await bookingRepository.claimHoldsEndingSoon(REMINDER_LEAD_MINUTES, db);
    for (const id of ids) {
      const context = await bookingRepository.emailContext(id, db);
      await emailService.queueHoldEndingReminder(
        context,
        transferNote(context.reference, confirmingPurpose({ assetSecurityAmount: context.assetSecurityAmount })),
        db,
      );
    }
    return ids.length;
  });
}

/** T-24h guest reminder and one Owner alert once check-out is 15 minutes late. */
async function sendCheckoutNotifications(): Promise<number> {
  return withTransaction(async (db) => {
    const [reminders, late] = await Promise.all([
      bookingRepository.claimCheckoutReminders(db),
      bookingRepository.claimLateCheckoutAlerts(db),
    ]);
    for (const id of reminders) {
      await emailService.queueCheckoutReminder(await bookingRepository.emailContext(id, db), db);
    }
    for (const id of late) {
      const booking = (await bookingRepository.findById(id, db))!;
      await emailService.queueLateCheckoutAlert(
        await bookingRepository.emailContext(id, db),
        await bookingRepository.nextArrival(booking, db),
        db,
      );
    }
    return reminders.length + late.length;
  });
}

/** Asks each confirmed deposit-first guest for the rent on check-in morning, once per booking. */
async function sendRentRequests(): Promise<number> {
  return withTransaction(async (db) => {
    const ids = await bookingRepository.claimRentRequests(env.timezone, db);
    for (const id of ids) {
      await emailService.queueRentRequest(await bookingRepository.emailContext(id, db), db);
    }
    return ids.length;
  });
}

/**
 * Deletes guests' identities past their retention date.
 * @param now the job's clock (tests pass a later one)
 */
async function purgeExpiredGuestIdentities(now = new Date()): Promise<number> {
  return guestIdentityRepository.purgeExpired(now);
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
  checkOut,
  saveInspection,
  addIncident,
  resolveIncident,
  summary,
  stats,
  expireStaleHolds,
  completeFinishedStays,
  remindOwnerOfEndingHolds,
  sendCheckoutNotifications,
  sendRentRequests,
  purgeExpiredGuestIdentities,
};
