import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { environment } from '../../environments/environment';
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
  /** Written for end users, in Vietnamese; safe to show as-is. */
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

/**
 * The most helpful sentence for the guest: the specific reason for a validation error (e.g.
 * "Mỗi lần đặt tối đa 90 đêm.") and the taken dates for a booking conflict.
 */
export function userMessage(error: ApiError): string {
  const detail = error.details?.[0]?.message;
  if (!detail) return error.message;
  if (error.code === 'VALIDATION_ERROR') return detail;
  if (error.code === 'DATES_UNAVAILABLE') {
    const dates = detail.split(', ').map(shortDate).join(', ');
    return `${error.message} Ngày đã có người đặt: ${dates}.`;
  }
  return error.message;
}

/** Message for one form field from a validation error, if any. */
export function fieldError(error: ApiError | undefined, path: string): string | undefined {
  return error?.details?.find((detail) => detail.path === path)?.message;
}

/** Adds the renderer's key to API calls made during server-side rendering. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const key = inject(INTERNAL_API_KEY);
  if (key && req.url.startsWith(inject(API_URL))) {
    return next(req.clone({ setHeaders: { 'X-Internal-Key': key } }));
  }
  return next(req);
};
