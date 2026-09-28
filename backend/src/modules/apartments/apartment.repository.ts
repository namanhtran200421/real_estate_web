/**
 * Apartment data access.
 *
 * The only layer that knows about the apartment tables and SQL. It converts database rows
 * (snake_case, split price columns) into domain objects, so services never see a row.
 */
import { query, queryOne, type Db } from '../../db/pool.js';
import type {
  AdminApartment,
  ApartmentInput,
  BlockedDate,
  LongStayDiscount,
  NearbyPlace,
  Photo,
} from './apartment.types.js';

interface ApartmentRow {
  id: string;
  slug: string;
  name: string;
  area: string;
  address: string;
  map_query: string;
  tagline: string;
  description: string[];
  photos: Photo[];
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  key_facilities: string[];
  facilities: string[];
  rules: string[];
  nearby: NearbyPlace[];
  check_in: string;
  check_out: string;
  price_weekday: number;
  price_weekend: number;
  price_holiday: number;
  price_weekly: number;
  price_monthly: number;
  long_stay_discounts: LongStayDiscount[];
  deposit_percent: number;
  is_active: boolean;
  sort_order: number;
}

const APARTMENT_COLUMNS = `
  id, slug, name, area, address, map_query, tagline, description, photos,
  guests, bedrooms, beds, bathrooms, key_facilities, facilities, rules, nearby,
  to_char(check_in_time, 'HH24:MI')  AS check_in,
  to_char(check_out_time, 'HH24:MI') AS check_out,
  price_weekday, price_weekend, price_holiday, price_weekly, price_monthly,
  long_stay_discounts, deposit_percent, is_active, sort_order
`;

function toApartment(row: ApartmentRow): AdminApartment {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    area: row.area,
    address: row.address,
    mapQuery: row.map_query,
    tagline: row.tagline,
    description: row.description,
    photos: row.photos,
    guests: row.guests,
    bedrooms: row.bedrooms,
    beds: row.beds,
    bathrooms: row.bathrooms,
    keyFacilities: row.key_facilities,
    facilities: row.facilities,
    checkIn: row.check_in,
    checkOut: row.check_out,
    rules: row.rules,
    pricing: {
      weekday: row.price_weekday,
      weekend: row.price_weekend,
      holiday: row.price_holiday,
      weekly: row.price_weekly,
      monthly: row.price_monthly,
      longStayDiscounts: row.long_stay_discounts,
    },
    depositPercent: row.deposit_percent,
    nearby: row.nearby,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

/** Column values for INSERT/UPDATE, in the order used by both statements ($1 … $27). */
function toParams(input: ApartmentInput): unknown[] {
  return [
    input.slug,
    input.name,
    input.area,
    input.address,
    input.mapQuery,
    input.tagline,
    input.description,
    JSON.stringify(input.photos),
    input.guests,
    input.bedrooms,
    input.beds,
    input.bathrooms,
    input.keyFacilities,
    input.facilities,
    input.rules,
    JSON.stringify(input.nearby),
    input.checkIn,
    input.checkOut,
    input.pricing.weekday,
    input.pricing.weekend,
    input.pricing.holiday,
    input.pricing.weekly,
    input.pricing.monthly,
    JSON.stringify(input.pricing.longStayDiscounts),
    input.depositPercent,
    input.isActive,
    input.sortOrder,
  ];
}

/** Apartments in display order; the first is the site's default apartment. */
async function findAll(options: { activeOnly: boolean }): Promise<AdminApartment[]> {
  let sql = `SELECT ${APARTMENT_COLUMNS} FROM apartments`;
  if (options.activeOnly) sql += ' WHERE is_active';
  const rows = await query<ApartmentRow>(`${sql} ORDER BY sort_order, name`);
  return rows.map(toApartment);
}

async function findBySlug(slug: string, db?: Db): Promise<AdminApartment | undefined> {
  const row = await queryOne<ApartmentRow>(`SELECT ${APARTMENT_COLUMNS} FROM apartments WHERE slug = $1`, [slug], db);
  if (!row) return undefined;
  return toApartment(row);
}

async function findById(id: string, db?: Db): Promise<AdminApartment | undefined> {
  const row = await queryOne<ApartmentRow>(`SELECT ${APARTMENT_COLUMNS} FROM apartments WHERE id = $1`, [id], db);
  if (!row) return undefined;
  return toApartment(row);
}

async function create(input: ApartmentInput): Promise<AdminApartment> {
  const row = await queryOne<{ slug: string }>(
    `INSERT INTO apartments (
       slug, name, area, address, map_query, tagline, description, photos,
       guests, bedrooms, beds, bathrooms, key_facilities, facilities, rules, nearby,
       check_in_time, check_out_time,
       price_weekday, price_weekend, price_holiday, price_weekly, price_monthly, long_stay_discounts,
       deposit_percent, is_active, sort_order
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23, $24, $25, $26, $27)
     RETURNING slug`,
    toParams(input),
  );
  return (await findBySlug(row!.slug))!;
}

/** Updates the apartment currently at `currentSlug` (the slug itself may change). */
async function update(currentSlug: string, input: ApartmentInput): Promise<AdminApartment | undefined> {
  const row = await queryOne<{ slug: string }>(
    `UPDATE apartments SET
       slug = $1, name = $2, area = $3, address = $4, map_query = $5, tagline = $6, description = $7,
       photos = $8, guests = $9, bedrooms = $10, beds = $11, bathrooms = $12, key_facilities = $13,
       facilities = $14, rules = $15, nearby = $16, check_in_time = $17, check_out_time = $18,
       price_weekday = $19, price_weekend = $20, price_holiday = $21, price_weekly = $22,
       price_monthly = $23, long_stay_discounts = $24, deposit_percent = $25, is_active = $26,
       sort_order = $27
     WHERE slug = $28
     RETURNING slug`,
    [...toParams(input), currentSlug],
  );
  if (!row) return undefined;
  return findBySlug(row.slug);
}

// A pending booking only blocks its dates while its payment hold is running.
const ACTIVE_BOOKING = `
  b.status IN ('pending', 'confirmed')
  AND (b.status = 'confirmed' OR b.hold_expires_at IS NULL OR b.hold_expires_at > now())
`;

/**
 * Dates in [from, to) that cannot be booked, per apartment: nights covered by an active
 * booking plus dates the owner blocked.
 */
async function findUnavailableDates(
  apartmentIds: string[],
  from: string,
  to: string,
  db?: Db,
): Promise<Map<string, string[]>> {
  const rows = await query<{ apartment_id: string; date: string }>(
    `
    WITH window_range AS (
      SELECT daterange($2::date, $3::date, '[)') AS range
    ),
    unavailable AS (
      SELECT bd.apartment_id, bd.date
      FROM apartment_blocked_dates bd, window_range w
      WHERE bd.apartment_id = ANY($1::uuid[])
        AND bd.date <@ w.range

      UNION

      SELECT b.apartment_id, night::date
      FROM bookings b
      CROSS JOIN window_range w
      CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') AS night
      WHERE b.apartment_id = ANY($1::uuid[])
        AND ${ACTIVE_BOOKING}
        AND daterange(b.check_in, b.check_out, '[)') && w.range
        AND night::date <@ w.range
    )
    SELECT apartment_id, date
    FROM unavailable
    ORDER BY apartment_id, date
    `,
    [apartmentIds, from, to],
    db,
  );

  const byApartment = new Map<string, string[]>();
  for (const row of rows) {
    const dates = byApartment.get(row.apartment_id) ?? [];
    dates.push(row.date);
    byApartment.set(row.apartment_id, dates);
  }
  return byApartment;
}

async function listBlockedDates(apartmentId: string, from: string, to: string): Promise<BlockedDate[]> {
  return query<BlockedDate>(
    `SELECT date, reason FROM apartment_blocked_dates
     WHERE apartment_id = $1 AND date BETWEEN $2 AND $3
     ORDER BY date`,
    [apartmentId, from, to],
  );
}

async function addBlockedDates(apartmentId: string, dates: string[], reason: string | undefined): Promise<void> {
  await query(
    `INSERT INTO apartment_blocked_dates (apartment_id, date, reason)
     SELECT $1, unnest($2::date[]), $3
     ON CONFLICT (apartment_id, date) DO UPDATE SET reason = EXCLUDED.reason`,
    [apartmentId, dates, reason ?? null],
  );
}

async function removeBlockedDates(apartmentId: string, dates: string[]): Promise<void> {
  await query('DELETE FROM apartment_blocked_dates WHERE apartment_id = $1 AND date = ANY($2::date[])', [
    apartmentId,
    dates,
  ]);
}

export const apartmentRepository = {
  findAll,
  findBySlug,
  findById,
  create,
  update,
  findUnavailableDates,
  listBlockedDates,
  addBlockedDates,
  removeBlockedDates,
};
