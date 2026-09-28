import { HttpErrorResponse, HttpHeaders, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { environment } from '../../environments/environment';
import { LANG } from '../i18n/i18n';
import { shortDate } from '../shared/dates';

/**
 * Base URL of the backend API. The browser uses the build-time value; the SSR server may
 * override it (see app.config.server.ts) to reach the API over a private network.
 */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});

/**
 * Server-only secret proving that a request comes from this site's renderer, so page
 * rendering is not rate limited like a single visitor. Empty in the browser.
 */
export const INTERNAL_API_KEY = new InjectionToken<string>('INTERNAL_API_KEY', {
  providedIn: 'root',
  factory: () => '',
});

/** Every API response wraps its payload as `{ data }`. */
export interface ApiResponse<T> {
  data: T;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Error body returned by the API: `{ error: { code, message, details? } }`. */
export interface ApiError {
  code: string;
  /** Written for end users, in Vietnamese; guest pages show it through ApiErrorMessages. */
  message: string;
  details?: { path: string; message: string }[];
}

const NETWORK_ERROR: ApiError = {
  code: 'NETWORK',
  message: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
};

const UNKNOWN_ERROR: ApiError = { code: 'UNKNOWN', message: 'Đã có lỗi xảy ra. Vui lòng thử lại.' };

/** Turns anything thrown by an API call into a message the page can show. */
export function toApiError(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) return UNKNOWN_ERROR;
  if (error.status === 0) return NETWORK_ERROR;
  const body = error.error?.error as ApiError | undefined;
  if (body?.message) return body;
  return UNKNOWN_ERROR;
}

/** Message for one form field from a validation error, if any (as the API wrote it). */
export function fieldError(error: ApiError | undefined, path: string): string | undefined {
  return error?.details?.find((detail) => detail.path === path)?.message;
}

/**
 * API errors as guest-facing text in the page's language. The API writes its messages in
 * Vietnamese, so Vietnamese pages show them as they are; English pages show the translation
 * for the error's code (src/i18n/en.json, "apiErrors").
 */
@Injectable({ providedIn: 'root' })
export class ApiErrorMessages {
  private readonly transloco = inject(TranslocoService);
  private readonly lang = inject(LANG);

  /** The error's own message. */
  message(error: ApiError): string {
    if (this.lang === 'vi') return error.message;
    return this.translate(`apiErrors.${error.code}`, 'apiErrors.UNKNOWN');
  }

  /**
   * The most helpful sentence for the guest: the specific reason for a validation error (e.g.
   * "Mỗi lần đặt tối đa 90 đêm.") and the taken dates for a booking conflict.
   */
  userMessage(error: ApiError): string {
    const detail = error.details?.[0];
    if (!detail) return this.message(error);
    if (error.code === 'VALIDATION_ERROR') return this.field(error, detail.path) ?? this.message(error);
    if (error.code === 'DATES_UNAVAILABLE') {
      const dates = detail.message.split(', ').map(shortDate).join(', ');
      return `${this.message(error)} ${this.transloco.translate('apiErrors.bookedDates', { dates })}`;
    }
    return this.message(error);
  }

  /** Message for one form field from a validation error, if any. */
  field(error: ApiError | undefined, path: string): string | undefined {
    const message = fieldError(error, path);
    if (!message || this.lang === 'vi') return message;
    // "customer.email" → apiErrors.fields.email
    return this.translate(`apiErrors.fields.${path.split('.').pop()}`, 'apiErrors.fields.other');
  }

  private translate(key: string, fallback: string): string {
    return this.transloco.translate(key in this.transloco.getTranslation(this.lang) ? key : fallback);
  }
}

/** The solved CAPTCHA for forms the API protects (see components/captcha). */
export function captchaHeaders(token: string | undefined): HttpHeaders {
  if (!token) return new HttpHeaders();
  return new HttpHeaders({ 'X-Captcha-Token': token });
}

/** Adds the renderer's key to API calls made during server-side rendering. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const key = inject(INTERNAL_API_KEY);
  if (key && req.url.startsWith(inject(API_URL))) {
    return next(req.clone({ setHeaders: { 'X-Internal-Key': key } }));
  }
  return next(req);
};
