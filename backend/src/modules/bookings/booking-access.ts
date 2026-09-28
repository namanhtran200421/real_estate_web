/**
 * Guest access to a booking.
 *
 * Guests have no accounts. Creating a booking returns an access token; the site keeps it and
 * sends it as `X-Booking-Token` to view or pay that booking. A guest on another device gets
 * the same token back by looking the booking up with its reference plus their email or phone.
 *
 * The token is an HMAC of the booking id with BOOKING_TOKEN_SECRET: nothing to store, it
 * cannot be forged without the secret, and it works only for its own booking. Rotating the
 * secret invalidates every token (guests then use the lookup form).
 */
import { env } from '../../config/env.js';
import { hmacSha256Hex, safeEqual } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';

export function accessTokenFor(bookingId: string): string {
  return Buffer.from(hmacSha256Hex(env.booking.tokenSecret, `booking-access:${bookingId}`), 'hex').toString('base64url');
}

/** @throws HttpError 404 (not 403, so tokens cannot be used to probe which references exist). */
export function assertAccess(bookingId: string, token: string | undefined): void {
  if (!token || !safeEqual(token, accessTokenFor(bookingId))) {
    throw HttpError.notFound('Không tìm thấy đặt phòng.');
  }
}
