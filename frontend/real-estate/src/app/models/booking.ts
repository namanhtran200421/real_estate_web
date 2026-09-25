export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'fully_paid' | 'refunded';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
  completed: 'Đã hoàn thành',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thanh toán',
  deposit_paid: 'Đã đặt cọc',
  fully_paid: 'Đã thanh toán đủ',
  refunded: 'Đã hoàn tiền',
};

export type NightRate = 'weekday' | 'weekend' | 'holiday';

export const NIGHT_RATE_LABELS: Record<NightRate, string> = {
  weekday: 'Giá ngày thường',
  weekend: 'Giá cuối tuần',
  holiday: 'Giá ngày lễ',
};

export interface Customer {
  name: string;
  phone: string;
  email: string;
}

export interface Booking {
  reference: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  guests: number;
  customer: Customer;
  message?: string;
  nights: { date: string; rate: NightRate }[];
  depositPercent: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: string; // ISO date
}
