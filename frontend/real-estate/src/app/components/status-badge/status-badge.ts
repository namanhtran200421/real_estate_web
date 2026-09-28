import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { BookingStatus, PaymentStatus } from '../../models/booking';

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
  imports: [TranslocoPipe],
  template: `<span class="small-caps inline-flex rounded-md border px-2.5 py-1 text-[0.625rem]" [class]="tones[status()]">{{ 'status.' + status() | transloco }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<Status>();

  protected readonly tones = TONES;
}
