import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { ApiErrorMessages, toApiError } from '../../core/api';
import { Booking } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingService } from '../../services/booking.service';

/** Find a booking by reference + email or phone (also the landing page of email links). */
@Component({
  selector: 'app-booking-lookup',
  imports: [DatePipe, DecimalPipe, NgOptimizedImage, RouterLink, TranslocoPipe, StatusBadge],
  templateUrl: './booking-lookup.html',
})
export class BookingLookup {
  private readonly bookings = inject(BookingService);
  private readonly apartments = inject(ApartmentService);
  private readonly errorMessages = inject(ApiErrorMessages);

  /** Bound from `?ref=`: prefilled from email links and the confirmation page. */
  readonly ref = input<string>();

  protected readonly reference = signal('');
  protected readonly contact = signal('');
  protected readonly searching = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly booking = signal<Booking | undefined>(undefined);

  protected readonly apartment = computed(() => {
    const booking = this.booking();
    if (!booking) return undefined;
    return this.apartments.bySlug(booking.apartmentSlug);
  });

  constructor() {
    effect(() => {
      const ref = this.ref();
      if (!ref) return;
      this.reference.set(ref.toUpperCase());
      // This browser already has access (e.g. it made the booking): show it straight away.
      if (this.bookings.hasAccess(ref.toUpperCase())) void this.load(ref.toUpperCase());
    });
  }

  protected fromInput(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async search(): Promise<void> {
    this.searching.set(true);
    this.error.set(undefined);
    this.booking.set(undefined);
    try {
      this.booking.set(await this.bookings.lookup(this.reference().trim(), this.contact().trim()));
    } catch (error) {
      this.error.set(this.errorMessages.message(toApiError(error)));
    } finally {
      this.searching.set(false);
    }
  }

  private async load(reference: string): Promise<void> {
    try {
      this.booking.set(await this.bookings.get(reference));
    } catch {
      // Token no longer valid: the guest uses the form.
    }
  }
}
