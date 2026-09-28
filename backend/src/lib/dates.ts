/**
 * Calendar-date helpers.
 *
 * Stays are counted in calendar days ("yyyy-mm-dd" strings), never in timestamps, so a night
 * is the same night regardless of the server's time zone. Arithmetic is done in UTC, where
 * every day has exactly 24 hours.
 */
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True for real calendar dates only (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = toUtc(value);
  return !Number.isNaN(date.getTime()) && fromUtc(date) === value;
}

/** Today's date in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

/** The nights of a stay: every date from check-in up to, not including, check-out. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const count = daysBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(count, 0) }, (_, index) => addDays(checkIn, index));
}
