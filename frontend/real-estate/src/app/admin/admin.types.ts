/** Admin API shapes (backend: booking.types.ts, apartment.types.ts, promo-code.types.ts, contact.types.ts). */
import { Apartment } from '../models/apartment';
import {
  AssetIncident,
  AssetIncidentStatus,
  Booking,
  BookingPayment,
  BookingStatus,
  GuestIdentity,
  PaymentPurpose,
  PaymentStatus,
} from '../models/booking';

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
  /** The guest's screenshot of a reported transfer; deleted 35 days after upload once answered. */
  hasScreenshot: boolean;
  /** The screenshot check: false = no transfer found and the guest sent it anyway; null = not checked. */
  screenshotShowsTransfer: boolean | null;
  refundable: number;
  refunds: AdminRefund[];
}

export interface BookingEvent {
  type: string;
  actor: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAssetIncident extends AssetIncident {
  createdBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface AdminBookingDetail extends Omit<Booking, 'payments' | 'incidents'> {
  apartmentName: string;
  promoCode: string | null;
  createdIp: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  identities: GuestIdentity[];
  identitiesPurged: boolean;
  incidents: AdminAssetIncident[];
  lateCheckout: {
    state: 'not_due' | 'due' | 'late' | 'urgent' | 'checked_out';
    scheduledAt: string;
    actualAt: string | null;
    minutesLate: number;
    nextArrivalReference: string | null;
  };
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

/** An unpaid booking holding its dates: confirmed once the transfer shows in the bank app. */
export interface AwaitingPayment {
  reference: string;
  customerName: string;
  apartmentName: string;
  /** Transfer note to look for in the bank app. */
  note: string;
  depositAmount: number;
  totalAmount: number;
  holdExpiresAt: string;
  createdAt: string;
}

/** One calendar month of the dashboard charts. */
export interface MonthStats {
  /** "2026-10" */
  month: string;
  /** Money received that month, minus refunds. */
  revenue: number;
  /** Bookings confirmed that month. */
  bookings: number;
  nightsBooked: number;
  nightsAvailable: number;
}

export interface AdminStats {
  currentMonth: string;
  /** 11 months back to 6 months ahead, oldest first. */
  months: MonthStats[];
}

/** A signed-in device on the account page. */
export interface AdminSessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

/** Part paid (usually the deposit); the rest is collected at check-in. */
export interface BalanceDue {
  reference: string;
  customerName: string;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  /** Transfer note, if the guest transfers the rest. */
  note: string;
}

export interface AdminSummary {
  transfersToCheck: TransferToCheck[];
  bookingsAwaitingPayment: AwaitingPayment[];
  bookingsWithBalanceDue: BalanceDue[];
  awaitingConfirmation: number;
  awaitingPayment: number;
  inHouse: number;
  arrivalsNext7Days: AdminBookingListItem[];
  revenueThisMonth: number;
  unhandledMessages: number;
  lateCheckouts: number;
}

export interface IncidentInput {
  description: string;
  amount: number;
  securityApplied: number;
}

export type { AssetIncidentStatus, PaymentPurpose };

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
