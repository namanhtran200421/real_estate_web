import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CAPTCHA_ENABLED, Captcha } from '../../components/captcha/captcha';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { ApiErrorMessages, toApiError } from '../../core/api';
import { Booking } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingService } from '../../services/booking.service';
import { GuestReview } from '../../models/guest-review';
import { GuestReviewService } from '../../services/guest-review.service';

/** Find a booking by reference + email or phone (also the landing page of email links). */
@Component({
  selector: 'app-booking-lookup',
  imports: [DatePipe, DecimalPipe, NgOptimizedImage, RouterLink, TranslocoPipe, Captcha, StatusBadge],
  templateUrl: './booking-lookup.html',
})
export class BookingLookup {
  private readonly bookings = inject(BookingService);
  private readonly reviews = inject(GuestReviewService);
  private readonly apartments = inject(ApartmentService);
  private readonly errorMessages = inject(ApiErrorMessages);

  /** Bound from `?ref=`: prefilled from email links and the confirmation page. */
  readonly ref = input<string>();

  protected readonly reference = signal('');
  protected readonly contact = signal('');
  protected readonly searching = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly booking = signal<Booking | undefined>(undefined);
  protected readonly review = signal<GuestReview | null | undefined>(undefined);
  protected readonly reviewLoading = signal(false);
  protected readonly reviewError = signal<string | undefined>(undefined);
  protected readonly rating = signal(0);
  protected readonly comment = signal('');
  protected readonly submittingReview = signal(false);

  private readonly captcha = viewChild(Captcha);
  protected readonly captchaToken = signal('');
  protected readonly awaitingCaptcha = computed(() => CAPTCHA_ENABLED && !this.captchaToken());

  protected readonly apartment = computed(() => {
    const booking = this.booking();
    if (!booking) return undefined;
    return this.apartments.bySlug(booking.apartmentSlug);
  });

  constructor() {
    effect(() => {
      const ref = this.ref();
      if (!ref) return;
      this.reference.set(ref.toUpperCase());
      // This browser already has access (e.g. it made the booking): show it straight away.
      if (this.bookings.hasAccess(ref.toUpperCase())) void this.load(ref.toUpperCase());
    });
  }

  protected fromInput(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async search(): Promise<void> {
    this.searching.set(true);
    this.error.set(undefined);
    this.booking.set(undefined);
    this.review.set(undefined);
    try {
      const booking = await this.bookings.lookup(this.reference().trim(), this.contact().trim(), this.captchaToken());
      this.booking.set(booking);
      void this.loadReview(booking);
    } catch (error) {
      this.error.set(this.errorMessages.message(toApiError(error)));
    } finally {
      this.searching.set(false);
      // Each CAPTCHA token works once; another search needs a fresh one.
      this.captcha()?.reset();
    }
  }

  private async load(reference: string): Promise<void> {
    try {
      const booking = await this.bookings.get(reference);
      this.booking.set(booking);
      void this.loadReview(booking);
    } catch {
      // Token no longer valid: the guest uses the form.
    }
  }

  private async loadReview(booking: Booking): Promise<void> {
    if (booking.status !== 'completed') return;
    this.reviewLoading.set(true);
    this.reviewError.set(undefined);
    try {
      const review = await this.reviews.forBooking(booking.reference);
      if (this.booking()?.reference === booking.reference) this.review.set(review);
    } catch (error) {
      if (this.booking()?.reference === booking.reference) this.reviewError.set(this.errorMessages.message(toApiError(error)));
    } finally {
      if (this.booking()?.reference === booking.reference) this.reviewLoading.set(false);
    }
  }

  protected async submitReview(): Promise<void> {
    const booking = this.booking();
    const comment = this.comment().trim();
    if (!booking || booking.status !== 'completed' || this.review() !== null || this.rating() < 1 || comment.length < 20 || this.submittingReview()) return;
    this.submittingReview.set(true);
    this.reviewError.set(undefined);
    try {
      this.review.set(await this.reviews.submit(booking.reference, this.rating(), comment));
    } catch (error) {
      this.reviewError.set(this.errorMessages.message(toApiError(error)));
    } finally {
      this.submittingReview.set(false);
    }
  }
}
