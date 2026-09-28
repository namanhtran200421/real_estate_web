import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { CAPTCHA_ENABLED, Captcha } from '../../components/captcha/captcha';
import { ApiErrorMessages, ApiResponse, toApiError } from '../../core/api';
import { Quote, Stay } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingDraftService } from '../../services/booking-draft.service';
import { BookingService } from '../../services/booking.service';

/** Step 2: check details and the price breakdown, apply a promo code, create the booking. */
@Component({
  selector: 'app-booking-review',
  imports: [DatePipe, DecimalPipe, RouterLink, TranslocoPipe, ApartmentNotFound, BookingSteps, BookingSummary, Captcha],
  templateUrl: './booking-review.html',
})
export class BookingReview {
  private readonly apartments = inject(ApartmentService);
  private readonly bookings = inject(BookingService);
  private readonly drafts = inject(BookingDraftService);
  private readonly router = inject(Router);
  protected readonly errorMessages = inject(ApiErrorMessages);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly draft = this.drafts.draft;
  protected readonly apartment = computed(() => this.apartments.resolve(this.slug() || this.draft().apartmentSlug));

  protected readonly quote = httpResource<ApiResponse<Quote>>(() => {
    const draft = this.draft();
    if (!draft.apartmentSlug || !this.drafts.datesValid()) return undefined;
    return this.bookings.quoteUrl({
      apartmentSlug: draft.apartmentSlug,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      guests: draft.guests,
      promoCode: draft.promoCode || undefined,
    });
  });

  protected readonly q = computed(() => {
    if (!this.quote.hasValue()) return undefined;
    return this.quote.value().data;
  });

  protected readonly quoteError = computed(() => {
    if (this.quote.status() !== 'error') return undefined;
    return toApiError(this.quote.error());
  });

  protected readonly stay = computed<Stay | undefined>(() => {
    const quote = this.q();
    if (!quote) return undefined;
    return { checkIn: quote.checkIn, checkOut: quote.checkOut, guests: quote.guests, nights: quote.nights };
  });

  protected readonly promoInput = signal('');
  protected readonly promoError = signal<string | undefined>(undefined);
  protected readonly applyingPromo = signal(false);

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | undefined>(undefined);

  private readonly captcha = viewChild(Captcha);
  protected readonly captchaToken = signal('');
  /** A booking already made from this exact draft is reopened, so it needs no new CAPTCHA. */
  protected readonly reusesBooking = computed(() => {
    const existing = this.drafts.existingBooking();
    return existing !== undefined && this.bookings.hasAccess(existing);
  });
  protected readonly awaitingCaptcha = computed(() => CAPTCHA_ENABLED && !this.reusesBooking() && !this.captchaToken());

  constructor() {
    // Arriving here without complete details (refresh after the draft expired, direct link): back to step 1.
    effect(() => {
      if (!this.drafts.complete()) {
        void this.router.navigate(['/book'], { queryParams: { apt: this.slug() }, replaceUrl: true });
      }
    });
  }

  protected setPromoInput(event: Event): void {
    this.promoInput.set((event.target as HTMLInputElement).value);
    this.promoError.set(undefined);
  }

  /** Checks the code with the server before applying it, so a bad code never hides the price. */
  protected async applyPromo(): Promise<void> {
    const code = this.promoInput().trim().toUpperCase();
    if (!code) return;
    const draft = this.draft();

    this.applyingPromo.set(true);
    try {
      await this.bookings.quote({
        apartmentSlug: draft.apartmentSlug,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        guests: draft.guests,
        promoCode: code,
      });
      this.drafts.update({ promoCode: code });
      this.promoInput.set('');
    } catch (error) {
      this.promoError.set(this.errorMessages.message(toApiError(error)));
    } finally {
      this.applyingPromo.set(false);
    }
  }

  protected removePromo(): void {
    this.drafts.update({ promoCode: '' });
  }

  /** Creates the booking (which holds the dates) and moves to payment. */
  protected async continue(): Promise<void> {
    const existing = this.drafts.existingBooking();
    if (existing && this.bookings.hasAccess(existing)) {
      void this.router.navigate(['/book/payment'], { queryParams: { ref: existing } });
      return;
    }

    const draft = this.draft();
    this.submitting.set(true);
    this.submitError.set(undefined);
    try {
      const booking = await this.bookings.create(
        {
          apartmentSlug: draft.apartmentSlug,
          checkIn: draft.checkIn,
          checkOut: draft.checkOut,
          guests: draft.guests,
          promoCode: draft.promoCode || undefined,
          customer: { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() },
          message: draft.message.trim() || undefined,
        },
        this.captchaToken(),
      );
      this.drafts.rememberBooking(booking.reference);
      void this.router.navigate(['/book/payment'], { queryParams: { ref: booking.reference } });
    } catch (error) {
      this.submitError.set(this.errorMessages.message(toApiError(error)));
      this.quote.reload();
      // Each CAPTCHA token works once; a retry needs a fresh one.
      this.captcha()?.reset();
    } finally {
      this.submitting.set(false);
    }
  }
}
