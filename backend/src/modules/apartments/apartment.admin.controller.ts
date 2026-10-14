/**
 * Admin handlers for apartments: content, prices, publishing and blocked dates.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { imageSrc, isoDate, optionalText, parse, slug, text, vnd } from '../../lib/validation.js';
import { apartmentService } from './apartment.service.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ (HH:MM).');
const textList = (maxItems: number, maxLength: number) => z.array(text(maxLength)).max(maxItems);

const apartmentBody = z.object({
  slug,
  name: text(120),
  area: text(120),
  address: text(250),
  mapQuery: text(250),
  tagline: text(250),
  description: textList(20, 3_000),
  photos: z
    .array(z.object({ src: imageSrc, alt: text(250) }))
    .min(1, 'Cần ít nhất một ảnh.')
    .max(60),
  guests: z.number().int().min(1).max(50),
  bedrooms: z.number().int().min(0).max(50),
  beds: z.number().int().min(0).max(100),
  bathrooms: z.number().int().min(0).max(50),
  keyFacilities: textList(12, 60),
  facilities: textList(80, 120),
  checkIn: time,
  checkOut: time,
  rules: textList(40, 250),
  pricing: z.object({
    weekday: vnd.min(1_000),
    weekend: vnd.min(1_000),
    holiday: vnd.min(1_000),
    weekly: vnd,
    monthly: vnd,
    longStayDiscounts: z
      .array(z.object({ nights: z.number().int().min(2).max(365), percent: z.number().int().min(1).max(90) }))
      .max(20),
  }),
  depositPercent: z.number().int().min(0).max(100),
  nearby: z.array(z.object({ place: text(120), distance: text(60) })).max(30),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
});

const dateRangeQuery = z.object({ from: isoDate, to: isoDate });
const blockBody = z.object({ dates: z.array(isoDate).min(1).max(366), reason: optionalText(200) });
const unblockBody = z.object({ dates: z.array(isoDate).min(1).max(366) });

/** GET /admin/apartments */
async function list(_req: Request, res: Response): Promise<void> {
  res.json({ data: await apartmentService.listForAdmin() });
}

/** GET /admin/apartments/:slug */
async function get(req: Request<{ slug: string }>, res: Response): Promise<void> {
  res.json({ data: await apartmentService.getForAdmin(req.params.slug) });
}

/** POST /admin/apartments */
async function create(req: Request, res: Response): Promise<void> {
  const input = parse(apartmentBody, req.body);
  res.status(201).json({ data: await apartmentService.create(input) });
}

/** PUT /admin/apartments/:slug */
async function update(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const input = parse(apartmentBody, req.body);
  res.json({ data: await apartmentService.update(req.params.slug, input) });
}

/** GET /admin/apartments/:slug/blocked-dates?from=&to= */
async function listBlockedDates(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const { from, to } = parse(dateRangeQuery, req.query);
  res.json({ data: await apartmentService.listBlockedDates(req.params.slug, from, to) });
}

/** POST /admin/apartments/:slug/blocked-dates */
async function blockDates(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const { dates, reason } = parse(blockBody, req.body);
  await apartmentService.blockDates(req.params.slug, dates, reason);
  res.status(204).end();
}

/** DELETE /admin/apartments/:slug/blocked-dates (body: { dates }) */
async function unblockDates(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const { dates } = parse(unblockBody, req.body);
  await apartmentService.unblockDates(req.params.slug, dates);
  res.status(204).end();
}

export const apartmentAdminController = { list, get, create, update, listBlockedDates, blockDates, unblockDates };
