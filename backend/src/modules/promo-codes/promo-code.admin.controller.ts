/**
 * Admin handlers for promo codes.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { isoDate, optionalText, parse, promoCode } from '../../lib/validation.js';
import { promoCodeService } from './promo-code.service.js';

const promoFields = z
  .object({
    description: optionalText(200),
    discountPercent: z.number().int().min(1).max(100).optional(),
    discountAmount: z.number().int().min(1_000).max(1_000_000_000).optional(),
    maxRedemptions: z.number().int().min(1).max(100_000).default(1),
    minNights: z.number().int().min(1).max(365).default(1),
    validFrom: isoDate.optional(),
    validUntil: isoDate.optional(),
    isActive: z.boolean().default(true),
  })
  .refine((promo) => (promo.discountPercent === undefined) !== (promo.discountAmount === undefined), {
    message: 'Chọn giảm theo phần trăm hoặc theo số tiền (chỉ một).',
    path: ['discountPercent'],
  })
  .refine((promo) => !promo.validFrom || !promo.validUntil || promo.validFrom <= promo.validUntil, {
    message: 'Ngày kết thúc phải sau ngày bắt đầu.',
    path: ['validUntil'],
  });

const createBody = z.intersection(z.object({ code: promoCode }), promoFields);

/** GET /admin/promo-codes */
async function list(_req: Request, res: Response): Promise<void> {
  res.json({ data: await promoCodeService.list() });
}

/** POST /admin/promo-codes */
async function create(req: Request, res: Response): Promise<void> {
  const input = parse(createBody, req.body);
  res.status(201).json({ data: await promoCodeService.create(input) });
}

/** PUT /admin/promo-codes/:code */
async function update(req: Request<{ code: string }>, res: Response): Promise<void> {
  const code = parse(promoCode, req.params.code);
  const input = parse(promoFields, req.body);
  res.json({ data: await promoCodeService.update(code, input) });
}

export const promoCodeAdminController = { list, create, update };
