import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import type { GuestIdentity } from './booking.types.js';

const VERSION = 'v1';
const key = createHash('sha256').update(env.booking.identityEncryptionKey, 'utf8').digest();

/** AES-256-GCM with a random IV and booking/guest AAD; plaintext is never persisted. */
export function encryptGuestIdentity(identity: GuestIdentity, bookingId: string, guestIndex: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${bookingId}:${guestIndex}`, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(identity), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptGuestIdentity(payload: string, bookingId: string, guestIndex: number): GuestIdentity {
  const [version, ivValue, tagValue, dataValue] = payload.split('.');
  if (version !== VERSION || !ivValue || !tagValue || !dataValue) throw new Error('Unsupported guest identity payload');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAAD(Buffer.from(`${bookingId}:${guestIndex}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataValue, 'base64url')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as GuestIdentity;
}
