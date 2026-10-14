/**
 * Booking rules that do not need the database: stay limits, what can be paid, and how the
 * payment status follows from the money received. Pure functions, unit-tested.
 */
import { daysBetween } from '../../lib/dates.js';
import { HttpError } from '../../lib/http-error.js';
import type { BookingFinancials, BookingRecord, PaymentOptions, PaymentPurpose, PaymentStatus } from './booking.types.js';

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

/** Version of the house rules a guest agrees to when reporting a transfer (the /policy page). */
export const POLICY_VERSION = '2026-10-14';

/** Deposit-first bookings pay a security deposit to confirm, then the rent from check-in day. */
export function isDepositFirst(booking: Pick<BookingRecord, 'assetSecurityAmount'>): boolean {
  return booking.assetSecurityAmount > 0;
}

/** The payment whose arrival confirms a pending booking (and whose report clears its hold). */
export function confirmingPurpose(booking: Pick<BookingRecord, 'assetSecurityAmount'>): PaymentPurpose {
  return isDepositFirst(booking) ? 'asset_security' : 'accommodation';
}

type PayableBooking = Pick<
  BookingRecord,
  'status' | 'amountPaid' | 'holdExpiresAt' | 'totalAmount' | 'depositAmount' | 'assetSecurityAmount' | 'checkIn'
>;

const NOTHING: PaymentOptions = { deposit: null, full: null, assetSecurity: null, incident: null };

function worthTransferring(amount: number): number | null {
  return amount >= MIN_TRANSFER ? amount : null;
}

/**
 * What the guest may transfer now. Nothing while a reported transfer is still being checked, so
 * a guest never pays twice by accident. Deposit-first: the deposit while the hold runs, then the
 * full rent from check-in day. Legacy: part of the rent (the old deposit) or all of it.
 * @param today the business date, YYYY-MM-DD
 */
export function paymentOptions(
  booking: PayableBooking,
  financials: Pick<BookingFinancials, 'assetSecurityDue' | 'incidentAmountDue'>,
  now: Date,
  today: string,
  transferPending: boolean,
): PaymentOptions {
  if (transferPending) return { ...NOTHING };
  const stayLive = booking.status === 'confirmed' || booking.status === 'completed';
  const incident = stayLive ? worthTransferring(financials.incidentAmountDue) : null;
  const rentDue = booking.totalAmount - booking.amountPaid;

  if (isDepositFirst(booking)) {
    if (booking.status === 'pending') {
      return { ...NOTHING, assetSecurity: isPayable(booking, now) ? worthTransferring(financials.assetSecurityDue) : null };
    }
    const rentOpen = stayLive && today >= booking.checkIn;
    return { ...NOTHING, full: rentOpen ? worthTransferring(rentDue) : null, incident };
  }

  if (!isPayable(booking, now) || rentDue < MIN_TRANSFER) return { ...NOTHING, incident };
  const depositUseful = booking.depositAmount >= MIN_TRANSFER && booking.depositAmount < rentDue;
  const deposit = booking.amountPaid === 0 && depositUseful ? booking.depositAmount : null;
  return { deposit, full: rentDue, assetSecurity: null, incident };
}

/** The date the rent becomes payable (check-in day) while it is still owed; null otherwise. */
export function rentDueFrom(
  booking: Pick<BookingRecord, 'status' | 'amountPaid' | 'totalAmount' | 'assetSecurityAmount' | 'checkIn'>,
): string | null {
  if (!isDepositFirst(booking) || booking.status === 'cancelled' || booking.status === 'expired') return null;
  return booking.totalAmount - booking.amountPaid >= MIN_TRANSFER ? booking.checkIn : null;
}

/** Payment status from the rent and the deposit received and refunded (all in VND). */
export function derivePaymentStatus(money: {
  total: number;
  rentReceived: number;
  rentRefunded: number;
  depositReceived: number;
  depositRefunded: number;
}): PaymentStatus {
  const rent = money.rentReceived - money.rentRefunded;
  const deposit = money.depositReceived - money.depositRefunded;
  if (rent >= money.total && rent > 0) return 'fully_paid';
  if (rent > 0 || deposit > 0) return 'deposit_paid';
  if (money.rentRefunded + money.depositRefunded > 0) return 'refunded';
  return 'unpaid';
}
