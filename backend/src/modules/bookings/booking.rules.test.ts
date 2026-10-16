import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../lib/http-error.js';
import {
  assertValidStay,
  confirmingPurpose,
  depositAmountDue,
  derivePaymentStatus,
  isDepositFirst,
  isPayable,
  paymentOptions,
  POLICY_VERSION,
  rentDueFrom,
} from './booking.rules.js';

const NOW = new Date('2026-10-01T05:00:00Z');
const LATER = new Date('2026-10-01T05:30:00Z');
const EARLIER = new Date('2026-10-01T04:30:00Z');

describe('depositAmountDue', () => {
  it('requires the full deposit net of successful refunds', () => {
    assert.equal(depositAmountDue(680_000, 340_000, 0), 340_000);
    assert.equal(depositAmountDue(680_000, 340_000, 100_000), 440_000);
    assert.equal(depositAmountDue(680_000, 680_000, 100_000), 100_000);
    assert.equal(depositAmountDue(680_000, 780_000, 100_000), 0);
  });

  it('never returns a negative amount for a fully paid or legacy booking', () => {
    assert.equal(depositAmountDue(680_000, 800_000, 0), 0);
    assert.equal(depositAmountDue(0, 0, 0), 0);
  });
});

describe('assertValidStay', () => {
  it('returns the number of nights for a valid stay', () => {
    assert.equal(assertValidStay('2026-10-10', '2026-10-13', '2026-10-01'), 3);
  });

  it('allows checking in today', () => {
    assert.equal(assertValidStay('2026-10-01', '2026-10-02', '2026-10-01'), 1);
  });

  for (const [name, checkIn, checkOut] of [
    ['check-in in the past', '2026-09-30', '2026-10-02'],
    ['check-out before check-in', '2026-10-05', '2026-10-05'],
    ['more than 90 nights', '2026-10-02', '2027-01-15'],
    ['more than a year ahead', '2027-10-10', '2027-10-12'],
  ]) {
    it(`rejects ${name}`, () => {
      assert.throws(() => assertValidStay(checkIn, checkOut, '2026-10-01'), HttpError);
    });
  }
});

describe('isPayable', () => {
  it('accepts an unpaid pending booking while its hold runs', () => {
    assert.equal(isPayable({ status: 'pending', amountPaid: 0, holdExpiresAt: LATER }, NOW), true);
  });

  it('refuses an unpaid pending booking whose hold ran out', () => {
    assert.equal(isPayable({ status: 'pending', amountPaid: 0, holdExpiresAt: EARLIER }, NOW), false);
  });

  it('accepts a partly paid or confirmed booking regardless of the hold', () => {
    assert.equal(isPayable({ status: 'pending', amountPaid: 1_000_000, holdExpiresAt: EARLIER }, NOW), true);
    assert.equal(isPayable({ status: 'confirmed', amountPaid: 0, holdExpiresAt: null }, NOW), true);
  });

  it('refuses cancelled, expired and completed bookings', () => {
    for (const status of ['cancelled', 'expired', 'completed'] as const) {
      assert.equal(isPayable({ status, amountPaid: 0, holdExpiresAt: LATER }, NOW), false);
    }
  });
});

const RULES_NOW = new Date('2026-11-01T03:00:00Z');
const financials = (assetSecurityDue = 0, incidentAmountDue = 0) => ({ assetSecurityDue, incidentAmountDue });
const legacy = {
  status: 'pending',
  amountPaid: 0,
  holdExpiresAt: new Date('2026-11-01T05:00:00Z'),
  totalAmount: 3_400_000,
  depositAmount: 1_020_000,
  assetSecurityAmount: 0,
  checkIn: '2026-11-10',
} as const;
const depositFirst = { ...legacy, depositAmount: 0, assetSecurityAmount: 680_000 } as const;
const none = { deposit: null, full: null, assetSecurity: null, incident: null };

describe('paymentOptions', () => {
  it('legacy: offers the deposit or the full amount before anything is paid', () => {
    assert.deepEqual(paymentOptions(legacy, financials(), RULES_NOW, '2026-11-01', false), {
      ...none, deposit: 1_020_000, full: 3_400_000,
    });
  });

  it('legacy: offers only the balance once the deposit is paid', () => {
    assert.deepEqual(paymentOptions({ ...legacy, amountPaid: 1_020_000 }, financials(), RULES_NOW, '2026-11-01', false), {
      ...none, full: 2_380_000,
    });
  });

  it('deposit-first, pending: only the deposit', () => {
    assert.deepEqual(paymentOptions(depositFirst, financials(680_000), RULES_NOW, '2026-11-01', false), {
      ...none, assetSecurity: 680_000,
    });
  });

  it('deposit-first, pending, hold ran out: nothing', () => {
    const b = { ...depositFirst, holdExpiresAt: new Date('2026-11-01T02:00:00Z') };
    assert.deepEqual(paymentOptions(b, financials(680_000), RULES_NOW, '2026-11-01', false), none);
  });

  it('deposit-first, confirmed before check-in day: nothing', () => {
    const b = { ...depositFirst, status: 'confirmed', holdExpiresAt: null } as const;
    assert.deepEqual(paymentOptions(b, financials(0), RULES_NOW, '2026-11-09', false), none);
  });

  it('deposit-first, confirmed on check-in day: the full rent', () => {
    const b = { ...depositFirst, status: 'confirmed', holdExpiresAt: null } as const;
    assert.deepEqual(paymentOptions(b, financials(0), RULES_NOW, '2026-11-10', false), { ...none, full: 3_400_000 });
  });

  it('deposit-first, completed with rent paid and an incident due: only the incident', () => {
    const b = { ...depositFirst, status: 'completed', amountPaid: 3_400_000, holdExpiresAt: null } as const;
    assert.deepEqual(paymentOptions(b, financials(0, 500_000), RULES_NOW, '2026-11-12', false), {
      ...none, incident: 500_000,
    });
  });

  it('offers nothing while a transfer is being checked, for both kinds', () => {
    assert.deepEqual(paymentOptions(legacy, financials(), RULES_NOW, '2026-11-01', true), none);
    assert.deepEqual(paymentOptions(depositFirst, financials(680_000), RULES_NOW, '2026-11-01', true), none);
  });

  it('never offers amounts below 1.000 VND', () => {
    assert.equal(paymentOptions(depositFirst, financials(500), RULES_NOW, '2026-11-01', false).assetSecurity, null);
  });
});

describe('rentDueFrom', () => {
  it('is the check-in day while the rent is owed', () => {
    assert.equal(rentDueFrom(depositFirst), '2026-11-10');
  });
  it('is null once paid, for legacy bookings and for dead bookings', () => {
    assert.equal(rentDueFrom({ ...depositFirst, amountPaid: 3_400_000 }), null);
    assert.equal(rentDueFrom(legacy), null);
    assert.equal(rentDueFrom({ ...depositFirst, status: 'cancelled' }), null);
    assert.equal(rentDueFrom({ ...depositFirst, status: 'expired' }), null);
  });
});

describe('derivePaymentStatus', () => {
  const m = (total: number, rentReceived: number, rentRefunded: number, depositReceived: number, depositRefunded: number) => ({
    total, rentReceived, rentRefunded, depositReceived, depositRefunded,
  });
  it('follows the money', () => {
    assert.equal(derivePaymentStatus(m(100, 100, 0, 20, 20)), 'fully_paid');
    assert.equal(derivePaymentStatus(m(100, 30, 0, 0, 0)), 'deposit_paid');
    assert.equal(derivePaymentStatus(m(100, 0, 0, 20, 0)), 'deposit_paid');
    assert.equal(derivePaymentStatus(m(100, 0, 0, 20, 20)), 'refunded');
    assert.equal(derivePaymentStatus(m(100, 0, 0, 0, 0)), 'unpaid');
  });
});

describe('deposit-first helpers', () => {
  it('knows the kind and the confirming purpose', () => {
    assert.equal(isDepositFirst(depositFirst), true);
    assert.equal(isDepositFirst(legacy), false);
    assert.equal(confirmingPurpose(legacy), 'accommodation');
    assert.equal(confirmingPurpose(depositFirst), 'asset_security');
    assert.equal(POLICY_VERSION, '2026-10-14');
  });
});
