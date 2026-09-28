/**
 * Apartment business logic.
 *
 * Framework-agnostic: no Express types and no SQL. It combines stored apartments with their
 * availability, hides unpublished apartments from the public, and validates owner edits.
 */
import { env } from '../../config/env.js';
import { isPgError, PG_ERROR } from '../../db/pool.js';
import { addDays, todayIn } from '../../lib/dates.js';
import { HttpError } from '../../lib/http-error.js';
import { apartmentRepository } from './apartment.repository.js';
import type { AdminApartment, Apartment, ApartmentInput, BlockedDate } from './apartment.types.js';

/** How far ahead the availability calendar reaches. */
export const AVAILABILITY_HORIZON_DAYS = 365;

/** Drops admin-only fields. */
function toPublic(apartment: AdminApartment, unavailableDates: string[]): Apartment {
  const { isActive: _isActive, sortOrder: _sortOrder, ...publicFields } = apartment;
  return { ...publicFields, unavailableDates };
}

async function withAvailability(apartments: AdminApartment[]): Promise<Apartment[]> {
  if (apartments.length === 0) return [];

  const today = todayIn(env.timezone);
  const unavailable = await apartmentRepository.findUnavailableDates(
    apartments.map((apartment) => apartment.id),
    today,
    addDays(today, AVAILABILITY_HORIZON_DAYS),
  );
  return apartments.map((apartment) => toPublic(apartment, unavailable.get(apartment.id) ?? []));
}

function notFound(): HttpError {
  return HttpError.notFound('Không tìm thấy căn hộ.');
}

/** Published apartments, in display order, with availability. */
async function listApartments(): Promise<Apartment[]> {
  const apartments = await apartmentRepository.findAll({ activeOnly: true });
  return withAvailability(apartments);
}

/** @throws HttpError 404 when no published apartment has this slug. */
async function getApartmentBySlug(slug: string): Promise<Apartment> {
  const apartment = await apartmentRepository.findBySlug(slug);
  if (!apartment || !apartment.isActive) throw notFound();

  const [withDates] = await withAvailability([apartment]);
  return withDates;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function listForAdmin(): Promise<AdminApartment[]> {
  return apartmentRepository.findAll({ activeOnly: false });
}

async function getForAdmin(slug: string): Promise<AdminApartment> {
  const apartment = await apartmentRepository.findBySlug(slug);
  if (!apartment) throw notFound();
  return apartment;
}

function slugTaken(error: unknown): boolean {
  return isPgError(error, PG_ERROR.uniqueViolation);
}

const SLUG_TAKEN = () => HttpError.conflict('SLUG_TAKEN', 'Đường dẫn (slug) này đã được dùng cho căn hộ khác.');

async function create(input: ApartmentInput): Promise<AdminApartment> {
  try {
    return await apartmentRepository.create(input);
  } catch (error) {
    if (slugTaken(error)) throw SLUG_TAKEN();
    throw error;
  }
}

async function update(slug: string, input: ApartmentInput): Promise<AdminApartment> {
  try {
    const updated = await apartmentRepository.update(slug, input);
    if (!updated) throw notFound();
    return updated;
  } catch (error) {
    if (slugTaken(error)) throw SLUG_TAKEN();
    throw error;
  }
}

async function listBlockedDates(slug: string, from: string, to: string): Promise<BlockedDate[]> {
  const apartment = await getForAdmin(slug);
  return apartmentRepository.listBlockedDates(apartment.id, from, to);
}

/** Closes dates for booking. Existing bookings on those dates are not affected. */
async function blockDates(slug: string, dates: string[], reason: string | undefined): Promise<void> {
  const apartment = await getForAdmin(slug);
  await apartmentRepository.addBlockedDates(apartment.id, dates, reason);
}

async function unblockDates(slug: string, dates: string[]): Promise<void> {
  const apartment = await getForAdmin(slug);
  await apartmentRepository.removeBlockedDates(apartment.id, dates);
}

export const apartmentService = {
  listApartments,
  getApartmentBySlug,
  listForAdmin,
  getForAdmin,
  create,
  update,
  listBlockedDates,
  blockDates,
  unblockDates,
};
