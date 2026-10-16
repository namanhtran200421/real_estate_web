/**
 * What a guest gives for temporary-stay registration, and the checks that need the stay's dates.
 *
 * A Vietnamese guest under 14 on check-in day (owner's decision, 15/10/2026) gives only the full
 * name, the date of birth and the 12-digit personal ID number (mã định danh cá nhân); the issue
 * date, expiry date and address on the document are optional for them. Everyone else gives all
 * of them. The age depends on the check-in date, so the request checks it (`guestIdentityIssues`).
 * Pure: no configuration, no database.
 */
import { z } from 'zod';
import { blankAsUndefined, isoDate, optionalText, text } from '../../lib/validation.js';
import type { GuestIdentity } from './booking.types.js';

/** Vietnamese guests younger than this on check-in day need no issue date, expiry date or address. */
export const CHILD_AGE = 14;

const vietnameseIdentity = z.object({
  documentType: z.literal('cccd'),
  nationality: z.literal('VN'),
  fullName: text(120),
  dateOfBirth: isoDate,
  documentNumber: z.string().trim().regex(/^\d{12}$/, 'Số CCCD / mã định danh cá nhân phải có 12 chữ số.'),
  // Required unless the guest is a child: see guestIdentityIssues.
  addressOnDocument: optionalText(500),
  issueDate: blankAsUndefined(isoDate),
  expiryDate: blankAsUndefined(isoDate),
  /** A CCCD with no expiry date ("Không thời hạn"), as issued to people aged 60 and over. */
  noExpiry: z.literal(true).optional(),
  stayReason: text(250),
});

const foreignIdentity = z.object({
  documentType: z.literal('passport'),
  nationality: text(100).refine((value) => value.toUpperCase() !== 'VN', 'Chọn CCCD cho khách Việt Nam.'),
  gender: z.enum(['female', 'male', 'other']),
  fullName: text(120),
  dateOfBirth: isoDate,
  documentNumber: z.string().trim().min(5).max(30),
  issueDate: isoDate,
  expiryDate: isoDate,
  temporaryStayExpiry: isoDate,
  stayReason: text(250),
});

export const guestIdentitySchema = z.discriminatedUnion('documentType', [vietnameseIdentity, foreignIdentity]);

/** Whole years from `dateOfBirth` to `date` (both yyyy-mm-dd); born 29/02, one turns a year older on 01/03. */
export function ageOn(dateOfBirth: string, date: string): number {
  const years = Number(date.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  return date.slice(5) < dateOfBirth.slice(5) ? years - 1 : years;
}

/** A Vietnamese child, who gives only name, date of birth and personal ID number. */
export function isChildOn(dateOfBirth: string, checkIn: string): boolean {
  return ageOn(dateOfBirth, checkIn) < CHILD_AGE;
}

export interface IdentityIssue {
  /** From the request body, e.g. ['guestIdentities', 0, 'issueDate']. */
  path: (string | number)[];
  message: string;
}

/**
 * The problems that depend on the stay or on several fields: missing document details for anyone
 * but a Vietnamese child, a date of birth that is not in the past, an expiry date not after the
 * issue date, a document already expired on check-in day, and an expiry date given for a CCCD
 * marked as having none.
 * @param checkIn the stay's check-in date; @param today the business date (yyyy-mm-dd)
 */
export function guestIdentityIssues(identities: GuestIdentity[], checkIn: string, today: string): IdentityIssue[] {
  const issues: IdentityIssue[] = [];
  identities.forEach((identity, index) => {
    const at = (field: string, message: string) => issues.push({ path: ['guestIdentities', index, field], message });

    if (identity.dateOfBirth >= today) at('dateOfBirth', 'Ngày sinh phải trước hôm nay.');
    if (identity.documentType === 'cccd' && !isChildOn(identity.dateOfBirth, checkIn)) {
      const required = 'Không được để trống (chỉ không bắt buộc với trẻ dưới 14 tuổi).';
      if (!identity.issueDate) at('issueDate', required);
      if (!identity.expiryDate && !identity.noExpiry) at('expiryDate', required);
      if (!identity.addressOnDocument) at('addressOnDocument', required);
    }
    if (identity.documentType === 'cccd' && identity.noExpiry && identity.expiryDate) {
      at('expiryDate', 'Bỏ ngày hết hạn khi chọn "Không thời hạn".');
    } else if (identity.issueDate && identity.expiryDate && identity.expiryDate <= identity.issueDate) {
      at('expiryDate', 'Ngày hết hạn phải sau ngày cấp.');
    } else if (identity.expiryDate && identity.expiryDate < checkIn) {
      at('expiryDate', 'Giấy tờ đã hết hạn trước ngày nhận phòng.');
    }
  });
  return issues;
}
