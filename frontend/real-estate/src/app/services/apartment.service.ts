import { Injectable, signal } from '@angular/core';
import { APARTMENTS } from '../data/apartments.mock';
import { Apartment } from '../models/apartment';

/**
 * Single source of apartment data for every page.
 * Serves mock data for now. Swap the internals for HttpClient calls to the
 * backend API later without touching the components.
 */
@Injectable({ providedIn: 'root' })
export class ApartmentService {
  private readonly apartments = signal<Apartment[]>(APARTMENTS);

  readonly all = this.apartments.asReadonly();

  bySlug(slug: string): Apartment | undefined {
    return this.apartments().find((a) => a.slug === slug);
  }

  /** Resolves the `?apt=` query param; without one, the first apartment is the default. */
  resolve(slug?: string): Apartment | undefined {
    return slug ? this.bySlug(slug) : this.apartments()[0];
  }
}
