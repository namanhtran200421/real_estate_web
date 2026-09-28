/**
 * Booking rules that do not need the database: stay limits, what can be paid, and how the
 * payment status follows from the money received. Pure functions, unit-tested.
 */
import { daysBetween } from '../../lib/dates.js';
import { HttpError } from '../../lib/http-error.js';
import type { BookingRecord, PaymentOptions, PaymentStatus } from './booking.types.js';

export const MAX_NIGHTS = 90;
export const MAX_DAYS_AHEAD = 365;
/** Unpaid bookings one guest (email, phone or IP) may hold at once; stops calendar squatting. */
export const MAX_ACTIVE_HOLDS = 3;
/** Smallest amount worth a bank transfer. */
export const MIN_TRANSFER = 1_000;

/**
 * @param today in the business time zone
 * @throws HttpError 400 describing the first problem with the dates
 */
export function assertValidStay(checkIn: string, checkOut: string, today: string): number {
  const nights = daysBetween(checkIn, checkOut);
  const problem = (path: string, message: string) => HttpError.validation([{ path, message }]);

  if (checkIn < today) throw problem('checkIn', 'Ngày nhận phòng đã qua.');
  if (daysBetween(today, checkIn) > MAX_DAYS_AHEAD) {
    throw problem('checkIn', `Chỉ nhận đặt phòng trong vòng ${MAX_DAYS_AHEAD} ngày tới.`);
  }
  if (nights < 1) throw problem('checkOut', 'Ngày trả phòng phải sau ngày nhận phòng.');
  if (nights > MAX_NIGHTS) throw problem('checkOut', `Mỗi lần đặt tối đa ${MAX_NIGHTS} đêm.`);
  return nights;
}

/** Whether the guest can still pay: the booking is live and, if unpaid, its hold has not run out. */
export function isPayable(booking: Pick<BookingRecord, 'status' | 'amountPaid' | 'holdExpiresAt'>, now: Date): boolean {
  if (booking.status === 'confirmed') return true;
  if (booking.status !== 'pending') return false;
  if (booking.amountPaid > 0 || booking.holdExpiresAt === null) return true;
  return booking.holdExpiresAt > now;
}

/**
 * What the guest may transfer now. Nothing while a reported transfer is still being checked,
 * so a guest never pays twice by accident.
 */
export function paymentOptions(
  booking: Pick<BookingRecord, 'status' | 'amountPaid' | 'holdExpiresAt' | 'totalAmount' | 'depositAmount'>,
  now: Date,
  transferPending: boolean,
): PaymentOptions {
  const due = booking.totalAmount - booking.amountPaid;
  if (transferPending || !isPayable(booking, now) || due < MIN_TRANSFER) return { deposit: null, full: null };

  let deposit: number | null = null;
  const depositUseful = booking.depositAmount >= MIN_TRANSFER && booking.depositAmount < due;
  if (booking.amountPaid === 0 && depositUseful) deposit = booking.depositAmount;

  return { deposit, full: due };
}

/** Payment status from the money received and refunded (both in VND). */
export function derivePaymentStatus(total: number, received: number, refunded: number): PaymentStatus {
  const net = received - refunded;
  if (net <= 0 && refunded > 0) return 'refunded';
  if (net <= 0) return 'unpaid';
  if (net >= total) return 'fully_paid';
  return 'deposit_paid';
}
