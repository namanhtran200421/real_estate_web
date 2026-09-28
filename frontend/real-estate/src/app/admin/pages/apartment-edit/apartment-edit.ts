import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../../core/api';
import { ApartmentService } from '../../../services/apartment.service';
import { AdminApiService } from '../../admin-api.service';
import { AdminApartment, ApartmentInput } from '../../admin.types';

/**
 * The editor's state. List fields are edited as text, one item per line
 * ("a | b" for pairs), which is quick to type and paste.
 */
interface ApartmentForm {
  slug: string;
  name: string;
  area: string;
  address: string;
  mapQuery: string;
  tagline: string;
  description: string;
  photos: string;
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  keyFacilities: string;
  facilities: string;
  checkIn: string;
  checkOut: string;
  rules: string;
  nearby: string;
  weekday: number;
  weekend: number;
  holiday: number;
  weekly: number;
  monthly: number;
  longStayDiscounts: string;
  depositPercent: number;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY: ApartmentForm = {
  slug: '',
  name: '',
  area: '',
  address: '',
  mapQuery: '',
  tagline: '',
  description: '',
  photos: '',
  guests: 2,
  bedrooms: 1,
  beds: 1,
  bathrooms: 1,
  keyFacilities: '',
  facilities: '',
  checkIn: '14:00',
  checkOut: '12:00',
  rules: '',
  nearby: '',
  weekday: 0,
  weekend: 0,
  holiday: 0,
  weekly: 0,
  monthly: 0,
  longStayDiscounts: '',
  depositPercent: 30,
  isActive: false,
  sortOrder: 0,
};

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** "a | b" per line. */
const pairs = (text: string) => lines(text).map((line) => line.split('|').map((part) => part.trim()));

function toForm(apartment: AdminApartment): ApartmentForm {
  return {
    ...apartment,
    description: apartment.description.join('\n\n'),
    photos: apartment.photos.map((p) => `${p.src} | ${p.alt}`).join('\n'),
    keyFacilities: apartment.keyFacilities.join('\n'),
    facilities: apartment.facilities.join('\n'),
    rules: apartment.rules.join('\n'),
    nearby: apartment.nearby.map((n) => `${n.place} | ${n.distance}`).join('\n'),
    ...apartment.pricing,
    longStayDiscounts: apartment.pricing.longStayDiscounts.map((d) => `${d.nights} | ${d.percent}`).join('\n'),
  };
}

function fromForm(form: ApartmentForm): ApartmentInput {
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    area: form.area.trim(),
    address: form.address.trim(),
    mapQuery: form.mapQuery.trim(),
    tagline: form.tagline.trim(),
    description: form.description
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    photos: pairs(form.photos).map(([src, alt]) => ({ src, alt: alt ?? '' })),
    guests: form.guests,
    bedrooms: form.bedrooms,
    beds: form.beds,
    bathrooms: form.bathrooms,
    keyFacilities: lines(form.keyFacilities),
    facilities: lines(form.facilities),
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    rules: lines(form.rules),
    nearby: pairs(form.nearby).map(([place, distance]) => ({ place, distance: distance ?? '' })),
    pricing: {
      weekday: form.weekday,
      weekend: form.weekend,
      holiday: form.holiday,
      weekly: form.weekly,
      monthly: form.monthly,
      longStayDiscounts: pairs(form.longStayDiscounts).map(([nights, percent]) => ({
        nights: Number(nights),
        percent: Number(percent),
      })),
    },
    depositPercent: form.depositPercent,
    isActive: form.isActive,
    sortOrder: form.sortOrder,
  };
}

@Component({
  selector: 'app-admin-apartment-edit',
  imports: [RouterLink],
  templateUrl: './apartment-edit.html',
})
export class AdminApartmentEdit {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly publicApartments = inject(ApartmentService);

  /** Bound from the `:slug` route param; absent when creating. */
  readonly slug = input<string>();

  protected readonly form = signal<ApartmentForm>({ ...EMPTY });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<ApiError | undefined>(undefined);

  constructor() {
    effect(() => {
      const slug = this.slug();
      if (slug) void this.load(slug);
    });
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    try {
      this.form.set(toForm(await this.api.apartment(slug)));
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected text(field: keyof ApartmentForm, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.form.update((form) => ({ ...form, [field]: value }));
    this.saved.set(false);
  }

  protected number(field: keyof ApartmentForm, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.form.update((form) => ({ ...form, [field]: value }));
    this.saved.set(false);
  }

  protected toggleActive(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.form.update((form) => ({ ...form, isActive: checked }));
    this.saved.set(false);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(undefined);
    try {
      const input = fromForm(this.form());
      const current = this.slug();
      let saved: AdminApartment;
      if (current) saved = await this.api.updateApartment(current, input);
      else saved = await this.api.createApartment(input);

      this.saved.set(true);
      this.publicApartments.reload();
      if (saved.slug !== current) void this.router.navigate(['/admin/apartments', saved.slug], { replaceUrl: true });
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
