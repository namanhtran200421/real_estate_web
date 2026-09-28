import type { BookingStatus } from '../bookings/booking.types.js';

/** A guest can review only after a confirmed stay has finished. */
export function canReview(status: BookingStatus, checkOut: string, today: string): boolean {
  return status === 'completed' && checkOut <= today;
}
