import { Component, DestroyRef, computed, effect, inject, input, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { toApiError, userMessage } from '../../core/api';
import { PaymentOption, Stay } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingService } from '../../services/booking.service';

/**
 * Step 3: choose deposit or full payment, transfer with the VietQR code, then report it.
 * The owner checks the bank account and confirms; only then is the booking confirmed.
 */
@Component({
  selector: 'app-booking-payment',
  imports: [DatePipe, DecimalPipe, RouterLink, BookingSteps, BookingSummary],
  templateUrl: './booking-payment.html',
})
export class BookingPayment {
  private readonly bookings = inject(BookingService);
  private readonly apartments = inject(ApartmentService);
  private readonly router = inject(Router);

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
  protected readonly reporting = signal(false);
  protected readonly reportError = signal<string | undefined>(undefined);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

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

  /** "I have transferred": tells the owner to check, then shows the waiting page. */
  protected async report(): Promise<void> {
    const booking = this.b();
    const option = this.effectiveOption();
    if (!booking || !option) return;

    this.reporting.set(true);
    this.reportError.set(undefined);
    try {
      await this.bookings.reportTransfer(booking.reference, option);
      void this.router.navigate(['/booking', booking.reference, 'confirmation']);
    } catch (error) {
      this.reportError.set(userMessage(toApiError(error)));
      this.reporting.set(false);
      this.booking.reload();
    }
  }
}
