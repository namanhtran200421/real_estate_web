import { env } from '../../config/env.js';
import { query, type Db } from '../../db/pool.js';
import type { GuestIdentity } from './booking.types.js';
import { decryptGuestIdentity, encryptGuestIdentity } from './guest-identity.crypto.js';

interface IdentityRow {
  guest_index: number;
  encrypted_payload: string;
}

async function insertAll(bookingId: string, checkOut: string, identities: GuestIdentity[], db: Db): Promise<void> {
  for (const [guestIndex, identity] of identities.entries()) {
    await query(
      `INSERT INTO booking_guest_identities (booking_id, guest_index, encrypted_payload, purge_after)
       VALUES ($1, $2, $3, ($4::date + make_interval(days => $5))::timestamptz)`,
      [
        bookingId,
        guestIndex,
        encryptGuestIdentity(identity, bookingId, guestIndex),
        checkOut,
        env.booking.identityRetentionDays,
      ],
      db,
    );
  }
}

async function list(bookingId: string): Promise<GuestIdentity[]> {
  const rows = await query<IdentityRow>(
    `SELECT guest_index, encrypted_payload FROM booking_guest_identities
     WHERE booking_id = $1 AND purge_after > now()
     ORDER BY guest_index`,
    [bookingId],
  );
  return rows.map((row) => decryptGuestIdentity(row.encrypted_payload, bookingId, row.guest_index));
}

async function purgeExpired(): Promise<number> {
  const rows = await query(`DELETE FROM booking_guest_identities WHERE purge_after <= now() RETURNING booking_id`);
  return rows.length;
}

export const guestIdentityRepository = { insertAll, list, purgeExpired };
