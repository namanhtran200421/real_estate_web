import { Component, DestroyRef, computed, effect, inject, input, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { ApiErrorMessages, toApiError } from '../../core/api';
import { ApartmentService } from '../../services/apartment.service';
import { BookingDraftService } from '../../services/booking-draft.service';
import { BookingService } from '../../services/booking.service';

/** While the owner checks a reported transfer, the page refreshes itself this often. */
const REFRESH_WHILE_CHECKING_MS = 30_000;

/**
 * Step 4: shown after the guest reports a transfer, and linked from emails. Tells the guest
 * where the booking stands: transfer being checked, confirmed, or still unpaid.
 */
@Component({
  selector: 'app-booking-confirmation',
  imports: [DatePipe, DecimalPipe, RouterLink, TranslocoPipe, BookingSteps, StatusBadge],
  templateUrl: './booking-confirmation.html',
})
export class BookingConfirmation {
  private readonly bookings = inject(BookingService);
  private readonly apartments = inject(ApartmentService);
  private readonly drafts = inject(BookingDraftService);
  private readonly errorMessages = inject(ApiErrorMessages);

  /** Bound from the `:reference` route param. */
  readonly reference = input.required<string>();

  protected readonly booking = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.bookings.get(params),
  });

  protected readonly b = computed(() => {
    if (!this.booking.hasValue()) return undefined;
    return this.booking.value();
  });

  /** The browser has no access to this booking: the guest must look it up. */
  protected readonly needsLookup = computed(
    () => this.booking.status() === 'error' && toApiError(this.booking.error()).code === 'NOT_FOUND',
  );
  protected readonly loadError = computed(() => {
    if (this.booking.status() !== 'error' || this.needsLookup()) return undefined;
    return this.errorMessages.message(toApiError(this.booking.error()));
  });

  protected readonly apartment = computed(() => {
    const booking = this.b();
    if (!booking) return undefined;
    return this.apartments.bySlug(booking.apartmentSlug);
  });

  protected readonly lookupContact = signal('');
  protected readonly lookupError = signal<string | undefined>(undefined);
  protected readonly lookingUp = signal(false);

  constructor() {
    const timer = setInterval(() => {
      if (this.b()?.pendingTransfer) this.booking.reload();
    }, REFRESH_WHILE_CHECKING_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // The booking flow is over: the next booking starts from a clean form.
    effect(() => {
      const booking = this.b();
      if (booking && (booking.pendingTransfer || booking.amountPaid > 0)) this.drafts.clear();
    });
  }

  protected setContact(event: Event): void {
    this.lookupContact.set((event.target as HTMLInputElement).value);
  }

  protected async lookup(): Promise<void> {
    this.lookingUp.set(true);
    this.lookupError.set(undefined);
    try {
      await this.bookings.lookup(this.reference(), this.lookupContact());
      this.booking.reload();
    } catch (error) {
      this.lookupError.set(this.errorMessages.message(toApiError(error)));
    } finally {
      this.lookingUp.set(false);
    }
  }
}
