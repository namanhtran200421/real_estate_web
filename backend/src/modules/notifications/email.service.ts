/**
 * Email notifications.
 *
 * Services call `queue*` inside their transaction; `deliverDueEmails` (a background job)
 * sends them with exponential backoff: 1, 2, 4 … minutes, giving up after 8 attempts.
 */
import { env } from '../../config/env.js';
import type { Db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import type { PaymentPurpose } from '../bookings/booking.types.js';
import { emailRepository, type OutgoingEmail } from './email.repository.js';
import {
  adminPasswordChangedEmail,
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingHeldEmail,
  checkoutReminderEmail,
  ownerContactEmail,
  ownerHoldEndingEmail,
  ownerLateCheckoutEmail,
  ownerNewBookingEmail,
  ownerTransferReportedEmail,
  paymentReceivedEmail,
  refundIssuedEmail,
  rentRequestEmail,
  transferNotReceivedEmail,
  transferReportedEmail,
  type BookingEmailContext,
  type ContactEmailContext,
  type PasswordChangedContext,
  type TransferContext,
} from './email.templates.js';
import { sendEmail } from './resend.client.js';

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 8;
/** Sent emails are kept this long for support questions, then deleted. */
const RETENTION_DAYS = 90;

/** One copy to each OWNER_EMAIL address, so each is delivered and retried on its own. */
async function queueToOwner(content: Omit<OutgoingEmail, 'to'>, db: Db): Promise<void> {
  for (const to of env.email.ownerAddresses) await emailRepository.enqueue({ to, ...content }, db);
}

/** New booking: how to pay, to the guest; "watch for this transfer", to the owner. */
async function queueBookingHeld(booking: BookingEmailContext, note: string, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...bookingHeldEmail(booking, note) }, db);
  await queueToOwner(ownerNewBookingEmail(booking, note), db);
}

async function queueHoldEndingReminder(booking: BookingEmailContext, note: string, db: Db): Promise<void> {
  await queueToOwner(ownerHoldEndingEmail(booking, note), db);
}

/** Acknowledgement to the guest; "please check your bank account" to the owner. */
async function queueTransferReported(booking: BookingEmailContext, transfer: TransferContext, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...transferReportedEmail(booking, transfer) }, db);
  await queueToOwner(ownerTransferReportedEmail(booking, transfer), db);
}

async function queueTransferNotReceived(booking: BookingEmailContext, reason: string, holdMinutes: number | null, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...transferNotReceivedEmail(booking, reason, holdMinutes) }, db);
}

/** Receipt to the guest once the owner has the money. */
async function queuePaymentReceived(booking: BookingEmailContext, amount: number, purpose: PaymentPurpose, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...paymentReceivedEmail(booking, amount, purpose) }, db);
}

async function queueBookingConfirmed(booking: BookingEmailContext, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...bookingConfirmedEmail(booking) }, db);
}

async function queueBookingCancelled(booking: BookingEmailContext, reason: string, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...bookingCancelledEmail(booking, reason) }, db);
}

async function queueRefundIssued(booking: BookingEmailContext, amount: number, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...refundIssuedEmail(booking, amount) }, db);
}

async function queueCheckoutReminder(booking: BookingEmailContext, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...checkoutReminderEmail(booking) }, db);
}

async function queueRentRequest(booking: BookingEmailContext, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...rentRequestEmail(booking) }, db);
}

async function queueLateCheckoutAlert(
  booking: BookingEmailContext,
  nextArrivalReference: string | null,
  db: Db,
): Promise<void> {
  await queueToOwner(ownerLateCheckoutEmail(booking, nextArrivalReference), db);
}

async function queueAdminPasswordChanged(change: PasswordChangedContext): Promise<void> {
  await emailRepository.enqueue({ to: change.email, ...adminPasswordChangedEmail(change) });
}

async function queueContactMessage(contact: ContactEmailContext, db: Db): Promise<void> {
  await queueToOwner(ownerContactEmail(contact), db);
}

function retryDelaySeconds(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return 60 * 2 ** (attempts - 1);
}

/** Background job: sends every email that is due. */
async function deliverDueEmails(): Promise<void> {
  for (;;) {
    const batch = await emailRepository.claimDue(BATCH_SIZE);
    if (batch.length === 0) return;

    for (const email of batch) {
      try {
        const messageId = await sendEmail(email, `email-outbox-${email.id}`);
        await emailRepository.markSent(email.id, messageId);
      } catch (error) {
        const retryIn = retryDelaySeconds(email.attempts);
        logger.warn('Email delivery failed', { emailId: email.id, attempts: email.attempts, giveUp: retryIn === null, error });
        await emailRepository.markFailed(email.id, (error as Error).message, retryIn);
      }
    }
  }
}

/** Background job: deletes old delivered (or abandoned) emails. */
async function purgeOldEmails(): Promise<number> {
  return emailRepository.purgeFinished(RETENTION_DAYS);
}

export const emailService = {
  purgeOldEmails,
  queueBookingHeld,
  queueHoldEndingReminder,
  queueTransferReported,
  queueTransferNotReceived,
  queuePaymentReceived,
  queueBookingConfirmed,
  queueBookingCancelled,
  queueRefundIssued,
  queueCheckoutReminder,
  queueRentRequest,
  queueLateCheckoutAlert,
  queueAdminPasswordChanged,
  queueContactMessage,
  deliverDueEmails,
};
