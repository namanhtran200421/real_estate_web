/**
 * Email outbox data access.
 *
 * `enqueue` is called inside the transaction of the change being announced, so the email
 * exists if and only if the change was committed. The sender job claims due emails with a
 * short lease (SKIP LOCKED), so several app instances never send the same email twice.
 */
import { query, type Db } from '../../db/pool.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface QueuedEmail extends OutgoingEmail {
  id: number;
  attempts: number;
}

/** How long a claimed email is reserved for the instance sending it. */
const LEASE = '5 minutes';

async function enqueue(email: OutgoingEmail, db?: Db): Promise<void> {
  await query('INSERT INTO email_outbox (to_address, subject, html, text) VALUES ($1, $2, $3, $4)', [email.to, email.subject, email.html, email.text], db);
}

/** Reserves up to `limit` due emails and counts the attempt. */
async function claimDue(limit: number): Promise<QueuedEmail[]> {
  return query<QueuedEmail>(
    `UPDATE email_outbox
     SET attempts = attempts + 1, next_attempt_at = now() + interval '${LEASE}'
     WHERE id IN (
       SELECT id FROM email_outbox
       WHERE sent_at IS NULL AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, to_address AS "to", subject, html, text, attempts`,
    [limit],
  );
}

async function markSent(id: number, providerMessageId: string): Promise<void> {
  await query('UPDATE email_outbox SET sent_at = now(), provider_message_id = $2, last_error = NULL WHERE id = $1', [
    id,
    providerMessageId,
  ]);
}

/** @param retryInSeconds null = give up (the email stays in the table with its last error). */
async function markFailed(id: number, error: string, retryInSeconds: number | null): Promise<void> {
  if (retryInSeconds === null) {
    await query(`UPDATE email_outbox SET next_attempt_at = 'infinity', last_error = $2 WHERE id = $1`, [id, error]);
    return;
  }
  await query(
    'UPDATE email_outbox SET next_attempt_at = now() + make_interval(secs => $3), last_error = $2 WHERE id = $1',
    [id, error, retryInSeconds],
  );
}

/** Deletes delivered or abandoned emails older than `days`; they hold guests' personal data. */
async function purgeFinished(days: number): Promise<number> {
  const rows = await query(
    `DELETE FROM email_outbox
     WHERE created_at < now() - make_interval(days => $1)
       AND (sent_at IS NOT NULL OR next_attempt_at = 'infinity')
     RETURNING id`,
    [days],
  );
  return rows.length;
}

export const emailRepository = { enqueue, claimDue, markSent, markFailed, purgeFinished };
