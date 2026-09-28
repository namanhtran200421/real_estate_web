/** The business operates in Vietnam; "today" is Vietnam's calendar day wherever the guest is. */
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

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

/** "2026-11-12" → "12/11". */
export function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
