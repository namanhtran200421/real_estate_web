/**
 * The background jobs and how often they run.
 *
 * | Job                     | Every  | Why                                                              |
 * | ----------------------- | ------ | ---------------------------------------------------------------- |
 * | send-emails             | 15 s   | Deliver queued emails, with retries                              |
 * | expire-holds            | 1 min  | Free dates held by bookings that were never paid                 |
 * | remind-owner            | 1 min  | Remind the owner to look for a transfer before its hold runs out |
 * | checkout-notifications  | 15 min | Remind guests and alert the Owner about late check-outs          |
 * | rent-requests          | 15 min | Ask deposit-first guests for the rent on check-in morning         |
 * | purge-admin-sessions    | 1 h    | Delete expired admin sessions                                    |
 * | purge-emails            | 6 h    | Delete sent emails after 90 days (they hold guests' details)     |
 * | purge-screenshots       | 6 h    | Delete checked transfer screenshots 35 days after upload         |
 */
import { adminAuthService } from '../modules/admin-auth/admin-auth.service.js';
import { bookingService } from '../modules/bookings/booking.service.js';
import { emailService } from '../modules/notifications/email.service.js';
import { paymentService } from '../modules/payments/payment.service.js';
import type { Job } from './scheduler.js';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const jobs: Job[] = [
  { name: 'send-emails', intervalMs: 15 * SECOND, run: emailService.deliverDueEmails },
  { name: 'expire-holds', intervalMs: MINUTE, run: bookingService.expireStaleHolds },
  { name: 'remind-owner', intervalMs: MINUTE, run: bookingService.remindOwnerOfEndingHolds },
  { name: 'checkout-notifications', intervalMs: 15 * MINUTE, run: bookingService.sendCheckoutNotifications },
  { name: 'rent-requests', intervalMs: 15 * MINUTE, run: bookingService.sendRentRequests },
  { name: 'purge-admin-sessions', intervalMs: HOUR, run: adminAuthService.purgeExpiredSessions },
  { name: 'purge-emails', intervalMs: 6 * HOUR, run: emailService.purgeOldEmails },
  { name: 'purge-screenshots', intervalMs: 6 * HOUR, run: () => paymentService.purgeOldTransferScreenshots() },
  { name: 'purge-guest-identities', intervalMs: 6 * HOUR, run: bookingService.purgeExpiredGuestIdentities },
];
