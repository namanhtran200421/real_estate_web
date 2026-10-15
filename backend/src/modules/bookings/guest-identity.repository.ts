/**
 * Guests' identity documents (temporary-stay registration), encrypted per guest.
 *
 * Retention (`purge_after`): the scheduled check-out plus GUEST_IDENTITY_RETENTION_DAYS for a stay
 * that happens. A booking that never happens (expired or cancelled) keeps them at most 3 more days;
 * a late payment that brings an expired booking back restores the full retention. The purge job
 * deletes rows past `purge_after` and records `identities_purged` on the booking.
 */
import { env } from '../../config/env.js';
import { query, type Db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import type { AdminGuestIdentity, GuestIdentity } from './booking.types.js';
import { decryptGuestIdentity, encryptGuestIdentity, identityKey } from './guest-identity.crypto.js';

/** How long the identities of a booking that never happens are kept. */
export const UNUSED_IDENTITY_RETENTION = "interval '3 days'";

const key = identityKey(env.booking.identityEncryptionKey);

interface IdentityRow {
  guest_index: number;
  encrypted_payload: string;
  live: boolean;
}

async function insertAll(bookingId: string, checkOut: string, identities: GuestIdentity[], db: Db): Promise<void> {
  for (const [guestIndex, identity] of identities.entries()) {
    await query(
      `INSERT INTO booking_guest_identities (booking_id, guest_index, encrypted_payload, purge_after)
       VALUES ($1, $2, $3, ($4::date + make_interval(days => $5))::timestamptz)`,
      [
        bookingId,
        guestIndex,
        encryptGuestIdentity(identity, key, bookingId, guestIndex),
        checkOut,
        env.booking.identityRetentionDays,
      ],
      db,
    );
  }
}

function open(bookingId: string, row: IdentityRow): AdminGuestIdentity {
  try {
    return { ...decryptGuestIdentity(row.encrypted_payload, key, bookingId, row.guest_index), guestIndex: row.guest_index };
  } catch (error) {
    // A wrong or lost key: one guest shows as unreadable instead of the booking page failing.
    logger.error('Guest identity could not be decrypted', { bookingId, guestIndex: row.guest_index, error });
    return { guestIndex: row.guest_index, unreadable: true };
  }
}

/**
 * The booking's identities still within retention, decrypted, and how many rows are past their
 * retention date but not deleted yet (the purge job runs every few hours).
 */
async function forAdmin(bookingId: string): Promise<{ identities: AdminGuestIdentity[]; expired: number }> {
  const rows = await query<IdentityRow>(
    `SELECT guest_index, encrypted_payload, purge_after > now() AS live FROM booking_guest_identities
     WHERE booking_id = $1
     ORDER BY guest_index`,
    [bookingId],
  );
  return {
    identities: rows.filter((row) => row.live).map((row) => open(bookingId, row)),
    expired: rows.filter((row) => !row.live).length,
  };
}

/** The booking will not happen (cancelled): keep its identities at most 3 more days. */
async function shortenRetention(bookingId: string, db: Db): Promise<void> {
  await query(
    `UPDATE booking_guest_identities SET purge_after = least(purge_after, now() + ${UNUSED_IDENTITY_RETENTION})
     WHERE booking_id = $1`,
    [bookingId],
    db,
  );
}

/**
 * The booking is back (an expired booking paid late): its identities are kept until the scheduled
 * check-out plus the retention days again, as when it was created.
 * @returns how many identities were still there (0: already deleted, to be collected at check-in)
 */
async function restoreRetention(bookingId: string, checkOut: string, db: Db): Promise<number> {
  const rows = await query(
    `UPDATE booking_guest_identities SET purge_after = ($2::date + make_interval(days => $3))::timestamptz
     WHERE booking_id = $1
     RETURNING guest_index`,
    [bookingId, checkOut, env.booking.identityRetentionDays],
    db,
  );
  return rows.length;
}

/**
 * Deletes identities past their retention date and records `identities_purged` once per booking.
 * @param now the job's clock (tests pass a later one)
 */
async function purgeExpired(now: Date): Promise<number> {
  const rows = await query<{ count: number }>(
    `WITH purged AS (
       DELETE FROM booking_guest_identities WHERE purge_after <= $1::timestamptz RETURNING booking_id
     ), recorded AS (
       INSERT INTO booking_events (booking_id, type, actor, data)
       SELECT booking_id, 'identities_purged', 'system', jsonb_build_object('count', count(*)) FROM purged GROUP BY booking_id
     )
     SELECT count(*)::int AS count FROM purged`,
    [now],
  );
  return rows[0].count;
}

export const guestIdentityRepository = { insertAll, forAdmin, shortenRetention, restoreRetention, purgeExpired };
