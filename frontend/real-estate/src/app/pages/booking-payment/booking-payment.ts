import { Component, DestroyRef, afterNextRender, computed, effect, inject, input, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { ApiErrorMessages, toApiError } from '../../core/api';
import { PaymentOption, Stay } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingService } from '../../services/booking.service';

/** While the guest is on the page, it checks this often whether the owner has confirmed. */
const WATCH_INTERVAL_MS = 20_000;

/**
 * Step 3: choose deposit or full payment and transfer with the VietQR code. That is all the
 * guest does: the owner confirms when the money shows in the bank app, and the page moves on to
 * the confirmation if it is still open.
 */
@Component({
  selector: 'app-booking-payment',
  imports: [DatePipe, DecimalPipe, RouterLink, TranslocoPipe, BookingSteps, BookingSummary],
  templateUrl: './booking-payment.html',
})
export class BookingPayment {
  private readonly bookings = inject(BookingService);
  private readonly apartments = inject(ApartmentService);
  private readonly router = inject(Router);
  protected readonly errorMessages = inject(ApiErrorMessages);

  /** Bound from the `?ref=` query param. */
  readonly ref = input<string>();

  protected readonly booking = resource({
    params: () => this.ref(),
    loader: ({ params }) => this.bookings.get(params),
  });

  protected readonly b = computed(() => {
    if (!this.booking.hasValue()) return undefined;
    return this.booking.value();
  });

  protected readonly loadError = computed(() => {
    if (this.booking.status() !== 'error') return undefined;
    return toApiError(this.booking.error());
  });

  protected readonly apartment = computed(() => {
    const booking = this.b();
    if (!booking) return undefined;
    return this.apartments.bySlug(booking.apartmentSlug);
  });

  protected readonly stay = computed<Stay | undefined>(() => {
    const booking = this.b();
    if (!booking) return undefined;
    return { checkIn: booking.checkIn, checkOut: booking.checkOut, guests: booking.guests, nights: booking.quote.nights };
  });

  protected readonly option = signal<PaymentOption>('deposit');

  /** The option actually offered: full payment when there is no deposit to choose. */
  private readonly effectiveOption = computed<PaymentOption | undefined>(() => {
    const options = this.b()?.paymentOptions;
    if (!options || options.full === null) return undefined;
    if (this.option() === 'deposit' && options.deposit !== null) return 'deposit';
    return 'full';
  });

  /** Account, amount, transfer note and QR for the chosen option. */
  protected readonly transfer = resource({
    params: () => {
      const reference = this.b()?.reference;
      const option = this.effectiveOption();
      if (!reference || !option) return undefined;
      return { reference, option };
    },
    loader: ({ params }) => this.bookings.transferInstructions(params.reference, params.option),
  });

  protected readonly t = computed(() => {
    if (!this.transfer.hasValue()) return undefined;
    return this.transfer.value();
  });

  private readonly now = signal(Date.now());
  protected readonly minutesLeft = computed(() => {
    const booking = this.b();
    if (!booking?.holdExpiresAt || booking.amountPaid > 0) return undefined;
    return Math.max(0, Math.ceil((Date.parse(booking.holdExpiresAt) - this.now()) / 60_000));
  });

  protected readonly copied = signal<string | undefined>(undefined);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 15_000);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearInterval(timer));

    // Browser only: the server render never polls.
    afterNextRender(() => {
      const watch = setInterval(() => void this.checkForPayment(), WATCH_INTERVAL_MS);
      destroyRef.onDestroy(() => clearInterval(watch));
    });

    effect(() => {
      if (this.b()?.paymentOptions.deposit === null) this.option.set('full');
    });
  }

  protected async copy(label: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(label);
      setTimeout(() => this.copied.set(undefined), 2_000);
    } catch {
      // Clipboard blocked: the value is visible and selectable anyway.
    }
  }

  /** Moves on to the confirmation once the owner has recorded the money. */
  private async checkForPayment(): Promise<void> {
    const current = this.b();
    if (!current || document.hidden) return;
    try {
      const fresh = await this.bookings.get(current.reference);
      if (fresh.amountPaid > current.amountPaid) {
        void this.router.navigate(['/booking', fresh.reference, 'confirmation']);
      } else if (fresh.status !== current.status) {
        this.booking.reload();
      }
    } catch {
      // A missed check is retried on the next tick.
    }
  }
}
