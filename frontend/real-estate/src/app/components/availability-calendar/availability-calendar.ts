import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { WEEKDAYS } from '../../shared/dates';

type DayStatus = 'past' | 'unavailable' | 'available';

const pad = (n: number) => String(n).padStart(2, '0');

/** Single-month availability calendar with previous/next navigation. */
@Component({
  selector: 'app-availability-calendar',
  imports: [TranslocoPipe],
  templateUrl: './availability-calendar.html',
})
export class AvailabilityCalendar {
  private readonly transloco = inject(TranslocoService);

  /** ISO dates (yyyy-mm-dd) that are booked or blocked. */
  readonly unavailableDates = input<string[]>([]);
  /** How many months ahead of the current one guests can browse. */
  readonly monthsAhead = input(11);

  protected readonly weekdays = WEEKDAYS;

  /** Months from the current month; 0 = this month. */
  protected readonly offset = signal(0);

  protected readonly month = computed(() => {
    const unavailable = new Set(this.unavailableDates());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const first = new Date(today.getFullYear(), today.getMonth() + this.offset(), 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const count = new Date(year, month + 1, 0).getDate();

    return {
      label: this.transloco.translate('calendar.monthYear', {
        month: this.transloco.translate(`calendar.months.${month + 1}`),
        year,
      }),
      blanks: Array.from({ length: (first.getDay() + 6) % 7 }, (_, i) => i),
      days: Array.from({ length: count }, (_, d) => {
        const day = d + 1;
        const status: DayStatus =
          new Date(year, month, day) < today
            ? 'past'
            : unavailable.has(`${year}-${pad(month + 1)}-${pad(day)}`)
              ? 'unavailable'
              : 'available';
        return { day, status };
      }),
    };
  });

  protected previous() {
    this.offset.update((o) => Math.max(0, o - 1));
  }

  protected next() {
    this.offset.update((o) => Math.min(this.monthsAhead(), o + 1));
  }
}
