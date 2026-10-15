import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { API_URL, ApiResponse, captchaHeaders } from '../core/api';
import { readJson, removeItem, writeJson } from '../services/browser-storage';
import type { AdminSessionInfo } from './admin.types';

export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
}

interface AdminSession {
  token: string;
  expiresAt: string;
  admin: AdminIdentity;
}

const STORAGE_KEY = 'admin-session';

/** Browser storage is attacker-controlled input, even though only this app normally writes it. */
export function isAdminSession(value: unknown, now = Date.now()): value is AdminSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<AdminSession>;
  const admin = session.admin as Partial<AdminIdentity> | undefined;
  const expiresAt =
    typeof session.expiresAt === 'string' ? Date.parse(session.expiresAt) : Number.NaN;
  return (
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    session.token.length <= 4096 &&
    typeof session.expiresAt === 'string' &&
    session.expiresAt.length <= 64 &&
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    !!admin &&
    typeof admin.id === 'string' &&
    admin.id.length <= 256 &&
    typeof admin.email === 'string' &&
    admin.email.length <= 254 &&
    typeof admin.name === 'string' &&
    admin.name.length <= 256
  );
}

export function loadStoredAdminSession(): AdminSession | undefined {
  const session = readJson<unknown>('session', STORAGE_KEY);
  if (isAdminSession(session)) {
    // Version migration cleanup: a privileged bearer token must not remain across browser restarts.
    removeItem('local', STORAGE_KEY);
    return session;
  }
  removeItem('session', STORAGE_KEY);

  // Migrate a still-valid pre-hardening session once, then delete the persistent copy.
  const legacy = readJson<unknown>('local', STORAGE_KEY);
  removeItem('local', STORAGE_KEY);
  if (!isAdminSession(legacy)) return undefined;
  writeJson('session', STORAGE_KEY, legacy);
  return legacy;
}

/**
 * Owner/staff sign-in. The API issues a bearer token that ends after a while without use or a
 * few hours in all; it is kept only for this browser tab. The API is the judge: any 401 drops the
 * local copy and returns to the sign-in page.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = `${inject(API_URL)}/api/v1/admin/auth`;
  private readonly session = signal<AdminSession | undefined>(loadStoredAdminSession());

  readonly admin = computed(() => this.session()?.admin);
  readonly signedIn = computed(() => this.session() !== undefined);

  token(): string | undefined {
    const session = this.session();
    if (!session) return undefined;
    if (Date.parse(session.expiresAt) <= Date.now()) {
      this.forget();
      return undefined;
    }
    return session.token;
  }

  async login(email: string, password: string, captchaToken?: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<AdminSession>>(
        `${this.api}/login`,
        { email, password },
        { headers: captchaHeaders(captchaToken) },
      ),
    );
    this.session.set(response.data);
    writeJson('session', STORAGE_KEY, response.data);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.api}/logout`, {}));
    } catch {
      // Already expired or offline: signing out locally is enough.
    }
    this.forget();
    void this.router.navigate(['/admin/login']);
  }

  /** Signs every other device out; the API emails the admin about the change. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/password`, { currentPassword, newPassword }));
  }

  /** Devices signed in to this account. */
  async sessions(): Promise<AdminSessionInfo[]> {
    const response = await firstValueFrom(this.http.get<ApiResponse<AdminSessionInfo[]>>(`${this.api}/sessions`));
    return response.data;
  }

  /** Signs one device out; signing out this device is logging out. */
  async revokeSession(session: AdminSessionInfo): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/sessions/${session.id}`));
    if (session.current) {
      this.forget();
      void this.router.navigate(['/admin/login']);
    }
  }

  async revokeOtherSessions(): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/sessions/revoke-others`, {}));
  }

  /** Drops the local session (after logout or when the API says it expired). */
  forget(): void {
    this.session.set(undefined);
    removeItem('session', STORAGE_KEY);
    // Also clear copies created by older releases.
    removeItem('local', STORAGE_KEY);
  }
}

/**
 * Adds the admin token to admin API calls; an expired session sends the user back to sign-in.
 * Only requests to this site's own API get it, so the token can never leak to another host.
 */
export const adminAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const adminApi = `${inject(API_URL)}/api/v1/admin/`;
  if (!req.url.startsWith(adminApi) || req.url.endsWith('/auth/login')) return next(req);

  const auth = inject(AdminAuthService);
  const router = inject(Router);
  const token = auth.token();
  let request = req;
  if (token) request = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.forget();
        void router.navigate(['/admin/login'], { queryParams: { next: router.url } });
      }
      return throwError(() => error);
    }),
  );
};

/** Route guard for the admin area. */
export const adminGuard: CanActivateFn = (_route, state) => {
  if (inject(AdminAuthService).signedIn()) return true;
  return inject(Router).createUrlTree(['/admin/login'], { queryParams: { next: state.url } });
};
