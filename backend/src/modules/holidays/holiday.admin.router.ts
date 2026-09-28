/**
 * Holiday admin routes, mounted at `/api/v1/admin/holidays`.
 *
 * GET    /?year=2026 → holidays of a year
 * PUT    /           → add or rename a holiday { date, name }
 * DELETE /:date      → remove a holiday
 */
import { Router } from 'express';
import { holidayAdminController } from './holiday.admin.controller.js';

export const holidayAdminRouter = Router();

holidayAdminRouter.get('/', holidayAdminController.list);
holidayAdminRouter.put('/', holidayAdminController.save);
holidayAdminRouter.delete('/:date', holidayAdminController.remove);
