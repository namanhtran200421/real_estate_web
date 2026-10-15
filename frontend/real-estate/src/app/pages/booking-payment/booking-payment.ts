import { Component, DestroyRef, afterNextRender, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { ApiErrorMessages, toApiError } from '../../core/api';
import { PaymentOption, Stay } from '../../models/booking';
import { ApartmentService } from '../../services/apartment.service';
import { BookingService } from '../../services/booking.service';
import { holdCountdown, todayIso } from '../../shared/dates';
import { SCREENSHOT_TYPES, ScreenshotError, ScreenshotProblem, prepareScreenshot } from '../../shared/transfer-screenshot';

/** While the guest is on the page, it checks this often whether the owner has confirmed. */
const WATCH_INTERVAL_MS = 20_000;

/** The screenshot the guest picked, ready to upload, with a local URL for its preview. */
interface PickedScreenshot {
  blob: Blob;
  previewUrl: string;
}

/**
 * Step 3: choose deposit or full payment, transfer with the VietQR code, then send the
 * screenshot of the successful transfer. The report holds the dates until the owner finds the
 * money in the bank app and confirms; the guest moves on to the status page.
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

  /**
   * The selected payable purpose, falling back to the first currently available option. Options
   * compare with `!= null`: an older API leaves `assetSecurity` and `incident` out.
   */
  private readonly effectiveOption = computed<PaymentOption | undefined>(() => {
    const options = this.b()?.paymentOptions;
    if (!options) return undefined;
    const selected = this.option();
    const amount =
      selected === 'asset_security'
        ? options.assetSecurity
        : selected === 'incident'
          ? options.incident
          : options[selected];
    if (amount != null) return selected;
    if (options.deposit != null) return 'deposit';
    if (options.full != null) return 'full';
    if (options.assetSecurity != null) return 'asset_security';
    if (options.incident != null) return 'incident';
    return undefined;
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

  /** Time left on the hold of an unpaid booking; undefined when nothing is counting down. */
  private readonly msLeft = computed(() => {
    const booking = this.b();
    if (!booking?.holdExpiresAt || booking.amountPaid > 0 || booking.pendingTransfer) return undefined;
    return Date.parse(booking.holdExpiresAt) - this.now();
  });

  protected readonly countdown = computed(() => {
    const ms = this.msLeft();
    if (ms === undefined) return undefined;
    return holdCountdown(ms);
  });

  /**
   * The hold ran out. The server's clock decides, not this device's: an unpaid booking it no
   * longer offers payment for has expired, even before the job releasing its dates has run.
   */
  protected readonly expired = computed(() => {
    const booking = this.b();
    if (!booking) return false;
    if (booking.status === 'expired') return true;
    const options = booking.paymentOptions;
    return (
      booking.status === 'pending' &&
      !booking.pendingTransfer &&
      options.deposit == null &&
      options.full == null &&
      options.assetSecurity == null &&
      options.incident == null
    );
  });

  /** Deposit-first and confirmed, with the rent not payable yet: nothing to pay today. */
  protected readonly rentLater = computed(() => {
    const booking = this.b();
    if (booking?.status !== 'confirmed' || !booking.depositFirst || !booking.rentDueFrom) return false;
    return booking.rentDueFrom > todayIso();
  });

  protected readonly copied = signal<string | undefined>(undefined);

  protected readonly acceptedTypes = SCREENSHOT_TYPES.join(',');
  protected readonly screenshot = signal<PickedScreenshot | undefined>(undefined);
  protected readonly preparing = signal(false);
  protected readonly dragging = signal(false);
  protected readonly screenshotProblem = signal<ScreenshotProblem | 'tooLarge' | undefined>(undefined);
  /** The screenshot check found no transfer in the picked image: choose another, or send it anyway. */
  protected readonly notATransfer = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | undefined>(undefined);

  /** The guest ticked "I have read and agree to the house rules & policies". */
  protected readonly acceptedPolicy = signal(false);

  protected readonly canSubmit = computed(
    () =>
      this.t() !== undefined &&
      this.screenshot() !== undefined &&
      this.acceptedPolicy() &&
      !this.preparing() &&
      !this.submitting(),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.releasePreview());

    // Browser only: the countdown ticks and the page watches for the owner's confirmation.
    afterNextRender(() => {
      const tick = setInterval(() => this.now.set(Date.now()), 1_000);
      const watch = setInterval(() => void this.checkForPayment(), WATCH_INTERVAL_MS);
      destroyRef.onDestroy(() => {
        clearInterval(tick);
        clearInterval(watch);
      });
    });

    effect(() => {
      const effective = this.effectiveOption();
      if (effective && effective !== this.option()) this.option.set(effective);
    });

    // The countdown reached zero on this device: ask the server whether the hold is really over.
    let checkedHold: string | undefined;
    effect(() => {
      const ms = this.msLeft();
      const hold = this.b()?.holdExpiresAt ?? undefined;
      if (ms === undefined || ms > 0 || hold === checkedHold) return;
      checkedHold = hold;
      untracked(() => this.booking.reload());
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

  protected picked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same file again still fires `change`.
    input.value = '';
    if (file) void this.useFile(file);
  }

  protected dragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected dropped(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) void this.useFile(file);
  }

  protected removeScreenshot(): void {
    this.releasePreview();
    this.screenshot.set(undefined);
    this.screenshotProblem.set(undefined);
    this.notATransfer.set(false);
  }

  /**
   * Sends the screenshot: the dates stay held until the owner checks, and the guest moves on.
   * @param sendAnyway after the warning that the image shows no transfer
   */
  protected async submit(sendAnyway = false): Promise<void> {
    const booking = this.b();
    const option = this.effectiveOption();
    const screenshot = this.screenshot();
    if (!booking || !option || !screenshot || !this.canSubmit()) return;

    this.submitting.set(true);
    this.submitError.set(undefined);
    try {
      const updated = await this.bookings.reportTransfer(booking.reference, option, screenshot.blob, sendAnyway, true);
      void this.router.navigate(['/booking', updated.reference, 'confirmation']);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'NOT_A_TRANSFER_SCREENSHOT') {
        this.notATransfer.set(true);
      } else if (apiError.code === 'PAYLOAD_TOO_LARGE') {
        this.screenshotProblem.set('tooLarge');
      } else {
        this.submitError.set(this.errorMessages.message(apiError));
      }
      // Already reported, or no longer payable: show where the booking stands now.
      if (apiError.code === 'TRANSFER_BEING_CHECKED' || apiError.code === 'BOOKING_NOT_PAYABLE') this.booking.reload();
    } finally {
      this.submitting.set(false);
    }
  }

  private async useFile(file: File): Promise<void> {
    this.screenshotProblem.set(undefined);
    this.submitError.set(undefined);
    this.notATransfer.set(false);
    this.preparing.set(true);
    try {
      const blob = await prepareScreenshot(file);
      this.releasePreview();
      this.screenshot.set({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (error) {
      this.screenshotProblem.set(error instanceof ScreenshotError ? error.problem : 'unreadable');
    } finally {
      this.preparing.set(false);
    }
  }

  private releasePreview(): void {
    const current = this.screenshot();
    if (current) URL.revokeObjectURL(current.previewUrl);
  }

  /**
   * Moves on to the confirmation once the owner has recorded the money, and keeps the page in step
   * with changes made elsewhere: a report sent from another tab, or rejected by the owner (which
   * brings a fresh hold and the upload box back).
   */
  private async checkForPayment(): Promise<void> {
    const current = this.b();
    if (!current || document.hidden || this.submitting()) return;
    try {
      const fresh = await this.bookings.get(current.reference);
      if (fresh.amountPaid > current.amountPaid || (current.status === 'pending' && fresh.status === 'confirmed')) {
        void this.router.navigate(['/booking', fresh.reference, 'confirmation']);
      } else if (
        fresh.status !== current.status ||
        fresh.holdExpiresAt !== current.holdExpiresAt ||
        fresh.pendingTransfer?.reportedAt !== current.pendingTransfer?.reportedAt ||
        fresh.paymentOptions.full !== current.paymentOptions.full ||
        (fresh.paymentOptions.assetSecurity ?? null) !== (current.paymentOptions.assetSecurity ?? null) ||
        (fresh.paymentOptions.incident ?? null) !== (current.paymentOptions.incident ?? null)
      ) {
        this.booking.set(fresh);
      }
    } catch {
      // A missed check is retried on the next tick.
    }
  }
}
