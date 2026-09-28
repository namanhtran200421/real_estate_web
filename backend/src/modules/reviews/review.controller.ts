import type { Request, Response } from 'express';
import { z } from 'zod';
import { parse, slug } from '../../lib/validation.js';
import { PUBLIC_CACHE_CONTROL } from '../apartments/apartment.controller.js';
import { reviewService } from './review.service.js';

const reference = z.string().trim().toUpperCase().regex(/^RE-\d{4}-[A-Z0-9]{4,8}$/);
const reviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(20).max(2000),
});

async function list(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const reviews = await reviewService.listForApartment(parse(slug, req.params.slug));
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.json({ data: reviews });
}

async function getForBooking(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const review = await reviewService.getForBooking(parse(reference, req.params.reference), req.get('X-Booking-Token'));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: review });
}

async function submit(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const review = await reviewService.submit(
    parse(reference, req.params.reference),
    req.get('X-Booking-Token'),
    parse(reviewBody, req.body),
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ data: review });
}

export const reviewController = { list, getForBooking, submit };
