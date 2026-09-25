import { Component, computed, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { SAMPLE_BOOKING, sampleQuote } from '../../data/booking.mock';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-booking-confirmation',
  imports: [DatePipe, DecimalPipe, RouterLink, BookingSteps, StatusBadge],
  templateUrl: './booking-confirmation.html',
})
export class BookingConfirmation {
  private readonly apartments = inject(ApartmentService);

  /** Bound from the `:reference` route param. */
  readonly reference = input.required<string>();
  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  // Placeholder: will load the booking by reference from the backend.
  protected readonly booking = SAMPLE_BOOKING;
  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly quote = computed(() => {
    const apt = this.apartment();
    return apt ? sampleQuote(apt.pricing) : undefined;
  });
}
