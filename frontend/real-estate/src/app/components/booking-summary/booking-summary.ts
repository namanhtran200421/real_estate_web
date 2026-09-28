import { Component, input } from '@angular/core';
import { DatePipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Apartment } from '../../models/apartment';
import { Stay } from '../../models/booking';

/** Sticky side card on the booking-flow pages. */
@Component({
  selector: 'app-booking-summary',
  imports: [DatePipe, DecimalPipe, NgOptimizedImage, TranslocoPipe],
  templateUrl: './booking-summary.html',
})
export class BookingSummary {
  readonly apartment = input.required<Apartment>();
  /** Omit on the first step, before dates are chosen. */
  readonly stay = input<Stay>();
  readonly total = input<number>();
}
