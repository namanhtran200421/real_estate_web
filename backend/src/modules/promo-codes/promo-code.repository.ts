/**
 * Promo code data access.
 */
import { query, queryOne, type Db } from '../../db/pool.js';
import type { PromoCode, PromoCodeInput } from './promo-code.types.js';

interface PromoCodeRow {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number | null;
  discount_amount: number | null;
  max_redemptions: number;
  min_nights: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  redemptions: number;
  created_at: Date;
}

// Redemptions count bookings that still hold the code: an expired or cancelled booking gives it back.
const SELECT_PROMO = `
  SELECT p.*,
         (SELECT count(*)::int FROM bookings b
          WHERE b.promo_code_id = p.id AND b.status IN ('pending', 'confirmed', 'completed')) AS redemptions
  FROM promo_codes p
`;

function toPromoCode(row: PromoCodeRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountPercent: row.discount_percent,
    discountAmount: row.discount_amount,
    maxRedemptions: row.max_redemptions,
    minNights: row.min_nights,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    isActive: row.is_active,
    redemptions: row.redemptions,
    createdAt: row.created_at.toISOString(),
  };
}

async function list(): Promise<PromoCode[]> {
  const rows = await query<PromoCodeRow>(`${SELECT_PROMO} ORDER BY p.created_at DESC`);
  return rows.map(toPromoCode);
}

/**
 * @param lock  lock the row until the transaction ends, so two bookings cannot both take the
 *              last redemption of a code at the same moment
 */
async function findByCode(code: string, db?: Db, lock = false): Promise<PromoCode | undefined> {
  let sql = 'SELECT id FROM promo_codes WHERE code = $1';
  if (lock) sql += ' FOR UPDATE';
  const locked = await queryOne<{ id: string }>(sql, [code], db);
  if (!locked) return undefined;

  const row = await queryOne<PromoCodeRow>(`${SELECT_PROMO} WHERE p.id = $1`, [locked.id], db);
  if (!row) return undefined;
  return toPromoCode(row);
}

async function create(input: PromoCodeInput): Promise<PromoCode> {
  const inserted = await queryOne<{ code: string }>(
    `INSERT INTO promo_codes
       (code, description, discount_percent, discount_amount, max_redemptions, min_nights, valid_from, valid_until, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING code`,
    [
      input.code,
      input.description ?? null,
      input.discountPercent ?? null,
      input.discountAmount ?? null,
      input.maxRedemptions,
      input.minNights,
      input.validFrom ?? null,
      input.validUntil ?? null,
      input.isActive,
    ],
  );
  const created = await findByCode(inserted!.code);
  return created!;
}

async function update(code: string, input: Omit<PromoCodeInput, 'code'>): Promise<PromoCode | undefined> {
  const updated = await queryOne<{ code: string }>(
    `UPDATE promo_codes
     SET description = $2, discount_percent = $3, discount_amount = $4, max_redemptions = $5,
         min_nights = $6, valid_from = $7, valid_until = $8, is_active = $9
     WHERE code = $1
     RETURNING code`,
    [
      code,
      input.description ?? null,
      input.discountPercent ?? null,
      input.discountAmount ?? null,
      input.maxRedemptions,
      input.minNights,
      input.validFrom ?? null,
      input.validUntil ?? null,
      input.isActive,
    ],
  );
  if (!updated) return undefined;
  return findByCode(updated.code);
}

export const promoCodeRepository = { list, findByCode, create, update };
