import { Component, computed, effect, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { AvailabilityCalendar } from '../../components/availability-calendar/availability-calendar';
import { ApartmentService } from '../../services/apartment.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-availability',
  imports: [DecimalPipe, RouterLink, ApartmentHeader, ApartmentNotFound, AvailabilityCalendar],
  templateUrl: './availability.html',
})
export class Availability {
  private readonly apartments = inject(ApartmentService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'Lịch trống', path: '/availability' });
    });
  }
}
