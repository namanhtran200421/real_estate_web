import { Component, computed, effect, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { ContactCards } from '../../components/contact-cards/contact-cards';
import { ApartmentService } from '../../services/apartment.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-location',
  imports: [TranslocoPipe, ApartmentHeader, ApartmentNotFound, ContactCards],
  templateUrl: './location.html',
})
export class LocationPage {
  private readonly apartments = inject(ApartmentService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'apartment.tabs.location', path: '/location' });
    });
  }

  // Fixed Google Maps origin + encoded query, so trusting the URL is safe.
  protected readonly mapUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.google.com/maps?q=${encodeURIComponent(this.apartment()?.mapQuery ?? '')}&output=embed`,
    ),
  );
}
