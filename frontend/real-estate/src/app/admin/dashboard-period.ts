import { StatsPeriod } from './admin.types';
import { addDaysIso, shortDate } from '../shared/dates';

export const REPORT_PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'day', label: 'Ngày' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
];

export function validReportDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31')
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function reportStart(period: StatsPeriod, date: string): string {
  if (period === 'year') return `${date.slice(0, 4)}-01-01`;
  if (period === 'month') return `${date.slice(0, 7)}-01`;
  if (period === 'week') {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return addDaysIso(date, -((weekday + 6) % 7));
  }
  return date;
}

export function moveReport(period: StatsPeriod, date: string, direction: number): string {
  const start = reportStart(period, date);
  if (period === 'day' || period === 'week')
    return addDaysIso(start, direction * (period === 'week' ? 7 : 1));
  const next = new Date(`${start}T00:00:00Z`);
  if (period === 'month') next.setUTCMonth(next.getUTCMonth() + direction);
  else next.setUTCFullYear(next.getUTCFullYear() + direction);
  return next.toISOString().slice(0, 10);
}

export function reportLabel(period: StatsPeriod, start: string, end?: string): string {
  if (period === 'year') return `Năm ${start.slice(0, 4)}`;
  if (period === 'month') return `Tháng ${Number(start.slice(5, 7))}/${start.slice(0, 4)}`;
  if (period === 'week') {
    const last = addDaysIso(end ?? moveReport(period, start, 1), -1);
    return `${shortDate(start)}/${start.slice(0, 4)} – ${shortDate(last)}/${last.slice(0, 4)}`;
  }
  return `${shortDate(start)}/${start.slice(0, 4)}`;
}

export function reportAxisLabel(period: StatsPeriod, start: string): string {
  if (period === 'year') return start.slice(0, 4);
  if (period === 'month')
    return start.slice(5, 7) === '01' ? `T1/${start.slice(2, 4)}` : `T${Number(start.slice(5, 7))}`;
  return shortDate(start);
}
