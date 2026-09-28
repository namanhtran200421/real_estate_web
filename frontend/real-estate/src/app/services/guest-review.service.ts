import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL, ApiResponse } from '../core/api';
import { GuestReview } from '../models/guest-review';
import { BookingService } from './booking.service';

@Injectable({ providedIn: 'root' })
export class GuestReviewService {
  private readonly http = inject(HttpClient);
  private readonly bookings = inject(BookingService);
  private readonly api = `${inject(API_URL)}/api/v1`;

  listUrl(slug: string): string {
    return `${this.api}/apartments/${encodeURIComponent(slug)}/reviews`;
  }

  async forBooking(reference: string): Promise<GuestReview | null> {
    const response = await firstValueFrom(this.http.get<ApiResponse<GuestReview | null>>(
      `${this.api}/bookings/${encodeURIComponent(reference)}/review`,
      { headers: this.tokenHeaders(reference) },
    ));
    return response.data;
  }

  async submit(reference: string, rating: number, comment: string): Promise<GuestReview> {
    const response = await firstValueFrom(this.http.post<ApiResponse<GuestReview>>(
      `${this.api}/bookings/${encodeURIComponent(reference)}/review`,
      { rating, comment },
      { headers: this.tokenHeaders(reference) },
    ));
    return response.data;
  }

  private tokenHeaders(reference: string): HttpHeaders {
    const token = this.bookings.accessToken(reference);
    return token ? new HttpHeaders({ 'X-Booking-Token': token }) : new HttpHeaders();
  }
}
