import { Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { BookingSteps } from '../../components/booking-steps/booking-steps';
import { BookingSummary } from '../../components/booking-summary/booking-summary';
import { SAMPLE_BOOKING, sampleQuote } from '../../data/booking.mock';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-booking-payment',
  imports: [DecimalPipe, RouterLink, ApartmentNotFound, BookingSteps, BookingSummary],
  templateUrl: './booking-payment.html',
})
export class BookingPayment {
  private readonly apartments = inject(ApartmentService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly booking = SAMPLE_BOOKING;
  protected readonly quote = computed(() => {
    const apt = this.apartment();
    return apt ? sampleQuote(apt.pricing) : undefined;
  });

  // Placeholder list; depends on the payment provider chosen later.
  protected readonly methods = [
    { id: 'qr', label: 'Chuyển khoản / quét mã QR', text: 'Quét mã bằng ứng dụng ngân hàng bất kỳ' },
    { id: 'card', label: 'Thẻ ngân hàng', text: 'Thẻ ATM nội địa hoặc thẻ quốc tế' },
    { id: 'wallet', label: 'Ví điện tử', text: 'Thanh toán qua ví điện tử' },
  ];
}
