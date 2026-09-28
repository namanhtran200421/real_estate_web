/**
 * Public apartment routes, mounted at `/api/v1/apartments`.
 *
 * GET /             → published apartments, in display order, with availability
 * GET /:slug        → one apartment, or 404
 * GET /:slug/quote  → price for given dates and guests (409 if the dates are taken)
 * GET /:slug/reviews → verified reviews from completed stays
 */
import { Router } from 'express';
import { promoCodeRateLimiter } from '../../middleware/security.js';
import { apartmentController } from './apartment.controller.js';
import { reviewController } from '../reviews/review.controller.js';

export const apartmentRouter = Router();

apartmentRouter.get('/', apartmentController.list);
apartmentRouter.get('/:slug', apartmentController.getBySlug);
apartmentRouter.get('/:slug/quote', promoCodeRateLimiter, apartmentController.quote);
apartmentRouter.get('/:slug/reviews', reviewController.list);
