/** The business operates in Vietnam; "today" is Vietnam's calendar day wherever the guest is. */
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Calendar column headings, Monday first (Vietnamese convention): translation keys. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => `calendar.weekdays.${day}`);

/** Booking limits, the same as the API's (backend: booking.rules.ts). */
export const MAX_NIGHTS = 90;
export const MAX_DAYS_AHEAD = 365;

/** Today as yyyy-mm-dd (for date comparisons and calendar limits). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

export function addDaysIso(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Nights between check-in and check-out. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

/**
 * Whole years from `dateOfBirth` to `date` (both yyyy-mm-dd), as the API counts them; born on 29/02,
 * one turns a year older on 01/03 in other years.
 */
export function ageOn(dateOfBirth: string, date: string): number {
  const years = Number(date.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  return date.slice(5) < dateOfBirth.slice(5) ? years - 1 : years;
}

/** "2026-11-12" → "12/11". */
export function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Time left on a booking's hold, as the payment page's countdown shows it: "2:59:41". */
export function holdCountdown(msLeft: number): string {
  const seconds = Math.max(0, Math.floor(msLeft / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}
