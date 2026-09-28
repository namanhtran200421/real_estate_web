/**
 * Request validation with zod.
 *
 * Controllers describe the expected input as a schema and call `parse`; invalid input becomes
 * a 400 with one entry per offending field, so forms can highlight exactly what is wrong.
 * Shared field schemas live here so every endpoint validates dates, phones and emails the same way.
 */
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { isValidIsoDate } from './dates.js';

export function parse<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw HttpError.validation(
    result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

/** Calendar date, "yyyy-mm-dd". */
export const isoDate = z.string().refine(isValidIsoDate, 'Ngày không hợp lệ (định dạng yyyy-mm-dd).');

export const slug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Chỉ dùng chữ thường, số và dấu gạch ngang.');

/** Vietnamese phone number; spaces, dots and dashes are removed, +84 becomes 0. */
export const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s.-]/g, '').replace(/^\+84/, '0'))
  .pipe(z.string().regex(/^0\d{9,10}$/, 'Số điện thoại không hợp lệ.'));

export const email = z.string().trim().toLowerCase().pipe(z.email('Email không hợp lệ.').max(254));

/** Free text: trimmed, required, bounded. */
export function text(max: number) {
  return z.string().trim().min(1, 'Không được để trống.').max(max, `Tối đa ${max} ký tự.`);
}

/** Optional free text: empty strings become undefined. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự.`)
    .optional()
    .transform((value) => value || undefined);
}

/** For optional form fields: an empty string counts as "not provided". */
export function blankAsUndefined<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => {
    if (value === '') return undefined;
    return value;
  }, schema.optional());
}

/** Whole VND amount. */
export const vnd = z.number().int('Số tiền phải là số nguyên.').min(0).max(2_000_000_000);

export const promoCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,32}$/, 'Mã khuyến mãi không hợp lệ.');

/** `?page=&pageSize=` for admin lists. */
export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
