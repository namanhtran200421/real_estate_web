/**
 * Public apartment HTTP handlers.
 *
 * The thin layer between Express and the services: read and validate request input, call the
 * service, shape the response as `{ data }`. Errors are thrown, never answered here; Express 5
 * forwards rejected promises to the central error handler.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { isoDate, parse, promoCode, slug as slugSchema } from '../../lib/validation.js';
import { bookingService } from '../bookings/booking.service.js';
import { apartmentService } from './apartment.service.js';

const quoteQuery = z.object({
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.coerce.number().int().min(1).max(50),
  promoCode: promoCode.optional(),
});

/**
 * Public catalogue responses may be reused by a CDN for a few seconds (browsers revalidate with
 * the ETag every time). Matches the in-process cache in apartment.service.ts.
 */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=30, stale-while-revalidate=60';

/** Malformed slugs are answered with 404 without touching the database. */
function parseSlug(value: string): string {
  const result = slugSchema.safeParse(value);
  if (!result.success) throw HttpError.notFound('Không tìm thấy căn hộ.');
  return result.data;
}

/** GET /apartments */
async function list(_req: Request, res: Response): Promise<void> {
  const apartments = await apartmentService.listApartments();
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.json({ data: apartments });
}

/** GET /apartments/:slug */
async function getBySlug(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const apartment = await apartmentService.getApartmentBySlug(parseSlug(req.params.slug));
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.json({ data: apartment });
}

/** GET /apartments/:slug/quote?checkIn=&checkOut=&guests=&promoCode= */
async function quote(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const input = parse(quoteQuery, req.query);
  const result = await bookingService.quote({ apartmentSlug: parseSlug(req.params.slug), ...input });
  res.json({ data: result });
}

export const apartmentController = { list, getBySlug, quote };
