/**
 * Encryption of guests' identity documents: AES-256-GCM with a random IV, and the booking id and
 * guest index as additional authenticated data, so a payload only opens on its own row. The
 * plaintext is never persisted. Pure: the caller passes the key (see guest-identity.repository.ts).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { GuestIdentity } from './booking.types.js';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
/** Full-length GCM tag: a shortened tag in a payload is refused rather than checked on fewer bytes. */
const AUTH_TAG_LENGTH = 16;

/** The 256-bit key derived from the configured secret. */
export function identityKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

function additionalData(bookingId: string, guestIndex: number): Buffer {
  return Buffer.from(`${bookingId}:${guestIndex}`, 'utf8');
}

export function encryptGuestIdentity(identity: GuestIdentity, key: Buffer, bookingId: string, guestIndex: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(additionalData(bookingId, guestIndex));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(identity), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

/** @throws when the payload is malformed, or was sealed with another key, booking id or guest index */
export function decryptGuestIdentity(payload: string, key: Buffer, bookingId: string, guestIndex: number): GuestIdentity {
  const [version, ivValue, tagValue, dataValue] = payload.split('.');
  if (version !== VERSION || !ivValue || !tagValue || !dataValue) throw new Error('Unsupported guest identity payload');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, 'base64url'), { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAAD(additionalData(bookingId, guestIndex));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataValue, 'base64url')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as GuestIdentity;
}
