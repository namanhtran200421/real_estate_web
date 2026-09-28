import { Component, input } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Apartment } from '../../models/apartment';

@Component({
  selector: 'app-apartment-card',
  imports: [DecimalPipe, NgOptimizedImage, RouterLink, TranslocoPipe],
  templateUrl: './apartment-card.html',
})
export class ApartmentCard {
  readonly apartment = input.required<Apartment>();
  /** Featured = wide horizontal card for the lead apartment; default = grid tile. */
  readonly featured = input(false);
}
