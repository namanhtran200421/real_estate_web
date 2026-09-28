import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentGallery } from '../../components/apartment-gallery/apartment-gallery';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingCard } from '../../components/booking-card/booking-card';
import { PriceList } from '../../components/price-list/price-list';
import { ApartmentService } from '../../services/apartment.service';
import { SUN_GARDEN_AMENITIES } from '../../data/sun-garden-amenities';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-apartment-detail',
  imports: [RouterLink, TranslocoPipe, ApartmentGallery, ApartmentHeader, ApartmentNotFound, BookingCard, PriceList],
  templateUrl: './apartment-detail.html',
})
export class ApartmentDetail {
  private readonly apartments = inject(ApartmentService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly amenityGroups = SUN_GARDEN_AMENITIES;

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly mapsLink = computed(() =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.apartment()?.mapQuery ?? '')}`,
  );
  protected readonly mapUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.google.com/maps?q=${encodeURIComponent(this.apartment()?.mapQuery ?? '')}&output=embed`,
    ),
  );

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'apartment.tabs.overview', path: '/apartment' });
    });
  }

  /** `label` and `text` are translation keys. */
  protected readonly explore = [
    { path: '/gallery', label: 'apartment.tabs.gallery', text: 'apartment.explore.gallery' },
    { path: '/availability', label: 'apartment.tabs.availability', text: 'apartment.explore.availability' },
    { path: '/location', label: 'apartment.tabs.location', text: 'apartment.explore.location' },
  ];
}
