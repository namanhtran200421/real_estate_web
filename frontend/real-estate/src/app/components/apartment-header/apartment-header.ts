import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Apartment } from '../../models/apartment';

/** Title block + tabs shared by the apartment pages (overview, gallery, availability, location). */
@Component({
  selector: 'app-apartment-header',
  imports: [DecimalPipe, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './apartment-header.html',
})
export class ApartmentHeader {
  readonly apartment = input.required<Apartment>();

  /** `label` is a translation key. */
  protected readonly tabs = [
    { label: 'apartment.tabs.overview', path: '/apartment' },
    { label: 'apartment.tabs.gallery', path: '/gallery' },
    { label: 'apartment.tabs.availability', path: '/availability' },
    { label: 'apartment.tabs.location', path: '/location' },
  ];
}
