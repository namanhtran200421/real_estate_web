/**
 * Sends one email through Resend's HTTP API (https://resend.com/docs/api-reference/emails).
 *
 * The outbox row id is passed as Resend's `Idempotency-Key`, so if a send times out after
 * Resend accepted it, the retry does not deliver a second copy.
 * Without RESEND_API_KEY (development only; production refuses to start) the email is
 * written to the log instead of being sent.
 */
import { env } from '../../config/env.js';
import { postJson } from '../../lib/http-client.js';
import { logger } from '../../lib/logger.js';
import type { OutgoingEmail } from './email.repository.js';

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 15_000;

/** @returns Resend's message id */
export async function sendEmail(email: OutgoingEmail, idempotencyKey: string): Promise<string> {
  if (!env.email.resendApiKey) {
    logger.info('Email (not sent: RESEND_API_KEY is not set)', { to: email.to, subject: email.subject, text: email.text });
    return 'logged';
  }

  const response = await postJson<{ id: string }>(
    RESEND_URL,
    { from: env.email.from, to: [email.to], subject: email.subject, html: email.html, text: email.text },
    {
      headers: { Authorization: `Bearer ${env.email.resendApiKey}`, 'Idempotency-Key': idempotencyKey },
      timeoutMs: TIMEOUT_MS,
    },
  );
  return response.id;
}
