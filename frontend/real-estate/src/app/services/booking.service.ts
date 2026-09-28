import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL, ApiResponse } from '../core/api';
import { Booking, PaymentOption, Quote, TransferInstructions } from '../models/booking';
import { readJson, writeJson } from './browser-storage';

export interface StayRequest {
  apartmentSlug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  promoCode?: string;
}

export interface NewBooking extends StayRequest {
  customer: { name: string; phone: string; email: string };
  message?: string;
}

const TOKENS_KEY = 'booking-access-tokens';
/** Only the latest bookings are remembered on this device. */
const MAX_TOKENS = 10;

/**
 * Guest side of the booking API.
 *
 * Guests have no accounts: each booking comes with an access token, remembered in this
 * browser. On another device the guest looks the booking up with its reference and their
 * email or phone, which returns the token again.
 */
@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly api = `${inject(API_URL)}/api/v1`;

  /** URL for a price quote (used with httpResource so it reloads when the stay changes). */
  quoteUrl(stay: StayRequest): { url: string; params: HttpParams } {
    let params = new HttpParams()
      .set('checkIn', stay.checkIn)
      .set('checkOut', stay.checkOut)
      .set('guests', stay.guests);
    if (stay.promoCode) params = params.set('promoCode', stay.promoCode);
    return { url: `${this.api}/apartments/${encodeURIComponent(stay.apartmentSlug)}/quote`, params };
  }

  async quote(stay: StayRequest): Promise<Quote> {
    const { url, params } = this.quoteUrl(stay);
    const response = await firstValueFrom(this.http.get<ApiResponse<Quote>>(url, { params }));
    return response.data;
  }

  async create(booking: NewBooking): Promise<Booking> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<{ booking: Booking; accessToken: string }>>(`${this.api}/bookings`, booking),
    );
    this.rememberToken(response.data.booking.reference, response.data.accessToken);
    return response.data.booking;
  }

  async get(reference: string): Promise<Booking> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<Booking>>(`${this.api}/bookings/${encodeURIComponent(reference)}`, {
        headers: this.tokenHeaders(reference),
      }),
    );
    return response.data;
  }

  /** Finds a booking by reference + email or phone, and remembers its token on this device. */
  async lookup(reference: string, contact: string): Promise<Booking> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<{ booking: Booking; accessToken: string }>>(`${this.api}/bookings/lookup`, {
        reference,
        contact,
      }),
    );
    this.rememberToken(response.data.booking.reference, response.data.accessToken);
    return response.data.booking;
  }

  /** Bank account and VietQR code for paying `option` (deposit or full / remaining). */
  async transferInstructions(reference: string, option: PaymentOption): Promise<TransferInstructions> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<TransferInstructions>>(`${this.api}/bookings/${encodeURIComponent(reference)}/transfer`, {
        params: { option },
        headers: this.tokenHeaders(reference),
      }),
    );
    return response.data;
  }

  /** "I have transferred": the owner checks the account and confirms. Returns the updated booking. */
  async reportTransfer(reference: string, option: PaymentOption): Promise<Booking> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<Booking>>(
        `${this.api}/bookings/${encodeURIComponent(reference)}/transfer`,
        { option },
        { headers: this.tokenHeaders(reference) },
      ),
    );
    return response.data;
  }

  /** Whether this browser can open the booking without the lookup form. */
  hasAccess(reference: string): boolean {
    return this.tokens()[reference] !== undefined;
  }

  private tokens(): Record<string, string> {
    return readJson<Record<string, string>>('local', TOKENS_KEY) ?? {};
  }

  private rememberToken(reference: string, token: string): void {
    const entries = Object.entries(this.tokens()).filter(([ref]) => ref !== reference);
    entries.push([reference, token]);
    writeJson('local', TOKENS_KEY, Object.fromEntries(entries.slice(-MAX_TOKENS)));
  }

  private tokenHeaders(reference: string): HttpHeaders {
    const token = this.tokens()[reference];
    if (!token) return new HttpHeaders();
    return new HttpHeaders({ 'X-Booking-Token': token });
  }
}
