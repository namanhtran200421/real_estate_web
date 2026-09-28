/**
 * Small wrappers around node:crypto used for signatures, tokens and references.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function hmacSha256Hex(key: string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Constant-time string comparison. Use it for every signature or token check: a plain `===`
 * returns faster on the first differing character, which lets attackers guess secrets.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Unguessable token for URLs and headers (256 bits by default). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

// No 0/O or 1/I/L: references are read aloud on the phone and typed by hand.
const READABLE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Random code of readable characters, e.g. "K7Q3M". */
export function readableCode(length: number): string {
  return Array.from({ length }, () => READABLE_ALPHABET[randomInt(READABLE_ALPHABET.length)]).join('');
}
