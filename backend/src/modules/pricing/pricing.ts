/**
 * Stay pricing. Pure functions: no database, no clock, so every rule is unit-tested.
 *
 * Rules (as shown to guests on the apartment page):
 * 1. Each night is priced by its date: holiday rate on holidays, weekend rate on Friday,
 *    Saturday and Sunday nights, weekday rate Monday–Thursday.
 * 2. Long-stay discount: the best tier the stay qualifies for (e.g. 7+ nights → 15%),
 *    applied to non-holiday nights only ("Không áp dụng giảm giá cho ngày lễ").
 * 3. Weekly / monthly rates: stays of 7+ nights may instead be priced as whole months
 *    (30 nights) and weeks (7 nights) plus the remaining nights at nightly rates.
 *    The guest always gets whichever of rules 2 and 3 is cheaper, never both.
 * 4. A promo code then takes a percentage or fixed amount off what remains.
 * 5. Deposit = total × deposit percent, rounded to the nearest 1,000 ₫.
 *
 * All amounts are whole VND.
 */
import { dayOfWeek } from '../../lib/dates.js';

export type NightRate = 'weekday' | 'weekend' | 'holiday';

export interface LongStayDiscount {
  nights: number;
  percent: number;
}

export interface PricingRules {
  weekday: number;
  weekend: number;
  holiday: number;
  /** Price for 7 nights; 0 = not offered. */
  weekly: number;
  /** Price for 30 nights; 0 = not offered. */
  monthly: number;
  longStayDiscounts: LongStayDiscount[];
  depositPercent: number;
}

export interface PromoRule {
  code: string;
  percent: number | null;
  amount: number | null;
}

export interface NightLine {
  date: string;
  rate: NightRate;
  amount: number;
}

export interface StayDiscount {
  kind: 'long_stay' | 'weekly_monthly';
  /** Set for long-stay discounts only. */
  percent: number | null;
  amount: number;
}

export interface PriceBreakdown {
  lines: NightLine[];
  /** Sum of the nightly lines, before any discount. */
  subtotal: number;
  stayDiscount: StayDiscount | null;
  promo: { code: string; amount: number } | null;
  /** stayDiscount + promo. */
  discountTotal: number;
  total: number;
  depositPercent: number;
  deposit: number;
}

const WEEKEND_DAYS = new Set([5, 6, 0]); // Friday, Saturday, Sunday nights
const NIGHTS_PER_WEEK = 7;
const NIGHTS_PER_MONTH = 30;

function rateFor(date: string, holidays: ReadonlySet<string>): NightRate {
  if (holidays.has(date)) return 'holiday';
  if (WEEKEND_DAYS.has(dayOfWeek(date))) return 'weekend';
  return 'weekday';
}

function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** Best tier the stay length qualifies for, or 0. */
function longStayPercent(nights: number, tiers: LongStayDiscount[]): number {
  let best = 0;
  for (const tier of tiers) {
    if (tier.nights <= nights && tier.percent > best) best = tier.percent;
  }
  return best;
}

function longStayDiscount(lines: NightLine[], rules: PricingRules): StayDiscount | null {
  const percent = longStayPercent(lines.length, rules.longStayDiscounts);
  if (percent === 0) return null;

  const discountable = sum(lines.filter((line) => line.rate !== 'holiday').map((line) => line.amount));
  const amount = Math.round((discountable * percent) / 100);
  if (amount === 0) return null;
  return { kind: 'long_stay', percent, amount };
}

/** Whole months and weeks at their package price; leftover nights (the last ones) at nightly rates. */
function packageDiscount(lines: NightLine[], rules: PricingRules, subtotal: number): StayDiscount | null {
  let remaining = lines.length;

  let months = 0;
  if (rules.monthly > 0) {
    months = Math.floor(remaining / NIGHTS_PER_MONTH);
    remaining -= months * NIGHTS_PER_MONTH;
  }

  let weeks = 0;
  if (rules.weekly > 0) {
    weeks = Math.floor(remaining / NIGHTS_PER_WEEK);
    remaining -= weeks * NIGHTS_PER_WEEK;
  }

  if (months === 0 && weeks === 0) return null;

  const leftover = sum(lines.slice(lines.length - remaining).map((line) => line.amount));
  const packageTotal = months * rules.monthly + weeks * rules.weekly + leftover;
  const amount = subtotal - packageTotal;
  if (amount <= 0) return null;
  return { kind: 'weekly_monthly', percent: null, amount };
}

function bestStayDiscount(lines: NightLine[], rules: PricingRules, subtotal: number): StayDiscount | null {
  const longStay = longStayDiscount(lines, rules);
  const packaged = packageDiscount(lines, rules, subtotal);
  if (!longStay) return packaged;
  if (!packaged) return longStay;
  if (packaged.amount > longStay.amount) return packaged;
  return longStay;
}

function promoAmount(promo: PromoRule, base: number): number {
  if (promo.percent !== null) return Math.round((base * promo.percent) / 100);
  return Math.min(promo.amount ?? 0, base);
}

export function depositFor(total: number, depositPercent: number): number {
  const rounded = Math.round((total * depositPercent) / 100 / 1_000) * 1_000;
  return Math.min(rounded, total);
}

/**
 * Prices a stay.
 * @param nights  the stay's night dates, in order (see `nightsOf`)
 * @param holidays holiday dates within the stay
 */
export function priceStay(
  nights: string[],
  rules: PricingRules,
  holidays: ReadonlySet<string>,
  promo: PromoRule | null = null,
): PriceBreakdown {
  const lines = nights.map((date) => {
    const rate = rateFor(date, holidays);
    return { date, rate, amount: rules[rate] };
  });
  const subtotal = sum(lines.map((line) => line.amount));

  const stayDiscount = bestStayDiscount(lines, rules, subtotal);
  const afterStayDiscount = subtotal - (stayDiscount?.amount ?? 0);

  let promoLine: PriceBreakdown['promo'] = null;
  if (promo) promoLine = { code: promo.code, amount: promoAmount(promo, afterStayDiscount) };

  const total = afterStayDiscount - (promoLine?.amount ?? 0);

  return {
    lines,
    subtotal,
    stayDiscount,
    promo: promoLine,
    discountTotal: subtotal - total,
    total,
    depositPercent: rules.depositPercent,
    deposit: depositFor(total, rules.depositPercent),
  };
}
