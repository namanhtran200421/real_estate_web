import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL, ApiResponse, captchaHeaders } from '../core/api';
import {
  Booking,
  GuestIdentity,
  PaymentOption,
  Quote,
  TransferInstructions,
} from '../models/booking';
import { readJson, removeItem, writeJson } from './browser-storage';

export interface StayRequest {
  apartmentSlug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  promoCode?: string;
}

export interface NewBooking extends StayRequest {
  customer: { name: string; phone: string; email: string };
  guestIdentities: GuestIdentity[];
  message?: string;
}

const TOKENS_KEY = 'booking-access-tokens';
/** Only the latest bookings are remembered on this device. */
const MAX_TOKENS = 10;

/**
 * Guest side of the booking API.
 *
 * Guests have no accounts: each booking comes with an access token, remembered in this
 * browser tab. On another device or after closing the tab, the guest looks the booking up with
 * its reference and their email or phone, which returns a fresh time-limited token.
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
    return {
      url: `${this.api}/apartments/${encodeURIComponent(stay.apartmentSlug)}/quote`,
      params,
    };
  }

  async quote(stay: StayRequest): Promise<Quote> {
    const { url, params } = this.quoteUrl(stay);
    const response = await firstValueFrom(this.http.get<ApiResponse<Quote>>(url, { params }));
    return response.data;
  }

  async create(booking: NewBooking, captchaToken?: string): Promise<Booking> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<{ booking: Booking; accessToken: string }>>(
        `${this.api}/bookings`,
        booking,
        {
          headers: captchaHeaders(captchaToken),
        },
      ),
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
  async lookup(reference: string, contact: string, captchaToken?: string): Promise<Booking> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<{ booking: Booking; accessToken: string }>>(
        `${this.api}/bookings/lookup`,
        { reference, contact },
        { headers: captchaHeaders(captchaToken) },
      ),
    );
    this.rememberToken(response.data.booking.reference, response.data.accessToken);
    return response.data.booking;
  }

  /** Bank account and VietQR code for paying `option` (deposit or full / remaining). */
  async transferInstructions(
    reference: string,
    option: PaymentOption,
  ): Promise<TransferInstructions> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<TransferInstructions>>(
        `${this.api}/bookings/${encodeURIComponent(reference)}/transfer`,
        {
          params: { option },
          headers: this.tokenHeaders(reference),
        },
      ),
    );
    return response.data;
  }

  /**
   * "I have transferred": reports the transfer of `option` with the guest's screenshot, which
   * holds the dates until the owner checks. Returns the updated booking.
   * @param sendAnyway the guest saw the "not a transfer screenshot" warning and sends it regardless
   */
  async reportTransfer(
    reference: string,
    option: PaymentOption,
    screenshot: Blob,
    sendAnyway = false,
    acceptPolicy = false,
  ): Promise<Booking> {
    let params = new HttpParams().set('option', option);
    if (acceptPolicy) params = params.set('acceptPolicy', 'true');
    if (sendAnyway) params = params.set('sendAnyway', 'true');
    const response = await firstValueFrom(
      this.http.post<ApiResponse<Booking>>(
        `${this.api}/bookings/${encodeURIComponent(reference)}/transfer`,
        screenshot,
        {
          params,
          headers: this.tokenHeaders(reference).set(
            'Content-Type',
            screenshot.type || 'application/octet-stream',
          ),
        },
      ),
    );
    return response.data;
  }

  /** The screenshot the guest sent with the transfer the owner is checking. */
  transferScreenshot(reference: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.api}/bookings/${encodeURIComponent(reference)}/transfer/screenshot`, {
        headers: this.tokenHeaders(reference),
        responseType: 'blob',
      }),
    );
  }

  /** Whether this browser can open the booking without the lookup form. */
  hasAccess(reference: string): boolean {
    return this.tokens()[reference] !== undefined;
  }

  /** Used by other guest-only booking actions, such as a verified stay review. */
  accessToken(reference: string): string | undefined {
    return this.tokens()[reference];
  }

  private tokens(): Record<string, string> {
    return loadBookingAccessTokens();
  }

  private rememberToken(reference: string, token: string): void {
    const entries = Object.entries(this.tokens()).filter(([ref]) => ref !== reference);
    entries.push([reference, token]);
    writeJson('session', TOKENS_KEY, Object.fromEntries(entries.slice(-MAX_TOKENS)));
  }

  private tokenHeaders(reference: string): HttpHeaders {
    const token = this.tokens()[reference];
    if (!token) return new HttpHeaders();
    return new HttpHeaders({ 'X-Booking-Token': token });
  }
}

/** Only accept the versioned, expiring token shape before using attacker-controlled storage. */
function liveAccessToken(value: unknown, now: number): value is string {
  if (typeof value !== 'string' || value.length > 256) return false;
  const match = /^v1\.([0-9a-z]{1,10})\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.exec(value);
  if (!match) return false;
  const expirySeconds = Number.parseInt(match[1], 36);
  return Number.isSafeInteger(expirySeconds) && expirySeconds > Math.floor(now / 1_000);
}

function sanitizedTokens(value: unknown, now: number): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([reference, token]) => reference.length <= 128 && liveAccessToken(token, now))
      .slice(-MAX_TOKENS),
  );
}

/**
 * Guest tokens contain private-booking authority. Keep them for this tab only and remove the
 * persistent copy created by older releases. A valid token found during rollout is migrated once.
 */
export function loadBookingAccessTokens(now = Date.now()): Record<string, string> {
  const legacy = sanitizedTokens(readJson<unknown>('local', TOKENS_KEY), now);
  const current = sanitizedTokens(readJson<unknown>('session', TOKENS_KEY), now);
  removeItem('local', TOKENS_KEY);

  const tokens = Object.fromEntries(Object.entries({ ...legacy, ...current }).slice(-MAX_TOKENS));
  if (Object.keys(tokens).length > 0) writeJson('session', TOKENS_KEY, tokens);
  else removeItem('session', TOKENS_KEY);
  return tokens;
}
