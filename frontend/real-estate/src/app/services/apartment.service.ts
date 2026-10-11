import { Injectable, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { API_URL, ApiResponse } from '../core/api';
import { Apartment } from '../models/apartment';
import { LANG } from '../i18n/i18n';
import { localizeSunGarden } from '../data/sun-garden-en';

/** The Wi-Fi tag is not shown on apartment cards or the overview (it stays in the amenity list). */
const HIDDEN_TAGS = new Set(['Wi-Fi miễn phí', 'Free Wi-Fi']);

function withoutWifiTag(apartment: Apartment): Apartment {
  return { ...apartment, keyFacilities: apartment.keyFacilities.filter((tag) => !HIDDEN_TAGS.has(tag)) };
}

/**
 * Single source of apartment data for every page, loaded once from the API.
 * During server-side rendering the response is embedded in the page, so the browser
 * reuses it instead of fetching again.
 */
@Injectable({ providedIn: 'root' })
export class ApartmentService {
  private readonly apiUrl = inject(API_URL);
  private readonly lang = inject(LANG);
  private readonly list = httpResource<ApiResponse<Apartment[]>>(() => `${this.apiUrl}/api/v1/apartments`);

  readonly all = computed<Apartment[]>(() => {
    if (!this.list.hasValue()) return [];
    const apartments = this.list.value().data.map(withoutWifiTag);
    return this.lang === 'en' ? apartments.map(localizeSunGarden) : apartments;
  });

  /** True until the first response (or error) arrives. */
  readonly loading = computed(() => this.list.isLoading() && !this.list.hasValue());
  readonly failed = computed(() => this.list.status() === 'error');

  reload(): void {
    this.list.reload();
  }

  bySlug(slug: string): Apartment | undefined {
    return this.all().find((a) => a.slug === slug);
  }

  /** Resolves the `?apt=` query param; without one, the first apartment is the default. */
  resolve(slug?: string): Apartment | undefined {
    if (slug) return this.bySlug(slug);
    return this.all()[0];
  }
}
