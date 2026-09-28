import { query, queryOne } from '../../db/pool.js';
import type { GuestReview, NewReview } from './review.types.js';

interface ReviewRow {
  id: string;
  rating: number;
  comment: string;
  created_at: Date;
  stayed_at: string;
}

function toReview(row: ReviewRow): GuestReview {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at.toISOString(),
    stayedAt: row.stayed_at,
  };
}

const SELECT_REVIEW = `
  SELECT r.id, r.rating, r.comment, r.created_at,
         to_char(b.check_out, 'YYYY-MM-01') AS stayed_at
  FROM guest_reviews r
  JOIN bookings b ON b.id = r.booking_id
`;

async function listForApartment(slug: string): Promise<GuestReview[]> {
  const rows = await query<ReviewRow>(
    `${SELECT_REVIEW}
     JOIN apartments a ON a.id = r.apartment_id
     WHERE a.slug = $1 AND a.is_active = true
     ORDER BY r.created_at DESC LIMIT 100`,
    [slug],
  );
  return rows.map(toReview);
}

async function findForBooking(bookingId: string): Promise<GuestReview | null> {
  const row = await queryOne<ReviewRow>(`${SELECT_REVIEW} WHERE r.booking_id = $1`, [bookingId]);
  return row ? toReview(row) : null;
}

async function create(bookingId: string, review: NewReview): Promise<GuestReview | null> {
  const row = await queryOne<ReviewRow>(
    `WITH inserted AS (
       INSERT INTO guest_reviews (booking_id, apartment_id, rating, comment)
       SELECT b.id, b.apartment_id, $2, $3 FROM bookings b
       WHERE b.id = $1 AND b.status = 'completed' AND b.check_out <= CURRENT_DATE
       RETURNING id, booking_id, rating, comment, created_at
     )
     SELECT i.id, i.rating, i.comment, i.created_at,
            to_char(b.check_out, 'YYYY-MM-01') AS stayed_at
     FROM inserted i JOIN bookings b ON b.id = i.booking_id`,
    [bookingId, review.rating, review.comment],
  );
  return row ? toReview(row) : null;
}

export const reviewRepository = { listForApartment, findForBooking, create };
