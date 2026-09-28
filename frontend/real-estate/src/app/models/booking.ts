/** Booking shapes as returned by the API (backend: src/modules/bookings/booking.types.ts). */

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'expired';
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'fully_paid' | 'refunded';
export type PaymentProvider = 'bank_transfer' | 'cash';
/** pending = the guest reported a transfer the owner has not checked yet. */
export type PaymentState = 'pending' | 'succeeded' | 'failed';
export type PaymentOption = 'deposit' | 'full';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
  completed: 'Đã hoàn thành',
  expired: 'Hết hạn giữ chỗ',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thanh toán',
  deposit_paid: 'Đã đặt cọc',
  fully_paid: 'Đã thanh toán đủ',
  refunded: 'Đã hoàn tiền',
};

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  bank_transfer: 'Chuyển khoản',
  cash: 'Tiền mặt',
};

export type NightRate = 'weekday' | 'weekend' | 'holiday';

export const NIGHT_RATE_LABELS: Record<NightRate, string> = {
  weekday: 'Giá ngày thường',
  weekend: 'Giá cuối tuần',
  holiday: 'Giá ngày lễ',
};

export interface NightLine {
  date: string;
  rate: NightRate;
  amount: number;
}

export interface StayDiscount {
  kind: 'long_stay' | 'weekly_monthly';
  percent: number | null;
  amount: number;
}

/** Price of a stay; every amount in VND. */
export interface PriceBreakdown {
  lines: NightLine[];
  subtotal: number;
  stayDiscount: StayDiscount | null;
  promo: { code: string; amount: number } | null;
  discountTotal: number;
  total: number;
  depositPercent: number;
  deposit: number;
}

export interface Quote extends PriceBreakdown {
  apartmentSlug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
}

export interface Customer {
  name: string;
  phone: string;
  email: string;
}

export interface BookingPayment {
  id: string;
  provider: PaymentProvider;
  amount: number;
  state: PaymentState;
  paidAt: string | null;
  createdAt: string;
}

export interface Booking {
  reference: string;
  apartmentSlug: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  guests: number;
  customer: Customer;
  message: string | null;
  quote: PriceBreakdown & { nights: number };
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountDue: number;
  /** What can be paid now; null = not available. */
  paymentOptions: { deposit: number | null; full: number | null };
  /** An unpaid booking is released at this time. */
  holdExpiresAt: string | null;
  /** A transfer the guest reported that the owner is still checking. */
  pendingTransfer: { amount: number; reportedAt: string } | null;
  createdAt: string; // ISO timestamp
  /** Money that has arrived. */
  payments: BookingPayment[];
}

/** Bank details and a VietQR code for one transfer. */
export interface TransferInstructions {
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  /** Transfer note: the booking reference without dashes. */
  note: string;
  /** PNG data URL of the VietQR code (account, amount and note filled in). */
  qrImage: string;
}

/** Check-in, check-out, guests and nights: what the booking summary card shows. */
export interface Stay {
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
}
