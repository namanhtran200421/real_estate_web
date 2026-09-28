/**
 * Holiday rules: which dates are holidays, for pricing and for the owner's admin screen.
 */
import type { Db } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { holidayRepository, type Holiday } from './holiday.repository.js';

/** Holiday dates between two dates (inclusive), as a set for fast lookups while pricing. */
async function holidayDatesBetween(from: string, to: string, db?: Db): Promise<Set<string>> {
  const holidays = await holidayRepository.listBetween(from, to, db);
  return new Set(holidays.map((holiday) => holiday.date));
}

async function listForYear(year: number): Promise<Holiday[]> {
  return holidayRepository.listBetween(`${year}-01-01`, `${year}-12-31`);
}

async function save(holiday: Holiday): Promise<Holiday> {
  return holidayRepository.upsert(holiday);
}

/** @throws HttpError 404 when that date is not a holiday. */
async function remove(date: string): Promise<void> {
  const removed = await holidayRepository.remove(date);
  if (!removed) throw HttpError.notFound('Ngày này không phải ngày lễ.');
}

export const holidayService = { holidayDatesBetween, listForYear, save, remove };
