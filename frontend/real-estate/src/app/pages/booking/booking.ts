import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Select, SelectOption } from '../../components/select/select';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-booking',
  imports: [RouterLink, ApartmentNotFound, BookingSteps, BookingSummary, Select],
  templateUrl: './booking.html',
})
export class BookingPage {
  private readonly apartments = inject(ApartmentService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly all = this.apartments.all;
  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly apartmentOptions = computed<SelectOption[]>(() =>
    this.all().map((a) => ({ value: a.slug, label: `${a.name} · ${a.area}` })),
  );
  protected readonly guestOptions = computed<SelectOption[]>(() =>
    Array.from({ length: this.apartment()?.guests ?? 1 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} khách` })),
  );
}
