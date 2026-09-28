/**
 * Promo code admin routes, mounted at `/api/v1/admin/promo-codes`.
 *
 * GET  /       → all codes with their redemption counts
 * POST /       → create a code
 * PUT  /:code  → edit a code (the code text itself cannot change)
 */
import { Router } from 'express';
import { promoCodeAdminController } from './promo-code.admin.controller.js';

export const promoCodeAdminRouter = Router();

promoCodeAdminRouter.get('/', promoCodeAdminController.list);
promoCodeAdminRouter.post('/', promoCodeAdminController.create);
promoCodeAdminRouter.put('/:code', promoCodeAdminController.update);
