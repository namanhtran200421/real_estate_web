/**
 * Booking shapes.
 *
 * `GuestBooking` is what a guest sees (booking flow, confirmation and lookup pages) and
 * matches `frontend/real-estate/src/app/models/booking.ts`. Admin shapes add internal details.
 */
import type { PriceBreakdown } from '../pricing/pricing.js';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'expired';
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'fully_paid' | 'refunded';
export type PaymentProvider = 'bank_transfer' | 'cash';
/** pending = the guest reported a transfer the owner has not checked yet. */
export type PaymentState = 'pending' | 'succeeded' | 'failed';

export interface Quote extends PriceBreakdown {
  apartmentSlug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
}

export interface QuoteRequest {
  apartmentSlug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  promoCode?: string;
}

export interface CreateBookingRequest extends QuoteRequest {
  customer: { name: string; phone: string; email: string };
  message?: string;
}

/** A booking row, as the services use it. */
export interface BookingRecord {
  id: string;
  reference: string;
  apartmentId: string;
  apartmentSlug: string;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  message: string | null;
  priceBreakdown: PriceBreakdown;
  totalAmount: number;
  depositAmount: number;
  amountPaid: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  holdExpiresAt: Date | null;
  promoCodeId: string | null;
  createdIp: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  completedAt: Date | null;
}

/** What the guest may pay right now; null = that option is not available. */
export interface PaymentOptions {
  deposit: number | null;
  full: number | null;
}

export interface GuestPayment {
  id: string;
  provider: PaymentProvider;
  amount: number;
  state: PaymentState;
  paidAt: string | null;
  createdAt: string;
}

export interface GuestBooking {
  reference: string;
  apartmentSlug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  customer: { name: string; phone: string; email: string };
  message: string | null;
  quote: PriceBreakdown & { nights: number };
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountDue: number;
  paymentOptions: PaymentOptions;
  /** Unpaid bookings are released at this time. */
  holdExpiresAt: string | null;
  /** A transfer the guest reported that the owner is still checking. */
  pendingTransfer: { amount: number; reportedAt: string } | null;
  createdAt: string;
  payments: GuestPayment[];
}

/** What the guest needs to make the bank transfer. */
export interface TransferInstructions {
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  /** Transfer note: the booking reference without dashes, so it survives every bank's formatting. */
  note: string;
  /** VietQR code with account, amount and note filled in, as a PNG data URL (saveable to the phone's photos). */
  qrImage: string;
}

export interface AdminRefund {
  id: string;
  amount: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AdminPayment extends GuestPayment {
  failureReason: string | null;
  note: string | null;
  /** Admin who recorded or verified it. */
  recordedBy: string | null;
  /** Amount still refundable (paid minus refunds). */
  refundable: number;
  refunds: AdminRefund[];
}

export interface BookingEvent {
  type: string;
  actor: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AdminBookingDetail extends Omit<GuestBooking, 'payments'> {
  apartmentName: string;
  promoCode: string | null;
  createdIp: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  payments: AdminPayment[];
  events: BookingEvent[];
}

export interface AdminBookingListItem {
  reference: string;
  apartmentSlug: string;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  amountPaid: number;
  holdExpiresAt: string | null;
  createdAt: string;
}

export interface AdminBookingFilters {
  status?: BookingStatus;
  apartmentSlug?: string;
  search?: string;
  /** Stays overlapping [from, to]. */
  from?: string;
  to?: string;
  sort: 'check_in' | 'created_at';
  page: number;
  pageSize: number;
}

export interface Page<Item> {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

/** A transfer a guest reported that the owner has not checked yet. */
export interface TransferToCheck {
  paymentId: string;
  reference: string;
  customerName: string;
  apartmentName: string;
  amount: number;
  /** Transfer note to look for in the bank app. */
  note: string;
  reportedAt: string;
}

export interface AdminSummary {
  transfersToCheck: TransferToCheck[];
  awaitingConfirmation: number;
  awaitingPayment: number;
  inHouse: number;
  arrivalsNext7Days: AdminBookingListItem[];
  revenueThisMonth: number;
  unhandledMessages: number;
}
