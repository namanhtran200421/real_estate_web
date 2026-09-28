/**
 * Holiday data access. A holiday is a calendar date whose night is charged at the holiday rate.
 */
import { query, type Db } from '../../db/pool.js';

export interface Holiday {
  date: string;
  name: string;
}

async function listBetween(from: string, to: string, db?: Db): Promise<Holiday[]> {
  return query<Holiday>('SELECT date, name FROM holidays WHERE date BETWEEN $1 AND $2 ORDER BY date', [from, to], db);
}

/** Inserts or renames. */
async function upsert(holiday: Holiday): Promise<Holiday> {
  const rows = await query<Holiday>(
    `INSERT INTO holidays (date, name) VALUES ($1, $2)
     ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name
     RETURNING date, name`,
    [holiday.date, holiday.name],
  );
  return rows[0];
}

/** @returns false when no holiday existed on that date. */
async function remove(date: string): Promise<boolean> {
  const rows = await query('DELETE FROM holidays WHERE date = $1 RETURNING date', [date]);
  return rows.length > 0;
}

export const holidayRepository = { listBetween, upsert, remove };
