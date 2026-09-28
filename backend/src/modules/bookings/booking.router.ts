/**
 * Guest booking routes, mounted at `/api/v1/bookings`.
 *
 * POST /                     → create a booking (holds the dates while the guest pays)
 * POST /lookup               → find a booking by reference + email/phone
 * GET  /:reference           → view a booking                                  (X-Booking-Token)
 * GET  /:reference/transfer  → bank account + VietQR for ?option=deposit|full   (X-Booking-Token)
 * POST /:reference/transfer  → "I have transferred" { option }                 (X-Booking-Token)
 */
import { Router } from 'express';
import { lookupRateLimiter } from '../../middleware/security.js';
import { bookingController } from './booking.controller.js';

export const bookingRouter = Router();

bookingRouter.post('/', bookingController.create);
bookingRouter.post('/lookup', lookupRateLimiter, bookingController.lookup);
bookingRouter.get('/:reference', bookingController.get);
bookingRouter.get('/:reference/transfer', bookingController.transferInstructions);
bookingRouter.post('/:reference/transfer', bookingController.reportTransfer);
