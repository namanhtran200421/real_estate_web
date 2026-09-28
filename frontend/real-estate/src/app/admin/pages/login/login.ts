import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CAPTCHA_ENABLED, Captcha } from '../../../components/captcha/captcha';
import { toApiError } from '../../../core/api';
import { AdminAuthService } from '../../admin-auth.service';

@Component({
  selector: 'app-admin-login',
  imports: [RouterLink, Captcha],
  template: `
    <section class="section">
      <div class="container-editorial max-w-md">
        <h1 class="text-center text-4xl">Đăng nhập quản lý</h1>
        <p class="mt-3 text-center text-sm">
          <a routerLink="/" class="link-subtle">← Về website</a>
        </p>
        <form class="card mt-10 space-y-6" (submit)="$event.preventDefault(); submit()">
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
          <button type="submit" class="btn btn-primary w-full" [disabled]="busy() || !email() || !password() || awaitingCaptcha()">
            Đăng nhập
          </button>
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
  protected readonly error = signal<string | undefined>(undefined);

  private readonly captcha = viewChild(Captcha);
  protected readonly captchaToken = signal('');
  protected readonly awaitingCaptcha = computed(() => CAPTCHA_ENABLED && !this.captchaToken());

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    try {
      await this.auth.login(this.email().trim(), this.password(), this.captchaToken());
      let target = '/admin';
      // Only follow in-app admin paths, never an arbitrary URL.
      const next = this.next();
      if (next?.startsWith('/admin') && !next.startsWith('/admin/login')) target = next;
      void this.router.navigateByUrl(target);
    } catch (error) {
      this.error.set(toApiError(error).message);
      this.password.set('');
      // Each CAPTCHA token works once; the next attempt needs a fresh one.
      this.captcha()?.reset();
    } finally {
      this.busy.set(false);
    }
  }
}
