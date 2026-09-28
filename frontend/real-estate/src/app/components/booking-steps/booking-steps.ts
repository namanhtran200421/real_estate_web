import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-booking-steps',
  imports: [TranslocoPipe],
  templateUrl: './booking-steps.html',
})
export class BookingSteps {
  /** 1-based index of the active step. */
  readonly current = input.required<number>();

  /** Translation keys. */
  protected readonly steps = ['steps.details', 'steps.review', 'steps.payment', 'steps.status'];
}
