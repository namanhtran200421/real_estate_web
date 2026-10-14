import { Booking } from '../models/booking';

/** Translation key of the pay button on the confirmation and lookup pages. */
export function payButtonKey(b: Booking): string {
  const options = b.paymentOptions;
  if (options.assetSecurity !== null) return 'confirmation.payDeposit';
  if (options.full !== null && b.depositFirst) return 'confirmation.payRent';
  if (options.full === null && options.deposit === null && options.incident !== null) return 'confirmation.payAssets';
  return b.amountPaid > 0 ? 'payment.payRemaining' : 'confirmation.pay';
}
