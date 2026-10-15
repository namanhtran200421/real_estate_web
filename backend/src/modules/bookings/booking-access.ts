/**
 * Guest access to a booking.
 *
 * Guests have no accounts. Creating a booking returns an access token; the site keeps it and
 * sends it as `X-Booking-Token` to view or pay that booking. A guest on another device gets
 * the same token back by looking the booking up with its reference plus their email or phone.
 *
 * Each token has a random nonce and an authenticated expiry. Nothing needs to be stored server-
 * side, it cannot be forged without BOOKING_TOKEN_SECRET, and it works only for its own booking.
 * Rotating the secret invalidates every token (guests then use the lookup form).
 */
import { env } from '../../config/env.js';
import { hmacSha256Hex, randomToken, safeEqual } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';

const TOKEN_VERSION = 'v1';

function signature(bookingId: string, expiresAt: string, nonce: string): string {
  const hex = hmacSha256Hex(env.booking.tokenSecret, `booking-access:${TOKEN_VERSION}:${bookingId}:${expiresAt}:${nonce}`);
  return Buffer.from(hex, 'hex').toString('base64url');
}

/** Issues a fresh, stateless token. Successful lookup is how a guest renews access. */
export function accessTokenFor(bookingId: string, now = Date.now()): string {
  const expiresAt = (Math.floor(now / 1_000) + env.booking.accessTokenDays * 24 * 60 * 60).toString(36);
  const nonce = randomToken(16);
  return `${TOKEN_VERSION}.${expiresAt}.${nonce}.${signature(bookingId, expiresAt, nonce)}`;
}

/** @throws HttpError 404 (not 403, so tokens cannot be used to probe which references exist). */
export function assertAccess(bookingId: string, token: string | undefined, now = Date.now()): void {
  const parts = token?.split('.');
  if (!parts || parts.length !== 4 || parts[0] !== TOKEN_VERSION) return deny();

  const [, expiresAt, nonce, suppliedSignature] = parts;
  if (!/^[0-9a-z]{1,10}$/.test(expiresAt) || !/^[A-Za-z0-9_-]{22}$/.test(nonce)) return deny();
  if (!/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)) return deny();

  const expirySeconds = Number.parseInt(expiresAt, 36);
  if (!Number.isSafeInteger(expirySeconds) || expirySeconds <= Math.floor(now / 1_000)) return deny();
  if (!safeEqual(suppliedSignature, signature(bookingId, expiresAt, nonce))) return deny();
}

function deny(): never {
  throw HttpError.notFound('Không tìm thấy đặt phòng.');
}
