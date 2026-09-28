import { Component, computed, input } from '@angular/core';
import {
  BOOKING_STATUS_LABELS,
  BookingStatus,
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
} from '../../models/booking';

type Status = BookingStatus | PaymentStatus;

// Monochrome + gold only, per the design system: gold = in progress, dark = done, muted = closed.
const TONES: Record<Status, string> = {
  pending: 'border-accent bg-accent-muted text-accent-deep',
  confirmed: 'border-foreground bg-foreground text-background',
  cancelled: 'border-border bg-muted text-muted-foreground line-through',
  completed: 'border-border bg-muted text-muted-foreground',
  expired: 'border-border bg-muted text-muted-foreground line-through',
  unpaid: 'border-border bg-card text-muted-foreground',
  deposit_paid: 'border-accent bg-accent-muted text-accent-deep',
  fully_paid: 'border-foreground bg-foreground text-background',
  refunded: 'border-border bg-muted text-muted-foreground',
};

@Component({
  selector: 'app-status-badge',
  template: `<span class="small-caps inline-flex rounded-md border px-2.5 py-1 text-[0.625rem]" [class]="tone()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<Status>();

  protected readonly label = computed(() => {
    const s = this.status();
    return s in BOOKING_STATUS_LABELS
      ? BOOKING_STATUS_LABELS[s as BookingStatus]
      : PAYMENT_STATUS_LABELS[s as PaymentStatus];
  });
  protected readonly tone = computed(() => TONES[this.status()]);
}
