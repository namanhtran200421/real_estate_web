import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, map } from 'rxjs';
import { API_URL, ApiResponse, Page } from '../core/api';
import {
  AdminApartment,
  AdminBookingDetail,
  AdminBookingListItem,
  AdminSummary,
  ApartmentInput,
  BlockedDate,
  BookingFilters,
  ContactMessage,
  Holiday,
  PromoCode,
  PromoCodeInput,
} from './admin.types';

/** Every admin endpoint (the auth interceptor adds the bearer token). */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly publicApi = `${inject(API_URL)}/api/v1`;
  private readonly api = `${this.publicApi}/admin`;

  private get<T>(path: string, params?: HttpParams): Promise<T> {
    return this.unwrap(this.http.get<ApiResponse<T>>(`${this.api}${path}`, { params }));
  }

  private send<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
    return this.unwrap(this.http.request<ApiResponse<T>>(method, `${this.api}${path}`, { body }));
  }

  private async sendNoContent(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<void> {
    await firstValueFrom(this.http.request(method, `${this.api}${path}`, { body }));
  }

  private unwrap<T>(request: Observable<ApiResponse<T>>): Promise<T> {
    return firstValueFrom(request.pipe(map((response) => response.data)));
  }

  private params(values: Record<string, string | number | undefined>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== '') params = params.set(key, value);
    }
    return params;
  }

  // Dashboard and bookings

  summary(): Promise<AdminSummary> {
    return this.get('/summary');
  }

  bookings(filters: BookingFilters): Promise<Page<AdminBookingListItem>> {
    return this.get('/bookings', this.params({ ...filters }));
  }

  booking(reference: string): Promise<AdminBookingDetail> {
    return this.get(`/bookings/${encodeURIComponent(reference)}`);
  }

  confirm(reference: string): Promise<AdminBookingDetail> {
    return this.send('POST', `/bookings/${encodeURIComponent(reference)}/confirm`, {});
  }

  cancel(reference: string, reason: string): Promise<AdminBookingDetail> {
    return this.send('POST', `/bookings/${encodeURIComponent(reference)}/cancel`, { reason });
  }

  complete(reference: string): Promise<AdminBookingDetail> {
    return this.send('POST', `/bookings/${encodeURIComponent(reference)}/complete`, {});
  }

  recordPayment(
    reference: string,
    payment: { method: 'cash' | 'bank_transfer'; amount: number; note?: string },
  ): Promise<AdminBookingDetail> {
    return this.send('POST', `/bookings/${encodeURIComponent(reference)}/payments`, payment);
  }

  /** The reported transfer is in the bank account: counts the money and confirms the booking. */
  verifyTransfer(paymentId: string, amount?: number): Promise<void> {
    return this.sendNoContent('POST', `/payments/${paymentId}/verify`, { amount });
  }

  /** The reported transfer never arrived. */
  rejectTransfer(paymentId: string, reason: string): Promise<void> {
    return this.sendNoContent('POST', `/payments/${paymentId}/reject`, { reason });
  }

  /** Records money given back to the guest (the owner makes the transfer). */
  refund(paymentId: string, amount: number, reason: string): Promise<void> {
    return this.sendNoContent('POST', `/payments/${paymentId}/refunds`, { amount, reason });
  }

  // Apartments and calendar

  apartments(): Promise<AdminApartment[]> {
    return this.get('/apartments');
  }

  apartment(slug: string): Promise<AdminApartment> {
    return this.get(`/apartments/${encodeURIComponent(slug)}`);
  }

  createApartment(input: ApartmentInput): Promise<AdminApartment> {
    return this.send('POST', '/apartments', input);
  }

  updateApartment(slug: string, input: ApartmentInput): Promise<AdminApartment> {
    return this.send('PUT', `/apartments/${encodeURIComponent(slug)}`, input);
  }

  /** Dates guests cannot book (bookings + blocks), fresh from the public endpoint. */
  async unavailableDates(slug: string): Promise<string[]> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<{ unavailableDates: string[] }>>(`${this.publicApi}/apartments/${encodeURIComponent(slug)}`),
    );
    return response.data.unavailableDates;
  }

  blockedDates(slug: string, from: string, to: string): Promise<BlockedDate[]> {
    return this.get(`/apartments/${encodeURIComponent(slug)}/blocked-dates`, this.params({ from, to }));
  }

  blockDates(slug: string, dates: string[], reason?: string): Promise<void> {
    return this.sendNoContent('POST', `/apartments/${encodeURIComponent(slug)}/blocked-dates`, { dates, reason });
  }

  unblockDates(slug: string, dates: string[]): Promise<void> {
    return this.sendNoContent('DELETE', `/apartments/${encodeURIComponent(slug)}/blocked-dates`, { dates });
  }

  // Holidays, promo codes, messages

  holidays(year: number): Promise<Holiday[]> {
    return this.get('/holidays', this.params({ year }));
  }

  saveHoliday(holiday: Holiday): Promise<Holiday> {
    return this.send('PUT', '/holidays', holiday);
  }

  removeHoliday(date: string): Promise<void> {
    return this.sendNoContent('DELETE', `/holidays/${date}`);
  }

  promoCodes(): Promise<PromoCode[]> {
    return this.get('/promo-codes');
  }

  createPromoCode(input: PromoCodeInput): Promise<PromoCode> {
    return this.send('POST', '/promo-codes', input);
  }

  updatePromoCode(code: string, input: Omit<PromoCodeInput, 'code'>): Promise<PromoCode> {
    return this.send('PUT', `/promo-codes/${encodeURIComponent(code)}`, input);
  }

  messages(unhandledOnly: boolean, page: number): Promise<Page<ContactMessage>> {
    return this.get('/contact-messages', this.params({ unhandled: String(unhandledOnly), page, pageSize: 20 }));
  }

  setMessageHandled(id: string, handled: boolean): Promise<void> {
    return this.sendNoContent('PUT', `/contact-messages/${id}/handled`, { handled });
  }
}
