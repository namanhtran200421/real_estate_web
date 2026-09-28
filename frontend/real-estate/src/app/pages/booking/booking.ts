import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Select, SelectOption } from '../../components/select/select';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { DateRange, DateRangePicker } from '../../components/date-range-picker/date-range-picker';
import { ApiResponse, toApiError, userMessage } from '../../core/api';
import { Quote, Stay } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingDraft, BookingDraftService } from '../../services/booking-draft.service';
import { BookingService } from '../../services/booking.service';
import { MAX_DAYS_AHEAD, MAX_NIGHTS, addDaysIso, todayIso } from '../../shared/dates';

/** Step 1: dates, guests and contact details. The price updates live as dates change. */
@Component({
  selector: 'app-booking',
  imports: [DecimalPipe, RouterLink, ApartmentNotFound, BookingSteps, BookingSummary, DateRangePicker, Select],
  templateUrl: './booking.html',
})
export class BookingPage {
  private readonly apartments = inject(ApartmentService);
  private readonly bookings = inject(BookingService);
  private readonly router = inject(Router);
  protected readonly drafts = inject(BookingDraftService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly all = this.apartments.all;
  protected readonly apartment = computed(() => this.apartments.resolve(this.slug() || this.drafts.draft().apartmentSlug));
  protected readonly draft = this.drafts.draft;
  protected readonly today = todayIso();
  protected readonly lastDate = addDaysIso(this.today, MAX_DAYS_AHEAD);
  protected readonly maxNights = MAX_NIGHTS;

  /** Errors are shown only after the guest tries to continue. */
  protected readonly submitted = signal(false);
  protected readonly errors = computed(() => {
    if (!this.submitted()) return {};
    return this.drafts.errors();
  });

  protected readonly apartmentOptions = computed<SelectOption[]>(() =>
    this.all().map((a) => ({ value: a.slug, label: `${a.name} · ${a.area}` })),
  );
  protected readonly guestOptions = computed<SelectOption[]>(() =>
    Array.from({ length: this.apartment()?.guests ?? 1 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} khách` })),
  );

  /** Live price for the chosen dates; reloads whenever apartment, dates or guests change. */
  protected readonly quote = httpResource<ApiResponse<Quote>>(() => {
    const draft = this.draft();
    if (!draft.apartmentSlug || !this.drafts.datesValid()) return undefined;
    return this.bookings.quoteUrl({
      apartmentSlug: draft.apartmentSlug,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      guests: draft.guests,
    });
  });

  private readonly quoteApiError = computed(() => {
    if (this.quote.status() !== 'error') return undefined;
    return toApiError(this.quote.error());
  });

  protected readonly quoteError = computed(() => {
    const error = this.quoteApiError();
    if (!error) return undefined;
    return userMessage(error);
  });

  protected readonly quoteValue = computed(() => {
    if (!this.quote.hasValue()) return undefined;
    return this.quote.value().data;
  });

  protected readonly stay = computed<Stay | undefined>(() => {
    const quote = this.quoteValue();
    if (!quote) return undefined;
    return { checkIn: quote.checkIn, checkOut: quote.checkOut, guests: quote.guests, nights: quote.nights };
  });

  constructor() {
    // Keep the draft on the apartment being shown.
    effect(() => {
      const apt = this.apartment();
      if (apt) this.drafts.forApartment(apt.slug, apt.guests);
    });

    // Someone else just booked some of these dates: refresh the calendar so it shows them.
    effect(() => {
      if (this.quoteApiError()?.code === 'DATES_UNAVAILABLE') this.apartments.reload();
    });
  }

  protected setDates(range: DateRange): void {
    this.drafts.update(range);
  }

  protected set<K extends keyof BookingDraft>(field: K, value: BookingDraft[K]): void {
    this.drafts.update({ [field]: value } as Partial<BookingDraft>);
  }

  protected fromInput(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected toNumber(value: string): number {
    return Number(value);
  }

  protected chooseApartment(slug: string): void {
    void this.router.navigate([], { queryParams: { apt: slug }, replaceUrl: true });
  }

  protected continue(): void {
    this.submitted.set(true);
    if (!this.drafts.complete() || this.quoteError() || !this.quoteValue()) return;
    void this.router.navigate(['/book/review'], { queryParams: { apt: this.draft().apartmentSlug } });
  }
}
