/**
 * The background jobs and how often they run.
 *
 * | Job                     | Every  | Why                                                              |
 * | ----------------------- | ------ | ---------------------------------------------------------------- |
 * | send-emails             | 15 s   | Deliver queued emails, with retries                              |
 * | expire-holds            | 1 min  | Free dates held by bookings that were never paid                 |
 * | complete-stays          | 15 min | Mark confirmed stays as completed once check-out has passed      |
 * | purge-admin-sessions    | 1 h    | Delete expired admin sessions                                    |
 */
import { adminAuthService } from '../modules/admin-auth/admin-auth.service.js';
import { bookingService } from '../modules/bookings/booking.service.js';
import { emailService } from '../modules/notifications/email.service.js';
import type { Job } from './scheduler.js';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const jobs: Job[] = [
  { name: 'send-emails', intervalMs: 15 * SECOND, run: emailService.deliverDueEmails },
  { name: 'expire-holds', intervalMs: MINUTE, run: bookingService.expireStaleHolds },
  { name: 'complete-stays', intervalMs: 15 * MINUTE, run: bookingService.completeFinishedStays },
  { name: 'purge-admin-sessions', intervalMs: 60 * MINUTE, run: adminAuthService.purgeExpiredSessions },
];
