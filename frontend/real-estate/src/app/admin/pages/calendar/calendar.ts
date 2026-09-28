import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { toApiError } from '../../../core/api';
import { todayIso } from '../../../shared/dates';
import { AdminApiService } from '../../admin-api.service';

type DayState = 'past' | 'booked' | 'blocked' | 'free';

const pad = (n: number) => String(n).padStart(2, '0');

/** Month calendar per apartment: close or reopen dates with one tap. Booked dates are read-only. */
@Component({
  selector: 'app-admin-calendar',
  templateUrl: './calendar.html',
})
export class AdminCalendar {
  private readonly api = inject(AdminApiService);
  private readonly apartmentList = resource({ loader: () => this.api.apartments() });
  protected readonly apartments = computed(() => {
    if (!this.apartmentList.hasValue()) return [];
    return this.apartmentList.value();
  });

  protected readonly slug = signal('');
  protected readonly offset = signal(0);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  private readonly today = todayIso();

  protected readonly month = computed(() => {
    const now = new Date(`${this.today}T00:00:00Z`);
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + this.offset(), 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth();
    const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return {
      label: `Tháng ${month + 1}, ${year}`,
      from: `${year}-${pad(month + 1)}-01`,
      to: `${year}-${pad(month + 1)}-${pad(count)}`,
      blanks: Array.from({ length: (first.getUTCDay() + 6) % 7 }, (_, i) => i),
      dates: Array.from({ length: count }, (_, d) => `${year}-${pad(month + 1)}-${pad(d + 1)}`),
    };
  });

  protected readonly data = resource({
    params: () => {
      if (!this.slug()) return undefined;
      return { slug: this.slug(), from: this.month().from, to: this.month().to };
    },
    loader: async ({ params }) => {
      const [unavailable, blocked] = await Promise.all([
        this.api.unavailableDates(params.slug),
        this.api.blockedDates(params.slug, params.from, params.to),
      ]);
      return { unavailable: new Set(unavailable), blocked: new Map(blocked.map((b) => [b.date, b.reason])) };
    },
  });

  protected readonly days = computed(() => {
    const month = this.month();
    let data: { unavailable: Set<string>; blocked: Map<string, string | null> } | undefined;
    if (this.data.hasValue()) data = this.data.value();

    return month.dates.map((date) => {
      let state: DayState = 'free';
      if (date < this.today) state = 'past';
      else if (data?.blocked.has(date)) state = 'blocked';
      else if (data?.unavailable.has(date)) state = 'booked';
      return { date, day: Number(date.slice(8)), state, reason: data?.blocked.get(date) ?? null };
    });
  });

  constructor() {
    effect(() => {
      const first = this.apartments()[0];
      if (first && !this.slug()) this.slug.set(first.slug);
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected async toggle(date: string, state: DayState): Promise<void> {
    if (state !== 'free' && state !== 'blocked') return;
    this.busy.set(true);
    this.error.set(undefined);
    try {
      if (state === 'free') await this.api.blockDates(this.slug(), [date], this.reason().trim() || undefined);
      else await this.api.unblockDates(this.slug(), [date]);
      this.data.reload();
    } catch (error) {
      this.error.set(toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
