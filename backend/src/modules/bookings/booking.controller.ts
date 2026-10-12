/**
 * Guest booking handlers: create, view, look up, and pay by bank transfer.
 *
 * Viewing and paying need the booking's access token in `X-Booking-Token`
 * (returned when the booking is created or looked up).
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { email, isoDate, optionalText, parse, phone, promoCode, slug, text } from '../../lib/validation.js';
import { paymentService } from '../payments/payment.service.js';
import { readTransferScreenshot, sendScreenshot } from '../payments/transfer-screenshot.js';
import { bookingService } from './booking.service.js';

const reference = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^RE-\d{4}-[A-Z0-9]{4,8}$/, 'Mã đặt phòng không hợp lệ.');

const createBody = z.object({
  apartmentSlug: slug,
  checkIn: isoDate,
  checkOut: isoDate,
  guests: z.number().int().min(1).max(50),
  promoCode: promoCode.optional(),
  customer: z.object({ name: text(120), phone, email }),
  message: optionalText(1_000),
});

const lookupBody = z.object({ reference, contact: text(254) });

const paymentOption = z.object({ option: z.enum(['deposit', 'full']) });

function bookingToken(req: Request): string | undefined {
  return req.get('X-Booking-Token') ?? undefined;
}

/** POST /bookings → 201 { data: { booking, accessToken } } */
async function create(req: Request, res: Response): Promise<void> {
  const input = parse(createBody, req.body);
  const result = await bookingService.createBooking(input, req.ip);
  res.status(201).json({ data: result });
}

/** GET /bookings/:reference (X-Booking-Token) */
async function get(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const booking = await bookingService.getForGuest(parse(reference, req.params.reference), bookingToken(req));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: booking });
}

/** POST /bookings/lookup { reference, contact } → { data: { booking, accessToken } } */
async function lookup(req: Request, res: Response): Promise<void> {
  const input = parse(lookupBody, req.body);
  const result = await bookingService.lookup(input.reference, input.contact);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: result });
}

/** GET /bookings/:reference/transfer?option=deposit|full → account, amount, note and VietQR code */
async function transferInstructions(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const { option } = parse(paymentOption, req.query);
  const instructions = await paymentService.transferInstructions(parse(reference, req.params.reference), bookingToken(req), option);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: instructions });
}

/** Runs before an upload's body is read: only someone who can open the booking may send one. */
async function checkGuestAccess(req: Request<{ reference: string }>, _res: Response, next: NextFunction): Promise<void> {
  await paymentService.assertGuestAccess(parse(reference, req.params.reference), bookingToken(req));
  next();
}

/**
 * POST /bookings/:reference/transfer?option=deposit|full, body: the transfer screenshot.
 * "I have transferred, here is my screenshot"; returns the updated booking.
 */
async function reportTransfer(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const { option } = parse(paymentOption, req.query);
  const ref = parse(reference, req.params.reference);
  const screenshot = readTransferScreenshot(req.body);
  await paymentService.reportTransfer(ref, bookingToken(req), option, screenshot);
  res.json({ data: await bookingService.getForGuest(ref, bookingToken(req)) });
}

/** GET /bookings/:reference/transfer/screenshot → the image of the transfer the owner is checking */
async function transferScreenshot(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const screenshot = await paymentService.reportedTransferScreenshot(parse(reference, req.params.reference), bookingToken(req));
  sendScreenshot(res, screenshot);
}

export const bookingController = {
  create,
  get,
  lookup,
  transferInstructions,
  checkGuestAccess,
  reportTransfer,
  transferScreenshot,
};
