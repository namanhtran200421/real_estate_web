import { Booking } from '../models/booking';
import { payButtonKey } from './pay-button';

function booking(overrides: Partial<Booking>): Booking {
  return {
    amountPaid: 0,
    depositFirst: true,
    paymentOptions: { deposit: null, full: null, assetSecurity: null, incident: null },
    ...overrides,
  } as Booking;
}

describe('payButtonKey', () => {
  it('names what is payable now', () => {
    expect(payButtonKey(booking({ paymentOptions: { deposit: null, full: null, assetSecurity: 400_000, incident: null } }))).toBe(
      'confirmation.payDeposit',
    );
    expect(payButtonKey(booking({ paymentOptions: { deposit: null, full: 2_000_000, assetSecurity: null, incident: null } }))).toBe(
      'confirmation.payRent',
    );
    expect(payButtonKey(booking({ paymentOptions: { deposit: null, full: null, assetSecurity: null, incident: 50_000 } }))).toBe(
      'confirmation.payAssets',
    );
  });

  it('reads options missing from an older API as not payable', () => {
    // The API before deposit-first payments: no assetSecurity, incident or depositFirst.
    const older = { amountPaid: 0, paymentOptions: { deposit: 400_000, full: 2_000_000 } } as unknown as Booking;

    expect(payButtonKey(older)).toBe('confirmation.pay');
    expect(payButtonKey({ ...older, amountPaid: 400_000 })).toBe('payment.payRemaining');
  });
});
