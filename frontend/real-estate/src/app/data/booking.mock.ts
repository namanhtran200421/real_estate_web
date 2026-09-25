import { Pricing } from '../models/apartment';
import { Booking } from '../models/booking';

// Placeholder booking used by the static booking-flow pages until the backend exists.
export const SAMPLE_BOOKING: Booking = {
  reference: 'RE-2611-0042',
  checkIn: '2026-11-19',
  checkOut: '2026-11-22',
  guests: 2,
  customer: {
    name: 'Nguyễn Văn An',
    phone: '0900 000 000',
    email: 'an.nguyen@example.com',
  },
  message: 'Chúng tôi dự kiến đến khoảng 15:00.',
  nights: [
    { date: '2026-11-19', rate: 'weekday' },
    { date: '2026-11-20', rate: 'weekend' },
    { date: '2026-11-21', rate: 'weekend' },
  ],
  depositPercent: 30,
  status: 'pending',
  paymentStatus: 'deposit_paid',
  createdAt: '2026-09-25',
};

/**
 * Display-only price breakdown for SAMPLE_BOOKING so the placeholder numbers
 * match each apartment's prices. The real calculation will live in the backend.
 */
export function sampleQuote(pricing: Pricing) {
  const lines = SAMPLE_BOOKING.nights.map((n) => ({ ...n, amount: pricing[n.rate] }));
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const discountPercent =
    pricing.longStayDiscounts.find((d) => d.nights === lines.length)?.percent ?? 0;
  const discount = Math.round((subtotal * discountPercent) / 100);
  const total = subtotal - discount;
  const deposit = Math.round((total * SAMPLE_BOOKING.depositPercent) / 100 / 1000) * 1000;
  return { lines, subtotal, discountPercent, discount, total, deposit, remaining: total - deposit };
}
