import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { SAMPLE_BOOKING, sampleQuote } from '../../data/booking.mock';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-booking-lookup',
  imports: [DatePipe, DecimalPipe, NgOptimizedImage, RouterLink, StatusBadge],
  templateUrl: './booking-lookup.html',
})
export class BookingLookup {
  // Placeholder result. The real lookup will query the backend by reference + email/phone.
  protected readonly booking = SAMPLE_BOOKING;
  protected readonly apartment = inject(ApartmentService).resolve();
  protected readonly quote = computed(() =>
    this.apartment ? sampleQuote(this.apartment.pricing) : undefined,
  );
}
