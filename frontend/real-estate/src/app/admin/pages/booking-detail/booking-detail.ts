import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StatusBadge } from '../../../components/status-badge/status-badge';
import { toApiError } from '../../../core/api';
import { NIGHT_RATE_LABELS, PAYMENT_PROVIDER_LABELS } from '../../../models/booking';
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
  refund_recorded: 'Ghi nhận hoàn tiền',
};

const PAYMENT_STATE_LABELS: Record<string, string> = {
  pending: 'Khách báo đã chuyển · chờ bạn kiểm tra',
  succeeded: 'Đã nhận',
  failed: 'Không nhận được',
};

@Component({
  selector: 'app-admin-booking-detail',
  imports: [DatePipe, DecimalPipe, RouterLink, StatusBadge],
  templateUrl: './booking-detail.html',
})
export class AdminBookingDetailPage {
  private readonly api = inject(AdminApiService);

  /** Bound from the `:reference` route param. */
  readonly reference = input.required<string>();

  protected readonly providerLabels = PAYMENT_PROVIDER_LABELS;
  protected readonly stateLabels = PAYMENT_STATE_LABELS;
  protected readonly rateLabels = NIGHT_RATE_LABELS;

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
  protected readonly manualAmount = signal<number | undefined>(undefined);
  protected readonly manualNote = signal('');
  protected readonly verifyAmount = signal<number | undefined>(undefined);
  protected readonly rejectingId = signal<string | undefined>(undefined);
  protected readonly rejectReason = signal('');
  protected readonly refundFor = signal<string | undefined>(undefined);
  protected readonly refundAmount = signal<number | undefined>(undefined);
  protected readonly refundReason = signal('');

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

  protected setManualMethod(event: Event): void {
    if (this.value(event) === 'bank_transfer') this.manualMethod.set('bank_transfer');
    else this.manualMethod.set('cash');
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

  protected complete(): void {
    void this.run(() => this.api.complete(this.reference()));
  }

  protected async cancel(): Promise<void> {
    const done = await this.run(() => this.api.cancel(this.reference(), this.cancelReason().trim()));
    if (done) this.cancelling.set(false);
  }

  protected async recordPayment(): Promise<void> {
    const amount = this.manualAmount() ?? this.b()?.amountDue;
    if (!amount) return;
    const done = await this.run(() =>
      this.api.recordPayment(this.reference(), {
        method: this.manualMethod(),
        amount,
        note: this.manualNote().trim() || undefined,
      }),
    );
    if (done) {
      this.manualAmount.set(undefined);
      this.manualNote.set('');
    }
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
