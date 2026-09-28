/**
 * Admin handlers for holidays.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { isoDate, parse, text } from '../../lib/validation.js';
import { holidayService } from './holiday.service.js';

const listQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
const holidayBody = z.object({ date: isoDate, name: text(100) });

/** GET /admin/holidays?year=2026 */
async function list(req: Request, res: Response): Promise<void> {
  const { year } = parse(listQuery, req.query);
  res.json({ data: await holidayService.listForYear(year) });
}

/** PUT /admin/holidays — add a holiday or rename an existing one */
async function save(req: Request, res: Response): Promise<void> {
  const holiday = parse(holidayBody, req.body);
  res.json({ data: await holidayService.save(holiday) });
}

/** DELETE /admin/holidays/:date */
async function remove(req: Request<{ date: string }>, res: Response): Promise<void> {
  const date = parse(isoDate, req.params.date);
  await holidayService.remove(date);
  res.status(204).end();
}

export const holidayAdminController = { list, save, remove };
