/**
 * Apartment admin routes, mounted at `/api/v1/admin/apartments`.
 *
 * GET    /                     → every apartment, published or not
 * POST   /                     → create an apartment
 * GET    /:slug                → one apartment
 * PUT    /:slug                → replace an apartment's content, prices and settings
 * GET    /:slug/blocked-dates  → dates the owner closed, ?from=&to=
 * POST   /:slug/blocked-dates  → close dates { dates, reason? }
 * DELETE /:slug/blocked-dates  → reopen dates { dates }
 */
import { Router } from 'express';
import { apartmentAdminController } from './apartment.admin.controller.js';

export const apartmentAdminRouter = Router();

apartmentAdminRouter.get('/', apartmentAdminController.list);
apartmentAdminRouter.post('/', apartmentAdminController.create);
apartmentAdminRouter.get('/:slug', apartmentAdminController.get);
apartmentAdminRouter.put('/:slug', apartmentAdminController.update);
apartmentAdminRouter.get('/:slug/blocked-dates', apartmentAdminController.listBlockedDates);
apartmentAdminRouter.post('/:slug/blocked-dates', apartmentAdminController.blockDates);
apartmentAdminRouter.delete('/:slug/blocked-dates', apartmentAdminController.unblockDates);
