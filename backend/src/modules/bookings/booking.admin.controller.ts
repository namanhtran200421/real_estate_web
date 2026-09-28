/**
 * Admin handlers for bookings and their payments.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { isoDate, optionalText, pagination, parse, slug, text, vnd } from '../../lib/validation.js';
import { paymentService } from '../payments/payment.service.js';
import { bookingService } from './booking.service.js';

const listQuery = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'expired']).optional(),
  apartment: slug.optional(),
  search: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['check_in', 'created_at']).default('created_at'),
  ...pagination,
});

const cancelBody = z.object({ reason: text(500) });
const manualPaymentBody = z.object({
  method: z.enum(['cash', 'bank_transfer']),
  amount: vnd.min(1),
  note: optionalText(500),
});
const refundBody = z.object({ amount: vnd.min(1), reason: text(500) });
const verifyBody = z.object({ amount: vnd.min(1).optional() });
const rejectBody = z.object({ reason: text(500) });

/** GET /admin/summary */
async function summary(_req: Request, res: Response): Promise<void> {
  res.json({ data: await bookingService.summary() });
}

/** GET /admin/bookings?status=&apartment=&search=&from=&to=&sort=&page=&pageSize= */
async function list(req: Request, res: Response): Promise<void> {
  const query = parse(listQuery, req.query);
  const page = await bookingService.adminList({
    status: query.status,
    apartmentSlug: query.apartment,
    search: query.search || undefined,
    from: query.from,
    to: query.to,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  });
  res.json({ data: page });
}

/** GET /admin/bookings/:reference */
async function get(req: Request<{ reference: string }>, res: Response): Promise<void> {
  res.json({ data: await bookingService.adminDetail(req.params.reference) });
}

/** POST /admin/bookings/:reference/confirm */
async function confirm(req: Request<{ reference: string }>, res: Response): Promise<void> {
  res.json({ data: await bookingService.confirm(req.params.reference, res.locals.admin) });
}

/** POST /admin/bookings/:reference/cancel { reason } */
async function cancel(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const { reason } = parse(cancelBody, req.body);
  res.json({ data: await bookingService.cancel(req.params.reference, reason, res.locals.admin) });
}

/** POST /admin/bookings/:reference/complete */
async function complete(req: Request<{ reference: string }>, res: Response): Promise<void> {
  res.json({ data: await bookingService.complete(req.params.reference, res.locals.admin) });
}

/** POST /admin/bookings/:reference/payments { method, amount, note? } */
async function recordPayment(req: Request<{ reference: string }>, res: Response): Promise<void> {
  const payment = parse(manualPaymentBody, req.body);
  await paymentService.recordManualPayment(req.params.reference, payment, res.locals.admin);
  res.status(201).json({ data: await bookingService.adminDetail(req.params.reference) });
}

/** POST /admin/payments/:paymentId/verify { amount? } — the transfer is in the bank account; confirms the booking */
async function verifyTransfer(req: Request<{ paymentId: string }>, res: Response): Promise<void> {
  const { amount } = parse(verifyBody, req.body);
  await paymentService.verifyTransfer(parse(z.uuid(), req.params.paymentId), amount, res.locals.admin);
  res.status(204).end();
}

/** POST /admin/payments/:paymentId/reject { reason } — the transfer never arrived */
async function rejectTransfer(req: Request<{ paymentId: string }>, res: Response): Promise<void> {
  const { reason } = parse(rejectBody, req.body);
  await paymentService.rejectTransfer(parse(z.uuid(), req.params.paymentId), reason, res.locals.admin);
  res.status(204).end();
}

/** POST /admin/payments/:paymentId/refunds { amount, reason } — records money the owner gave back */
async function refund(req: Request<{ paymentId: string }>, res: Response): Promise<void> {
  const paymentId = parse(z.uuid(), req.params.paymentId);
  const input = parse(refundBody, req.body);
  await paymentService.recordRefund(paymentId, input, res.locals.admin);
  res.status(204).end();
}

export const bookingAdminController = {
  summary,
  list,
  get,
  confirm,
  cancel,
  complete,
  recordPayment,
  verifyTransfer,
  rejectTransfer,
  refund,
};
