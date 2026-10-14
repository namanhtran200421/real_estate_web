/**
 * The check-out inspection of a booking: one saved checklist result per booking.
 */
import { queryOne, type Db } from '../../db/pool.js';
import type { InspectionResult } from './inspection.js';

export interface SavedInspection {
  results: InspectionResult[];
  /** Email of the admin who saved it. */
  inspectedBy: string | null;
  inspectedAt: string;
}

interface InspectionRow {
  results: InspectionResult[];
  inspected_by: string | null;
  inspected_at: Date;
}

function toInspection(row: InspectionRow): SavedInspection {
  return { results: row.results, inspectedBy: row.inspected_by, inspectedAt: row.inspected_at.toISOString() };
}

async function get(bookingId: string, db?: Db): Promise<SavedInspection | null> {
  const row = await queryOne<InspectionRow>(
    `SELECT i.results, u.email AS inspected_by, i.inspected_at
     FROM booking_inspections i LEFT JOIN admin_users u ON u.id = i.inspected_by
     WHERE i.booking_id = $1`,
    [bookingId],
    db,
  );
  return row ? toInspection(row) : null;
}

/** Saves (or replaces) the booking's inspection. */
async function upsert(bookingId: string, results: InspectionResult[], adminId: string, db: Db): Promise<void> {
  await queryOne(
    `INSERT INTO booking_inspections (booking_id, results, inspected_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (booking_id) DO UPDATE
       SET results = EXCLUDED.results, inspected_by = EXCLUDED.inspected_by, inspected_at = now()`,
    [bookingId, JSON.stringify(results), adminId],
    db,
  );
}

export const inspectionRepository = { get, upsert };
