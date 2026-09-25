import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-booking-card',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './booking-card.html',
})
export class BookingCard {
  /** Lowest nightly price, in VND. */
  readonly priceFrom = input.required<number>();
  /** Apartment slug, carried into the booking flow as `?apt=`. */
  readonly slug = input.required<string>();
}
