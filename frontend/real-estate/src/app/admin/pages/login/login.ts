import { Component, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { CAPTCHA_ENABLED, Captcha } from '../../../components/captcha/captcha';
import { toApiError } from '../../../core/api';
import { AdminAuthService } from '../../admin-auth.service';

/**
 * Accepts only this app's owner area as a post-login destination. Treat the query parameter as
 * hostile input: encoded separators, backslashes and look-alike prefixes do not qualify.
 */
export function adminReturnUrl(next?: string): string {
  if (!next || /[\\\u0000-\u001f\u007f]/.test(next)) return '/admin';
  if (!/^\/admin(?:[/?#]|$)/.test(next) || /^\/admin\/login(?:[/?#;]|$)/.test(next))
    return '/admin';
  return next;
}

@Component({
  selector: 'app-admin-login',
  styleUrl: '../../admin-theme.css',
  imports: [RouterLink, Captcha],
  template: `
    <section class="section">
      <div class="container-editorial max-w-md">
        <h1 class="text-center text-4xl">Đăng nhập quản lý</h1>
        <p class="mt-3 text-center text-sm">
          <a routerLink="/" class="link-subtle">← Về website</a>
        </p>
        <form class="card mt-10 space-y-6" novalidate (submit)="$event.preventDefault(); submit()">
          <div>
            <label class="label" for="admin-email">Email</label>
            <input
              id="admin-email"
              class="input"
              type="email"
              autocomplete="username"
              required
              [value]="email()"
              (input)="email.set(value($event))"
            />
          </div>
          <div>
            <label class="label" for="admin-password">Mật khẩu</label>
            <input
              id="admin-password"
              class="input"
              type="password"
              autocomplete="current-password"
              required
              [value]="password()"
              (input)="password.set(value($event))"
            />
          </div>
          <app-captcha action="admin-login" (token)="captchaToken.set($event)" />
          @if (error(); as message) {
            <p class="text-sm text-accent-deep" role="alert">{{ message }}</p>
          }
          <button type="submit" class="btn btn-primary w-full" [attr.aria-busy]="busy()" [disabled]="busy() || !email() || !password() || awaitingCaptcha()">
            {{ busy() ? (opening() ? 'Đang mở trang quản lý…' : 'Đang đăng nhập…') : 'Đăng nhập' }}
          </button>
          <p class="min-h-5 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
            @if (busy()) { Vui lòng chờ trong giây lát. }
            @else if (awaitingCaptcha() && !captchaFailed()) { Đang xác minh bảo mật… }
          </p>
        </form>
      </div>
    </section>
  `,
})
export class AdminLogin {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  /** Bound from `?next=`: where to go after signing in. */
  readonly next = input<string>();

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly opening = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  private readonly captcha = viewChild(Captcha);
  protected readonly captchaToken = signal('');
  protected readonly awaitingCaptcha = computed(() => CAPTCHA_ENABLED && !this.captchaToken());
  protected readonly captchaFailed = computed(() => this.captcha()?.hasFailed() ?? false);

  constructor() {
    afterNextRender(() => {
      void this.auth.prepareLogin();
      // Fetch code, without instantiating protected pages or requesting private data.
      // This overlaps the time spent entering credentials and solving CAPTCHA.
      void Promise.allSettled([
        import('../../layout/admin-layout'),
        import('../dashboard/dashboard'),
      ]);
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async submit(): Promise<void> {
    if (this.busy() || this.awaitingCaptcha()) return;
    if (!this.email().trim() || !this.password()) {
      this.error.set('Vui lòng nhập email và mật khẩu.');
      return;
    }
    this.busy.set(true);
    this.opening.set(false);
    this.error.set(undefined);
    try {
      await this.auth.login(this.email().trim(), this.password(), this.captchaToken());
      this.opening.set(true);
      await this.router.navigateByUrl(adminReturnUrl(this.next()));
    } catch (error) {
      this.error.set(toApiError(error).message);
      if (error instanceof HttpErrorResponse && error.status === 401) this.password.set('');
      // Each CAPTCHA token works once; the next attempt needs a fresh one.
      this.captcha()?.reset();
    } finally {
      this.busy.set(false);
    }
  }
}
