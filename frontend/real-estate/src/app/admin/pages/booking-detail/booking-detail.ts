import { Component, DestroyRef, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Select, SelectOption } from '../../../components/select/select';
import { StatusBadge } from '../../../components/status-badge/status-badge';
import { toApiError } from '../../../core/api';
import { NIGHT_RATE_LABELS, PAYMENT_PROVIDER_LABELS, PaymentPurpose } from '../../../models/booking';
import { AdminApiService } from '../../admin-api.service';
import { AdminBookingDetail, AdminPayment, BookingEvent } from '../../admin.types';

const EVENT_LABELS: Record<string, string> = {
  created: 'Khách tạo đặt phòng',
  transfer_reported: 'Khách báo đã chuyển khoản',
  transfer_verified: 'Xác nhận đã nhận tiền',
  transfer_rejected: 'Báo chưa nhận được tiền',
  payment_recorded: 'Ghi nhận thanh toán',
  confirmed: 'Xác nhận đặt phòng',
  cancelled: 'Huỷ đặt phòng',
  completed: 'Hoàn thành',
  expired: 'Hết hạn giữ chỗ',
  reactivated: 'Mở lại đặt phòng (tiền về sau khi hết hạn giữ chỗ)',
  refund_recorded: 'Ghi nhận hoàn tiền',
  checked_out: 'Ghi nhận khách đã trả phòng',
  asset_incident_recorded: 'Ghi nhận hư hỏng / thất lạc',
  asset_incident_settled: 'Đóng khoản bồi thường',
  asset_incident_waived: 'Miễn khoản bồi thường',
};

/** A guest's transfer screenshot on this page: being fetched, shown (as a local URL), or failed. */
type ScreenshotView = { state: 'loading' } | { state: 'shown'; url: string } | { state: 'failed' };

const PAYMENT_STATE_LABELS: Record<string, string> = {
  pending: 'Khách báo đã chuyển · chờ bạn kiểm tra',
  succeeded: 'Đã nhận',
  failed: 'Không nhận được',
};

const PAYMENT_PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  accommodation: 'Tiền phòng',
  asset_security: 'Bảo đảm tài sản',
  incident: 'Bồi thường',
};

interface PendingReceipt {
  amount: number;
  method: 'bank_transfer' | 'cash';
  purpose: PaymentPurpose;
  rest: boolean;
}

@Component({
  selector: 'app-admin-booking-detail',
  imports: [DatePipe, DecimalPipe, RouterLink, Select, StatusBadge],
  templateUrl: './booking-detail.html',
})
export class AdminBookingDetailPage {
  private readonly api = inject(AdminApiService);

  /** Bound from the `:reference` route param. */
  readonly reference = input.required<string>();

  protected readonly providerLabels = PAYMENT_PROVIDER_LABELS;
  protected readonly stateLabels = PAYMENT_STATE_LABELS;
  protected readonly rateLabels = NIGHT_RATE_LABELS;
  protected readonly purposeLabels = PAYMENT_PURPOSE_LABELS;
  protected readonly paymentMethodOptions: SelectOption[] = [
    { value: 'cash', label: 'Tiền mặt' },
    { value: 'bank_transfer', label: 'Chuyển khoản' },
  ];
  protected readonly paymentPurposeOptions: SelectOption[] = [
    { value: 'accommodation', label: 'Tiền phòng' },
    { value: 'asset_security', label: 'Bảo đảm tài sản' },
    { value: 'incident', label: 'Bồi thường' },
  ];

  protected readonly booking = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.api.booking(params),
  });

  protected readonly b = computed(() => {
    if (!this.booking.hasValue()) return undefined;
    return this.booking.value();
  });

  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  // Inline forms
  protected readonly cancelling = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly manualMethod = signal<'cash' | 'bank_transfer'>('cash');
  protected readonly manualPurpose = signal<PaymentPurpose>('accommodation');
  protected readonly manualAmount = signal<number | undefined>(undefined);
  protected readonly manualNote = signal('');
  protected readonly verifyAmount = signal<number | undefined>(undefined);
  protected readonly rejectingId = signal<string | undefined>(undefined);
  protected readonly rejectReason = signal('');
  protected readonly refundFor = signal<string | undefined>(undefined);
  protected readonly refundAmount = signal<number | undefined>(undefined);
  protected readonly refundReason = signal('');
  protected readonly pendingReceipt = signal<PendingReceipt | undefined>(undefined);
  protected readonly incidentDescription = signal('');
  protected readonly incidentAmount = signal<number | undefined>(undefined);
  protected readonly incidentSecurityApplied = signal(0);
  protected readonly pendingIncidentResolution = signal<{ id: string; status: 'settled' | 'waived' } | undefined>(undefined);
  protected readonly manualSuggestedAmount = computed(() => {
    const booking = this.b();
    if (!booking) return undefined;
    if (this.manualPurpose() === 'asset_security') return booking.financials.assetSecurityDue || undefined;
    if (this.manualPurpose() === 'incident') return booking.financials.incidentAmountDue || undefined;
    return booking.amountDue || undefined;
  });

  /** The guests' transfer screenshots on this page, by payment id. */
  protected readonly screenshots = signal<Record<string, ScreenshotView>>({});

  constructor() {
    // A transfer waiting to be checked shows its screenshot at once; older ones on request.
    effect(() => {
      for (const payment of this.b()?.payments ?? []) {
        if (payment.state === 'pending' && payment.hasScreenshot) untracked(() => void this.showScreenshot(payment.id));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      for (const view of Object.values(this.screenshots())) {
        if (view.state === 'shown') URL.revokeObjectURL(view.url);
      }
    });
  }

  protected async showScreenshot(paymentId: string): Promise<void> {
    const current = this.screenshots()[paymentId];
    if (current && current.state !== 'failed') return;
    this.setScreenshot(paymentId, { state: 'loading' });
    try {
      const url = URL.createObjectURL(await this.api.transferScreenshot(paymentId));
      this.setScreenshot(paymentId, { state: 'shown', url });
    } catch {
      this.setScreenshot(paymentId, { state: 'failed' });
    }
  }

  private setScreenshot(paymentId: string, view: ScreenshotView): void {
    this.screenshots.update((views) => ({ ...views, [paymentId]: view }));
  }

  protected eventLabel(type: string): string {
    return EVENT_LABELS[type] ?? type;
  }

  /** The parts of an event's data worth showing: amount, payment method, reason. */
  protected eventDetails(event: BookingEvent): { amount?: number; method?: string; reason?: string } {
    const { amount, provider, method, reason } = event.data;
    const details: { amount?: number; method?: string; reason?: string } = {};
    if (typeof amount === 'number') details.amount = amount;
    const payment = provider ?? method;
    if (typeof payment === 'string' && payment in PAYMENT_PROVIDER_LABELS) {
      details.method = PAYMENT_PROVIDER_LABELS[payment as keyof typeof PAYMENT_PROVIDER_LABELS];
    }
    if (typeof reason === 'string') details.reason = reason;
    return details;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected amountValue(event: Event): number | undefined {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.round(value);
  }

  /** Runs an action, then shows the updated booking (or the error). */
  private async run(action: () => Promise<AdminBookingDetail | void>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      const updated = await action();
      if (updated) this.booking.set(updated);
      else this.booking.reload();
      return true;
    } catch (error) {
      this.error.set(toApiError(error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected confirm(): void {
    void this.run(() => this.api.confirm(this.reference()));
  }

  protected checkOut(): void {
    void this.run(() => this.api.checkOut(this.reference()));
  }

  protected async cancel(): Promise<void> {
    const done = await this.run(() => this.api.cancel(this.reference(), this.cancelReason().trim()));
    if (done) this.cancelling.set(false);
  }

  /** The transfer note the guest's banking app filled in: the reference without dashes. */
  protected transferNote(reference: string): string {
    return reference.replaceAll('-', '');
  }

  /**
   * Money arrived: records it. The first payment confirms the booking; the rest (usually at
   * check-in) makes it fully paid. The guest is emailed either way.
   */
  protected received(
    amount: number,
    method: 'bank_transfer' | 'cash' = 'bank_transfer',
    rest = false,
    purpose: PaymentPurpose = 'accommodation',
  ): void {
    this.pendingReceipt.set({ amount, method, rest, purpose });
  }

  protected async confirmReceipt(): Promise<void> {
    const receipt = this.pendingReceipt();
    if (!receipt) return;
    const reference = this.reference();
    let note = receipt.method === 'cash' ? 'Tiền mặt' : `Chuyển khoản ${this.transferNote(reference)}`;
    if (receipt.rest) note += ', phần còn lại';
    const done = await this.run(() =>
      this.api.recordPayment(reference, {
        method: receipt.method,
        purpose: receipt.purpose,
        amount: receipt.amount,
        note,
      }),
    );
    if (done) this.pendingReceipt.set(undefined);
  }

  protected async recordPayment(): Promise<void> {
    const amount = this.manualAmount() ?? this.manualSuggestedAmount();
    if (!amount) return;
    const done = await this.run(() =>
      this.api.recordPayment(this.reference(), {
        method: this.manualMethod(),
        purpose: this.manualPurpose(),
        amount,
        note: this.manualNote().trim() || undefined,
      }),
    );
    if (done) {
      this.manualAmount.set(undefined);
      this.manualNote.set('');
    }
  }

  protected async addIncident(): Promise<void> {
    const amount = this.incidentAmount();
    if (!amount || !this.incidentDescription().trim()) return;
    const done = await this.run(() =>
      this.api.addIncident(this.reference(), {
        description: this.incidentDescription().trim(),
        amount,
        securityApplied: this.incidentSecurityApplied(),
      }),
    );
    if (done) {
      this.incidentDescription.set('');
      this.incidentAmount.set(undefined);
      this.incidentSecurityApplied.set(0);
    }
  }

  protected requestIncidentResolution(incidentId: string, status: 'settled' | 'waived'): void {
    this.pendingIncidentResolution.set({ id: incidentId, status });
  }

  protected async confirmIncidentResolution(): Promise<void> {
    const resolution = this.pendingIncidentResolution();
    if (!resolution) return;
    const done = await this.run(() => this.api.resolveIncident(this.reference(), resolution.id, resolution.status));
    if (done) this.pendingIncidentResolution.set(undefined);
  }

  protected startRefund(payment: AdminPayment): void {
    this.refundFor.set(payment.id);
    this.refundAmount.set(payment.refundable);
    this.refundReason.set('');
  }

  protected async refund(payment: AdminPayment): Promise<void> {
    const amount = this.refundAmount();
    if (!amount) return;
    const done = await this.run(() => this.api.refund(payment.id, amount, this.refundReason().trim()));
    if (done) this.refundFor.set(undefined);
  }

  /** The transfer is in the bank account: the booking gets confirmed and the guest emailed. */
  protected async verify(payment: AdminPayment): Promise<void> {
    const done = await this.run(() => this.api.verifyTransfer(payment.id, this.verifyAmount()));
    if (done) this.verifyAmount.set(undefined);
  }

  protected startReject(payment: AdminPayment): void {
    this.rejectingId.set(payment.id);
    this.rejectReason.set('Chưa thấy khoản chuyển trong tài khoản');
  }

  protected async reject(payment: AdminPayment): Promise<void> {
    const done = await this.run(() => this.api.rejectTransfer(payment.id, this.rejectReason().trim()));
    if (done) this.rejectingId.set(undefined);
  }
}
