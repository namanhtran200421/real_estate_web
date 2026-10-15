/**
 * What the owner's booking page offers, decided the way the API decides it (backend
 * payment.service.ts and booking.service.ts), so a button is never offered that the API refuses.
 */
import { PAYMENT_PROVIDER_LABELS, PaymentPurpose } from '../models/booking';
import { AdminBookingDetail, BookingEvent } from './admin.types';

/** Smallest amount worth a transfer (backend MIN_TRANSFER). */
const MIN_AMOUNT = 1_000;

/**
 * The money the owner can record now. Deposit-first: only the deposit while the booking waits for
 * it; then rent and damage, and the deposit while some is still owed. Legacy: rent, and damage
 * once confirmed (a legacy booking has no separate deposit).
 */
export function manualPurposes(
  booking: Pick<AdminBookingDetail, 'status' | 'depositFirst' | 'financials'>,
): PaymentPurpose[] {
  const waiting = booking.status === 'pending' || booking.status === 'expired';
  const live = booking.status === 'confirmed' || booking.status === 'completed';
  if (booking.depositFirst) {
    if (waiting) return ['asset_security'];
    if (!live) return [];
    const purposes: PaymentPurpose[] = ['accommodation', 'incident'];
    if (booking.financials.assetSecurityDue >= MIN_AMOUNT) purposes.push('asset_security');
    return purposes;
  }
  if (waiting) return ['accommodation'];
  return live ? ['accommodation', 'incident'] : [];
}

/** Why "Hoàn cọc" cannot be pressed yet, in the API's order; undefined when it can. */
export function depositRefundBlocker(
  booking: Pick<AdminBookingDetail, 'status' | 'amountDue' | 'inspection' | 'incidents' | 'financials' | 'depositRefundable'>,
): string | undefined {
  if (booking.status !== 'completed') return 'Ghi nhận khách đã trả phòng trước.';
  if (booking.amountDue >= MIN_AMOUNT) return 'Khách chưa thanh toán đủ tiền phòng.';
  if (!booking.inspection) return 'Lưu kết quả kiểm tra trả phòng trước.';
  if (booking.incidents.some((incident) => incident.status === 'open')) return 'Còn khoản hư hỏng chưa đóng.';
  if (booking.financials.incidentAmountDue >= MIN_AMOUNT) {
    return 'Khách còn nợ tiền bồi thường. Hãy ghi nhận khoản bồi thường hoặc cấn trừ từ tiền cọc trước khi hoàn cọc.';
  }
  if (booking.depositRefundable < MIN_AMOUNT) return 'Không còn tiền cọc để hoàn.';
  return undefined;
}

/** Why the inspection can no longer be changed (the deposit refund was decided on it); undefined when it can. */
export function inspectionLock(booking: Pick<AdminBookingDetail, 'events'>): string | undefined {
  if (booking.events.some((event) => event.type === 'deposit_refunded')) return 'Đã hoàn cọc; không sửa được kết quả kiểm tra.';
  return undefined;
}

/** The transfer note the guest's banking app filled in: the reference without dashes, "TS" for a deposit, "BT" for damage. */
export function transferNote(reference: string, purpose: PaymentPurpose = 'accommodation'): string {
  const suffix = purpose === 'asset_security' ? 'TS' : purpose === 'incident' ? 'BT' : '';
  return `${reference.replaceAll('-', '')}${suffix}`;
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Khách tạo đặt phòng',
  policy_accepted: 'Đồng ý chính sách lưu trú',
  transfer_reported: 'Khách báo đã chuyển khoản',
  transfer_verified: 'Xác nhận đã nhận tiền',
  transfer_rejected: 'Báo chưa nhận được tiền',
  payment_recorded: 'Ghi nhận thanh toán',
  confirmed: 'Xác nhận đặt phòng',
  cancelled: 'Huỷ đặt phòng',
  completed: 'Hoàn thành',
  expired: 'Hết hạn giữ chỗ',
  reactivated: 'Mở lại đặt phòng (tiền về sau khi hết hạn giữ chỗ)',
  refund_recorded: 'Ghi nhận hoàn tiền',
  checked_out: 'Ghi nhận khách đã trả phòng',
  inspection_saved: 'Lưu kiểm tra trả phòng',
  deposit_refunded: 'Hoàn cọc',
  asset_incident_recorded: 'Ghi nhận hư hỏng / thất lạc',
  asset_incident_settled: 'Đóng khoản bồi thường',
  asset_incident_waived: 'Miễn khoản bồi thường',
  identities_purged: 'Xoá giấy tờ khách theo thời hạn lưu giữ',
  identities_missing: 'Giấy tờ khách đã bị xoá trước khi mở lại: thu lại khi nhận phòng',
};

/** Reasons the system records as codes: the event's label already says them. */
const REASON_CODES = new Set(['auto_after_checkout', 'late_payment', 'payment_received', 'purged_before_reactivation']);

export function eventLabel(event: BookingEvent): string {
  if (event.type === 'completed' && event.data['reason'] === 'auto_after_checkout') {
    return 'Tự động hoàn thành (24 giờ sau giờ trả phòng)';
  }
  return EVENT_LABELS[event.type] ?? event.type;
}

/** The parts of an event's data worth showing: amount, payment method, the owner's reason. */
export function eventDetails(event: BookingEvent): { amount?: number; method?: string; reason?: string } {
  const { amount, provider, method, reason } = event.data;
  const details: { amount?: number; method?: string; reason?: string } = {};
  if (typeof amount === 'number') details.amount = amount;
  const payment = provider ?? method;
  if (typeof payment === 'string' && payment in PAYMENT_PROVIDER_LABELS) {
    details.method = PAYMENT_PROVIDER_LABELS[payment as keyof typeof PAYMENT_PROVIDER_LABELS];
  }
  if (typeof reason === 'string' && !REASON_CODES.has(reason)) details.reason = reason;
  return details;
}
