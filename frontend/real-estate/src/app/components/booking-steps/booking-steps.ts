import { Component, input } from '@angular/core';

@Component({
  selector: 'app-booking-steps',
  templateUrl: './booking-steps.html',
})
export class BookingSteps {
  /** 1-based index of the active step. */
  readonly current = input.required<number>();

  protected readonly steps = ['Thông tin đặt phòng', 'Xem lại', 'Thanh toán', 'Trạng thái'];
}
