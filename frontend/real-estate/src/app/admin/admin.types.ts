/** Admin API shapes (backend: booking.types.ts, apartment.types.ts, promo-code.types.ts, contact.types.ts). */
import { Apartment } from '../models/apartment';
import { Booking, BookingPayment, BookingStatus, PaymentStatus } from '../models/booking';

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

export interface AdminRefund {
  id: string;
  amount: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AdminPayment extends BookingPayment {
  failureReason: string | null;
  /** For reported transfers: the transfer note to look for in the bank app. */
  note: string | null;
  /** Admin who recorded or verified it. */
  recordedBy: string | null;
  refundable: number;
  refunds: AdminRefund[];
}

export interface BookingEvent {
  type: string;
  actor: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AdminBookingDetail extends Omit<Booking, 'payments'> {
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

/** A transfer a guest reported that the owner has not checked yet. */
export interface TransferToCheck {
  paymentId: string;
  reference: string;
  customerName: string;
  apartmentName: string;
  amount: number;
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

export interface BookingFilters {
  status?: BookingStatus;
  apartment?: string;
  search?: string;
  sort?: 'check_in' | 'created_at';
  page: number;
  pageSize: number;
}

/** Apartment as edited in the admin: public content plus publishing settings. */
export interface AdminApartment extends Omit<Apartment, 'unavailableDates'> {
  isActive: boolean;
  sortOrder: number;
}

export type ApartmentInput = Omit<AdminApartment, 'id'>;

export interface BlockedDate {
  date: string;
  reason: string | null;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number | null;
  discountAmount: number | null;
  maxRedemptions: number;
  minNights: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  redemptions: number;
  createdAt: string;
}

export interface PromoCodeInput {
  code: string;
  description?: string;
  discountPercent?: number;
  discountAmount?: number;
  maxRedemptions: number;
  minNights: number;
  validFrom?: string;
  validUntil?: string;
  isActive: boolean;
}

export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  topic: string;
  apartmentName: string | null;
  message: string;
  handledAt: string | null;
  createdAt: string;
}
