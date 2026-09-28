import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nightsOf } from '../../lib/dates.js';
import { depositFor, priceStay, type PricingRules } from './pricing.js';

// Prices of Sun Garden A04-12 from the owner's price sheet.
const RULES: PricingRules = {
  weekday: 1_700_000,
  weekend: 1_850_000,
  holiday: 3_190_000,
  weekly: 10_250_000,
  monthly: 15_000_000,
  longStayDiscounts: [
    { nights: 2, percent: 3 },
    { nights: 3, percent: 5 },
    { nights: 4, percent: 7 },
    { nights: 5, percent: 9 },
    { nights: 6, percent: 11 },
    { nights: 7, percent: 15 },
  ],
  depositPercent: 30,
};

const NO_HOLIDAYS = new Set<string>();

describe('priceStay', () => {
  it('prices Monday–Thursday as weekday and Friday–Sunday as weekend nights', () => {
    // 2026-11-19 is a Thursday.
    const quote = priceStay(nightsOf('2026-11-19', '2026-11-23'), RULES, NO_HOLIDAYS);
    assert.deepEqual(
      quote.lines.map((line) => line.rate),
      ['weekday', 'weekend', 'weekend', 'weekend'],
    );
    assert.equal(quote.subtotal, 1_700_000 + 3 * 1_850_000);
  });

  it('prices a three-night stay with the listed 5% discount and 30% deposit', () => {
    const quote = priceStay(nightsOf('2026-11-19', '2026-11-22'), RULES, NO_HOLIDAYS);
    assert.equal(quote.subtotal, 5_400_000);
    assert.deepEqual(quote.stayDiscount, { kind: 'long_stay', percent: 5, amount: 270_000 });
    assert.equal(quote.total, 5_130_000);
    assert.equal(quote.deposit, 1_539_000);
  });

  it('charges a single night without discount', () => {
    const quote = priceStay(['2026-11-16'], RULES, NO_HOLIDAYS);
    assert.equal(quote.stayDiscount, null);
    assert.equal(quote.total, 1_700_000);
  });

  it('uses the holiday rate and excludes holiday nights from the long-stay discount', () => {
    const quote = priceStay(nightsOf('2026-04-29', '2026-05-01'), RULES, new Set(['2026-04-30']));
    assert.deepEqual(
      quote.lines.map((line) => line.rate),
      ['weekday', 'holiday'],
    );
    // 3% of the weekday night only.
    assert.equal(quote.stayDiscount?.amount, Math.round(1_700_000 * 0.03));
  });

  it('keeps the top long-stay tier for stays longer than the last tier', () => {
    const quote = priceStay(nightsOf('2026-11-02', '2026-11-12'), { ...RULES, weekly: 0, monthly: 0 }, NO_HOLIDAYS);
    assert.equal(quote.stayDiscount?.percent, 15);
  });

  it('switches to the monthly rate when it is cheaper', () => {
    const quote = priceStay(nightsOf('2026-11-01', '2026-12-01'), RULES, NO_HOLIDAYS);
    assert.equal(quote.stayDiscount?.kind, 'weekly_monthly');
    assert.equal(quote.total, 15_000_000);
  });

  it('prices leftover nights of a package stay at nightly rates', () => {
    // 8 nights = 1 week + 1 night (the last night, a Monday).
    const quote = priceStay(nightsOf('2026-11-02', '2026-11-10'), RULES, NO_HOLIDAYS);
    const longStayTotal = quote.subtotal - Math.round(quote.subtotal * 0.15);
    const packageTotal = 10_250_000 + 1_700_000;
    assert.equal(quote.total, Math.min(longStayTotal, packageTotal));
  });

  it('ignores packages that are not offered', () => {
    const quote = priceStay(nightsOf('2026-11-01', '2026-12-01'), { ...RULES, weekly: 0, monthly: 0 }, NO_HOLIDAYS);
    assert.equal(quote.stayDiscount?.kind, 'long_stay');
  });

  it('applies a percentage promo after the stay discount', () => {
    const quote = priceStay(nightsOf('2026-11-19', '2026-11-22'), RULES, NO_HOLIDAYS, {
      code: 'WELCOME10',
      percent: 10,
      amount: null,
    });
    assert.deepEqual(quote.promo, { code: 'WELCOME10', amount: 513_000 });
    assert.equal(quote.total, 4_617_000);
    assert.equal(quote.discountTotal, 270_000 + 513_000);
  });

  it('never lets a fixed promo make the total negative', () => {
    const quote = priceStay(['2026-11-16'], RULES, NO_HOLIDAYS, { code: 'BIG', percent: null, amount: 99_000_000 });
    assert.equal(quote.total, 0);
    assert.equal(quote.deposit, 0);
  });
});

describe('depositFor', () => {
  it('rounds to the nearest thousand and never exceeds the total', () => {
    assert.equal(depositFor(5_130_000, 30), 1_539_000);
    assert.equal(depositFor(1_001_500, 30), 300_000);
    assert.equal(depositFor(500, 100), 500);
    assert.equal(depositFor(1_000_000, 0), 0);
  });
});
