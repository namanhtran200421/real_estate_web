/**
 * Email notifications.
 *
 * Services call `queue*` inside their transaction; `deliverDueEmails` (a background job)
 * sends them with exponential backoff: 1, 2, 4 … minutes, giving up after 8 attempts.
 */
import { env } from '../../config/env.js';
import type { Db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { emailRepository } from './email.repository.js';
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  ownerContactEmail,
  ownerTransferReportedEmail,
  paymentReceivedEmail,
  refundIssuedEmail,
  transferNotReceivedEmail,
  transferReportedEmail,
  type BookingEmailContext,
  type ContactEmailContext,
  type TransferContext,
} from './email.templates.js';
import { sendEmail } from './resend.client.js';

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 8;

/** Acknowledgement to the guest; "please check your bank account" to the owner. */
async function queueTransferReported(booking: BookingEmailContext, transfer: TransferContext, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...transferReportedEmail(booking, transfer) }, db);
  await emailRepository.enqueue({ to: env.email.ownerAddress, ...ownerTransferReportedEmail(booking, transfer) }, db);
}

async function queueTransferNotReceived(booking: BookingEmailContext, reason: string, holdMinutes: number, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...transferNotReceivedEmail(booking, reason, holdMinutes) }, db);
}

/** Receipt to the guest once the owner has the money. */
async function queuePaymentReceived(booking: BookingEmailContext, amount: number, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: booking.customerEmail, ...paymentReceivedEmail(booking, amount) }, db);
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

async function queueContactMessage(contact: ContactEmailContext, db: Db): Promise<void> {
  await emailRepository.enqueue({ to: env.email.ownerAddress, ...ownerContactEmail(contact) }, db);
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

export const emailService = {
  queueTransferReported,
  queueTransferNotReceived,
  queuePaymentReceived,
  queueBookingConfirmed,
  queueBookingCancelled,
  queueRefundIssued,
  queueContactMessage,
  deliverDueEmails,
};
