import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-booking-card',
  imports: [DecimalPipe, RouterLink, TranslocoPipe],
  templateUrl: './booking-card.html',
})
export class BookingCard {
  /** Lowest nightly price, in VND. */
  readonly priceFrom = input.required<number>();
  /** Apartment slug, carried into the booking flow as `?apt=`. */
  readonly slug = input.required<string>();
}
