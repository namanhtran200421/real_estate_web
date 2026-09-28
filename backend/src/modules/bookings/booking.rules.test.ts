import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../lib/http-error.js';
import { assertValidStay, derivePaymentStatus, isPayable, paymentOptions } from './booking.rules.js';

const NOW = new Date('2026-10-01T05:00:00Z');
const LATER = new Date('2026-10-01T05:30:00Z');
const EARLIER = new Date('2026-10-01T04:30:00Z');

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

describe('paymentOptions', () => {
  const booking = { status: 'pending' as const, amountPaid: 0, holdExpiresAt: LATER, totalAmount: 5_130_000, depositAmount: 1_539_000 };

  it('offers the deposit or the full amount before anything is paid', () => {
    assert.deepEqual(paymentOptions(booking, NOW, false), { deposit: 1_539_000, full: 5_130_000 });
  });

  it('offers only the balance once the deposit is paid', () => {
    assert.deepEqual(paymentOptions({ ...booking, amountPaid: 1_539_000 }, NOW, false), { deposit: null, full: 3_591_000 });
  });

  it('offers nothing when fully paid or no longer payable', () => {
    assert.deepEqual(paymentOptions({ ...booking, amountPaid: 5_130_000 }, NOW, false), { deposit: null, full: null });
    assert.deepEqual(paymentOptions({ ...booking, status: 'cancelled' }, NOW, false), { deposit: null, full: null });
  });

  it('offers nothing while a reported transfer is being checked', () => {
    assert.deepEqual(paymentOptions(booking, NOW, true), { deposit: null, full: null });
  });

  it('skips the deposit option when there is no deposit', () => {
    assert.deepEqual(paymentOptions({ ...booking, depositAmount: 0 }, NOW, false), { deposit: null, full: 5_130_000 });
  });
});

describe('derivePaymentStatus', () => {
  it('follows the money', () => {
    assert.equal(derivePaymentStatus(1_000_000, 0, 0), 'unpaid');
    assert.equal(derivePaymentStatus(1_000_000, 300_000, 0), 'deposit_paid');
    assert.equal(derivePaymentStatus(1_000_000, 1_000_000, 0), 'fully_paid');
    assert.equal(derivePaymentStatus(1_000_000, 1_200_000, 0), 'fully_paid');
    assert.equal(derivePaymentStatus(1_000_000, 1_000_000, 400_000), 'deposit_paid');
    assert.equal(derivePaymentStatus(1_000_000, 300_000, 300_000), 'refunded');
  });
});
