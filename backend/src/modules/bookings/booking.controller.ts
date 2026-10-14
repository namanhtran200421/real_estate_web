/**
 * Guest booking handlers: create, view, look up, and pay by bank transfer.
 *
 * Viewing and paying need the booking's access token in `X-Booking-Token`
 * (returned when the booking is created or looked up).
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { email, isoDate, optionalText, parse, phone, promoCode, slug, text } from '../../lib/validation.js';
import { paymentService, policyNotAccepted } from '../payments/payment.service.js';
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
  guestIdentities: z
    .array(
      z.discriminatedUnion('documentType', [
        z.object({
          documentType: z.literal('cccd'),
          nationality: z.literal('VN'),
          fullName: text(120),
          dateOfBirth: isoDate,
          documentNumber: z.string().trim().regex(/^\d{12}$/, 'Số CCCD phải có 12 chữ số.'),
          addressOnDocument: text(500),
          issueDate: isoDate,
          expiryDate: isoDate,
          stayReason: text(250),
        }),
        z.object({
          documentType: z.literal('passport'),
          nationality: text(100).refine((value) => value.toUpperCase() !== 'VN', 'Chọn CCCD cho khách Việt Nam.'),
          gender: z.enum(['female', 'male', 'other']),
          fullName: text(120),
          dateOfBirth: isoDate,
          documentNumber: z.string().trim().min(5).max(30),
          issueDate: isoDate,
          expiryDate: isoDate,
          temporaryStayExpiry: isoDate,
          stayReason: text(250),
        }),
      ]),
    )
    .min(1)
    .max(50),
  message: optionalText(1_000),
});

const lookupBody = z.object({ reference, contact: text(254) });

const paymentOption = z.object({ option: z.enum(['deposit', 'full', 'asset_security', 'incident']) });

const reportQuery = paymentOption.extend({
  /** The guest saw the "not a transfer screenshot" warning and sends the image anyway. */
  sendAnyway: z.enum(['true', 'false']).optional(),
  /** The guest agreed to the stay policy (/policy) before sending. */
  acceptPolicy: z.enum(['true', 'false']).optional(),
});

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

/**
 * Runs before an upload's body is read: only someone who can open the booking may send one, and
 * only after accepting the policy (404 without a valid token comes first, then 422 POLICY_NOT_ACCEPTED).
 */
async function checkGuestAccess(req: Request<{ reference: string }>, _res: Response, next: NextFunction): Promise<void> {
  await paymentService.assertGuestAccess(parse(reference, req.params.reference), bookingToken(req));
  if (parse(reportQuery, req.query).acceptPolicy !== 'true') throw policyNotAccepted();
  next();
}

/**
 * POST /bookings/:reference/transfer?option=deposit|full|asset_security|incident&acceptPolicy=true
 * [&sendAnyway=true], body: the transfer screenshot. "I have transferred, here is my screenshot"; returns the updated booking.
 * 422 POLICY_NOT_ACCEPTED without `acceptPolicy=true`;
 * 422 NOT_A_TRANSFER_SCREENSHOT when the image shows no transfer and `sendAnyway` is not set.
 */
async function reportTransfer(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const { option, sendAnyway, acceptPolicy } = parse(reportQuery, req.query);
  const ref = parse(reference, req.params.reference);
  const screenshot = readTransferScreenshot(req.body);
  await paymentService.reportTransfer(ref, bookingToken(req), option, screenshot, sendAnyway === 'true', acceptPolicy === 'true');
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
