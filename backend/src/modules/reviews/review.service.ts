import { env } from '../../config/env.js';
import { isPgError, PG_ERROR } from '../../db/pool.js';
import { TtlCache } from '../../lib/cache.js';
import { todayIn } from '../../lib/dates.js';
import { HttpError } from '../../lib/http-error.js';
import { apartmentService } from '../apartments/apartment.service.js';
import { assertAccess } from '../bookings/booking-access.js';
import { bookingRepository } from '../bookings/booking.repository.js';
import { canReview } from './review.rules.js';
import { reviewRepository } from './review.repository.js';
import type { GuestReview, NewReview } from './review.types.js';

/** Public reviews per apartment slug; a new review invalidates it (see lib/cache.ts). */
const publicReviews = new TtlCache<GuestReview[]>(60_000, 20);

async function authorizedBooking(reference: string, token: string | undefined) {
  const booking = await bookingRepository.findByReference(reference);
  if (!booking) throw HttpError.notFound('Không tìm thấy đặt phòng.');
  assertAccess(booking.id, token);
  return booking;
}

/** Unknown or unpublished slugs get an empty list without a query, so they cannot fill the cache. */
async function listForApartment(slug: string): Promise<GuestReview[]> {
  if (!(await apartmentService.isPublished(slug))) return [];
  return publicReviews.get(slug, () => reviewRepository.listForApartment(slug));
}

async function getForBooking(reference: string, token: string | undefined) {
  const booking = await authorizedBooking(reference, token);
  return reviewRepository.findForBooking(booking.id);
}

async function submit(reference: string, token: string | undefined, input: NewReview) {
  const booking = await authorizedBooking(reference, token);
  if (!canReview(booking.status, booking.checkOut, todayIn(env.timezone))) {
    throw HttpError.unprocessable('REVIEW_NOT_ELIGIBLE', 'Bạn có thể đánh giá sau khi hoàn tất lưu trú.');
  }
  try {
    const review = await reviewRepository.create(booking.id, input);
    if (!review) throw HttpError.unprocessable('REVIEW_NOT_ELIGIBLE', 'Bạn có thể đánh giá sau khi hoàn tất lưu trú.');
    return review;
  } catch (error) {
    if (isPgError(error, PG_ERROR.uniqueViolation)) {
      throw HttpError.conflict('REVIEW_ALREADY_SUBMITTED', 'Đặt phòng này đã có đánh giá.');
    }
    throw error;
  }
}

export const reviewService = { listForApartment, getForBooking, submit };
