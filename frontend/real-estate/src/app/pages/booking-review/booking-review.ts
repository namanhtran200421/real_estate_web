import { Component, computed, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { SAMPLE_BOOKING, sampleQuote } from '../../data/booking.mock';
import { NIGHT_RATE_LABELS } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-booking-review',
  imports: [DatePipe, DecimalPipe, RouterLink, ApartmentNotFound, BookingSteps, BookingSummary],
  templateUrl: './booking-review.html',
})
export class BookingReview {
  private readonly apartments = inject(ApartmentService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly booking = SAMPLE_BOOKING;
  protected readonly quote = computed(() => {
    const apt = this.apartment();
    return apt ? sampleQuote(apt.pricing) : undefined;
  });
  protected readonly rateLabels = NIGHT_RATE_LABELS;
}
