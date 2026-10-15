import { BookingFinancials } from '../models/booking';
import { AdminBookingDetail } from './admin.types';
import { depositRefundBlocker, eventDetails, eventLabel, inspectionLock, manualPurposes, transferNote } from './booking-detail-rules';

const FINANCIALS: BookingFinancials = {
  assetSecurityRequired: 400_000,
  assetSecurityReceived: 400_000,
  assetSecurityRefunded: 0,
  assetSecurityApplied: 0,
  assetSecurityHeld: 400_000,
  assetSecurityDue: 0,
  incidentCharges: 0,
  incidentPayments: 0,
  incidentAmountDue: 0,
};

function booking(overrides: Partial<AdminBookingDetail> = {}): AdminBookingDetail {
  return {
    status: 'completed',
    depositFirst: true,
    amountDue: 0,
    financials: FINANCIALS,
    inspection: { results: [], inspectedBy: null, inspectedAt: '2026-10-15T05:00:00Z' },
    incidents: [],
    depositRefundable: 400_000,
    events: [],
    ...overrides,
  } as AdminBookingDetail;
}

describe('manualPurposes', () => {
  it('takes only the deposit while a deposit-first booking waits for it', () => {
    expect(manualPurposes(booking({ status: 'pending', financials: { ...FINANCIALS, assetSecurityDue: 400_000 } }))).toEqual(['asset_security']);
    expect(manualPurposes(booking({ status: 'expired' }))).toEqual(['asset_security']);
  });

  it('takes rent and damage once a deposit-first stay is confirmed, and the deposit only while some is owed', () => {
    expect(manualPurposes(booking({ status: 'confirmed' }))).toEqual(['accommodation', 'incident']);
    expect(manualPurposes(booking({ status: 'completed', financials: { ...FINANCIALS, assetSecurityDue: 1_000 } }))).toEqual([
      'accommodation',
      'incident',
      'asset_security',
    ]);
    expect(manualPurposes(booking({ status: 'confirmed', financials: { ...FINANCIALS, assetSecurityDue: 999 } }))).toEqual([
      'accommodation',
      'incident',
    ]);
  });

  it('never offers a deposit on a legacy booking', () => {
    expect(manualPurposes(booking({ depositFirst: false, status: 'pending' }))).toEqual(['accommodation']);
    expect(manualPurposes(booking({ depositFirst: false, status: 'expired' }))).toEqual(['accommodation']);
    expect(manualPurposes(booking({ depositFirst: false, status: 'confirmed', financials: { ...FINANCIALS, assetSecurityDue: 400_000 } }))).toEqual([
      'accommodation',
      'incident',
    ]);
  });

  it('takes nothing on a cancelled booking', () => {
    expect(manualPurposes(booking({ status: 'cancelled' }))).toEqual([]);
  });
});

describe('depositRefundBlocker', () => {
  it('allows the refund once everything is settled', () => {
    expect(depositRefundBlocker(booking())).toBeUndefined();
  });

  it('waits while damage is still owed, as the API does (INCIDENT_DUE)', () => {
    expect(depositRefundBlocker(booking({ financials: { ...FINANCIALS, incidentAmountDue: 100_000 } }))).toContain(
      'Khách còn nợ tiền bồi thường',
    );
    expect(depositRefundBlocker(booking({ financials: { ...FINANCIALS, incidentAmountDue: 999 } }))).toBeUndefined();
  });

  it('gives the API reasons in the API order', () => {
    expect(depositRefundBlocker(booking({ status: 'confirmed', amountDue: 5_000, inspection: null }))).toBe('Ghi nhận khách đã trả phòng trước.');
    expect(depositRefundBlocker(booking({ amountDue: 5_000, inspection: null }))).toBe('Khách chưa thanh toán đủ tiền phòng.');
    expect(depositRefundBlocker(booking({ inspection: null }))).toBe('Lưu kết quả kiểm tra trả phòng trước.');
    expect(depositRefundBlocker(booking({ depositRefundable: 999 }))).toBe('Không còn tiền cọc để hoàn.');
  });
});

describe('inspectionLock', () => {
  it('locks the inspection once the deposit is refunded', () => {
    expect(inspectionLock(booking())).toBeUndefined();
    const refunded = booking({ events: [{ type: 'deposit_refunded', actor: 'owner@example.com', data: { amount: 400_000 }, createdAt: '' }] });
    expect(inspectionLock(refunded)).toBe('Đã hoàn cọc; không sửa được kết quả kiểm tra.');
  });
});

describe('transferNote', () => {
  it('ends in TS for a deposit and BT for damage, like the API', () => {
    expect(transferNote('RE-2611-K7Q3M')).toBe('RE2611K7Q3M');
    expect(transferNote('RE-2611-K7Q3M', 'asset_security')).toBe('RE2611K7Q3MTS');
    expect(transferNote('RE-2611-K7Q3M', 'incident')).toBe('RE2611K7Q3MBT');
  });
});

describe('event history', () => {
  const event = (type: string, data: Record<string, unknown> = {}) => ({ type, actor: 'system', data, createdAt: '' });

  it('names the deposit-first events', () => {
    expect(eventLabel(event('policy_accepted'))).toBe('Đồng ý chính sách lưu trú');
    expect(eventLabel(event('inspection_saved'))).toBe('Lưu kiểm tra trả phòng');
    expect(eventLabel(event('deposit_refunded'))).toBe('Hoàn cọc');
    expect(eventLabel(event('identities_missing'))).toContain('thu lại khi nhận phòng');
    expect(eventLabel(event('completed'))).toBe('Hoàn thành');
    expect(eventLabel(event('completed', { reason: 'auto_after_checkout' }))).toBe('Tự động hoàn thành (24 giờ sau giờ trả phòng)');
  });

  it('does not show machine reasons as text', () => {
    expect(eventDetails(event('completed', { reason: 'auto_after_checkout' })).reason).toBeUndefined();
    expect(eventDetails(event('cancelled', { reason: 'Khách đổi kế hoạch' })).reason).toBe('Khách đổi kế hoạch');
  });
});
