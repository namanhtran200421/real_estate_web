import { Component, DestroyRef, computed, effect, inject, input, resource, signal, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Select, SelectOption } from '../../../components/select/select';
import { StatusBadge } from '../../../components/status-badge/status-badge';
import { toApiError } from '../../../core/api';
import { NIGHT_RATE_LABELS, PAYMENT_PROVIDER_LABELS, PaymentPurpose } from '../../../models/booking';
import { AdminApiService } from '../../admin-api.service';
import { AdminBookingDetail, AdminPayment, BookingEvent } from '../../admin.types';
import { InspectionResult } from '../../inspection-checklist';

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
  asset_security: 'Tiền đặt cọc',
  incident: 'Bồi thường',
};

/** Today in the browser, "2026-10-14" (the owner works in Vietnam time). */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** One line of the check-out inspection while the owner fills it in. */
interface InspectionRow {
  item: string;
  ok: boolean;
  note: string;
}

interface InspectionRoomRows {
  room: string;
  rows: InspectionRow[];
}

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
    { value: 'asset_security', label: 'Tiền đặt cọc' },
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
  protected readonly inspectionRooms = signal<InspectionRoomRows[]>([]);
  protected readonly confirmingDepositRefund = signal(false);
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

  /** The inspection is done from check-in day on, while the stay is confirmed or after it. */
  protected readonly canInspect = computed(() => {
    const booking = this.b();
    if (!booking) return false;
    return (booking.status === 'confirmed' || booking.status === 'completed') && booking.checkIn <= todayIso();
  });

  protected readonly problemCount = computed(() =>
    this.inspectionRooms().reduce((count, room) => count + room.rows.filter((row) => !row.ok).length, 0),
  );

  /** Why "Hoàn cọc" cannot be pressed yet; undefined when it can. */
  protected readonly depositRefundBlocker = computed(() => {
    const booking = this.b();
    if (!booking) return undefined;
    if (booking.status !== 'completed') return 'Ghi nhận khách đã trả phòng trước.';
    if (!booking.inspection) return 'Lưu kết quả kiểm tra trả phòng trước.';
    if (booking.incidents.some((incident) => incident.status === 'open')) return 'Còn khoản hư hỏng chưa đóng.';
    if (booking.depositRefundable <= 0) return 'Không còn tiền cọc để hoàn.';
    return undefined;
  });

  /** The guests' transfer screenshots on this page, by payment id. */
  protected readonly screenshots = signal<Record<string, ScreenshotView>>({});

  constructor() {
    // The inspection rows start from the saved results (all OK before the first save); an unrelated
    // reload of the booking keeps what the owner is typing.
    let rowsKey: string | undefined;
    effect(() => {
      const booking = this.b();
      if (!booking) return;
      const key = `${booking.reference}|${booking.status}|${booking.inspection?.inspectedAt ?? ''}|${JSON.stringify(booking.checklist)}`;
      if (key === rowsKey) return;
      rowsKey = key;
      // A deposit-first booking waiting for money is paid with the deposit first.
      this.manualPurpose.set(booking.depositFirst && (booking.status === 'pending' || booking.status === 'expired') ? 'asset_security' : 'accommodation');
      const saved = booking.inspection?.results ?? [];
      this.inspectionRooms.set(
        booking.checklist.map((room) => ({
          room: room.room,
          rows: room.items.map((item) => {
            const result = saved.find((r) => r.room === room.room && r.item === item);
            return { item, ok: result?.ok ?? true, note: result?.note ?? '' };
          }),
        })),
      );
    });
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

  /** The transfer note the guest's banking app filled in: the reference without dashes ("TS" for a deposit). */
  protected transferNote(reference: string, purpose: PaymentPurpose = 'accommodation'): string {
    return `${reference.replaceAll('-', '')}${purpose === 'asset_security' ? 'TS' : ''}`;
  }

  protected setRowOk(roomIndex: number, rowIndex: number, ok: boolean): void {
    this.updateRow(roomIndex, rowIndex, { ok });
  }

  protected setRowNote(roomIndex: number, rowIndex: number, note: string): void {
    this.updateRow(roomIndex, rowIndex, { note });
  }

  private updateRow(roomIndex: number, rowIndex: number, change: Partial<InspectionRow>): void {
    this.inspectionRooms.update((rooms) =>
      rooms.map((room, i) =>
        i !== roomIndex ? room : { ...room, rows: room.rows.map((row, j) => (j === rowIndex ? { ...row, ...change } : row)) },
      ),
    );
  }

  protected saveInspection(): void {
    const results: InspectionResult[] = this.inspectionRooms().flatMap((room) =>
      room.rows.map((row) => ({ room: room.room, item: row.item, ok: row.ok, note: row.ok ? null : row.note.trim() || null })),
    );
    void this.run(() => this.api.saveInspection(this.reference(), results));
  }

  protected async refundDeposit(): Promise<void> {
    const done = await this.run(() => this.api.refundDeposit(this.reference()));
    if (done) this.confirmingDepositRefund.set(false);
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
