/**
 * Promo code rules: whether a code can be used for a stay, and admin management.
 */
import { isPgError, PG_ERROR, type Db } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import type { PromoRule } from '../pricing/pricing.js';
import { promoCodeRepository } from './promo-code.repository.js';
import type { PromoCode, PromoCodeInput } from './promo-code.types.js';

function invalid(message: string): HttpError {
  return HttpError.unprocessable('PROMO_CODE_INVALID', message);
}

/**
 * Checks a code against a stay and returns the discount to apply.
 * Call it with `lock = true` inside the booking transaction so the redemption count cannot
 * change between the check and the booking insert.
 *
 * @param today  booking date in the business time zone; validity is checked against it
 * @throws HttpError 422 PROMO_CODE_INVALID with the reason
 */
async function resolveForStay(
  code: string,
  nights: number,
  today: string,
  db?: Db,
  lock = false,
): Promise<{ id: string; rule: PromoRule }> {
  const promo = await promoCodeRepository.findByCode(code, db, lock);
  if (!promo || !promo.isActive) throw invalid('Mã khuyến mãi không tồn tại hoặc đã hết hiệu lực.');
  if (promo.validFrom && today < promo.validFrom) throw invalid('Mã khuyến mãi chưa đến thời gian áp dụng.');
  if (promo.validUntil && today > promo.validUntil) throw invalid('Mã khuyến mãi đã hết hạn.');
  if (nights < promo.minNights) throw invalid(`Mã khuyến mãi áp dụng cho đặt phòng từ ${promo.minNights} đêm.`);
  if (promo.redemptions >= promo.maxRedemptions) throw invalid('Mã khuyến mãi đã được sử dụng.');

  return { id: promo.id, rule: { code: promo.code, percent: promo.discountPercent, amount: promo.discountAmount } };
}

async function list(): Promise<PromoCode[]> {
  return promoCodeRepository.list();
}

/** @throws HttpError 409 when the code already exists. */
async function create(input: PromoCodeInput): Promise<PromoCode> {
  try {
    return await promoCodeRepository.create(input);
  } catch (error) {
    if (isPgError(error, PG_ERROR.uniqueViolation)) throw HttpError.conflict('PROMO_CODE_EXISTS', 'Mã này đã tồn tại.');
    throw error;
  }
}

/** @throws HttpError 404 when the code does not exist. */
async function update(code: string, input: Omit<PromoCodeInput, 'code'>): Promise<PromoCode> {
  const updated = await promoCodeRepository.update(code, input);
  if (!updated) throw HttpError.notFound('Không tìm thấy mã khuyến mãi.');
  return updated;
}

export const promoCodeService = { resolveForStay, list, create, update };
