import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { API_URL, ApiResponse, captchaHeaders } from '../core/api';
import { readJson, removeItem, writeJson } from '../services/browser-storage';

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

function storedSession(): AdminSession | undefined {
  const session = readJson<AdminSession>('local', STORAGE_KEY);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return undefined;
  return session;
}

/**
 * Owner/staff sign-in. The API issues a bearer token that expires after a few hours; it is
 * kept in this browser until then or until sign-out.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = `${inject(API_URL)}/api/v1/admin/auth`;
  private readonly session = signal<AdminSession | undefined>(storedSession());

  readonly admin = computed(() => this.session()?.admin);
  readonly signedIn = computed(() => this.session() !== undefined);

  token(): string | undefined {
    const session = this.session();
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return undefined;
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
    writeJson('local', STORAGE_KEY, response.data);
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

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/password`, { currentPassword, newPassword }));
  }

  /** Drops the local session (after logout or when the API says it expired). */
  forget(): void {
    this.session.set(undefined);
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
