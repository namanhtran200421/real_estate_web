import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StatusBadge } from '../../../components/status-badge/status-badge';
import { BOOKING_STATUS_LABELS, BookingStatus } from '../../../models/booking';
import { ApartmentService } from '../../../services/apartment.service';
import { AdminApiService } from '../../admin-api.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-admin-bookings',
  imports: [DatePipe, DecimalPipe, RouterLink, StatusBadge],
  templateUrl: './bookings.html',
})
export class AdminBookings {
  private readonly api = inject(AdminApiService);
  protected readonly apartments = inject(ApartmentService).all;

  /** Bound from `?status=` (dashboard links). */
  readonly statusParam = input<string>(undefined, { alias: 'status' });

  protected readonly statuses = Object.entries(BOOKING_STATUS_LABELS) as [BookingStatus, string][];
  protected readonly status = linkedSignal<string>(() => this.statusParam() ?? '');
  protected readonly apartment = signal('');
  protected readonly search = signal('');
  protected readonly sort = signal<'created_at' | 'check_in'>('created_at');
  protected readonly page = signal(1);

  protected readonly bookings = resource({
    params: () => ({
      status: (this.status() || undefined) as BookingStatus | undefined,
      apartment: this.apartment() || undefined,
      search: this.search() || undefined,
      sort: this.sort(),
      page: this.page(),
      pageSize: PAGE_SIZE,
    }),
    loader: ({ params }) => this.api.bookings(params),
  });

  protected readonly pages = computed(() => {
    if (!this.bookings.hasValue()) return 1;
    return Math.max(1, Math.ceil(this.bookings.value().total / PAGE_SIZE));
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /** Any filter change starts again from the first page. */
  protected filter(apply: () => void): void {
    apply();
    this.page.set(1);
  }

  protected setSort(value: string): void {
    if (value === 'check_in') this.sort.set('check_in');
    else this.sort.set('created_at');
  }
}
