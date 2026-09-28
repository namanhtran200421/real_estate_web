import { Component, inject, signal } from '@angular/core';
import { ApiError, fieldError, toApiError } from '../../../core/api';
import { AdminAuthService } from '../../admin-auth.service';

@Component({
  selector: 'app-admin-account',
  template: `
    <h1 class="text-4xl">Tài khoản</h1>
    <p class="mt-2 text-muted-foreground">{{ auth.admin()?.name }} · {{ auth.admin()?.email }}</p>

    <form class="card mt-8 max-w-lg space-y-6" (submit)="$event.preventDefault(); submit()">
      <h2 class="text-2xl">Đổi mật khẩu</h2>
      <div>
        <label class="label" for="current-password">Mật khẩu hiện tại</label>
        <input
          id="current-password"
          class="input"
          type="password"
          autocomplete="current-password"
          [value]="current()"
          (input)="current.set(value($event))"
        />
        @if (fieldError(error(), 'currentPassword'); as message) {
          <p class="mt-2 text-sm text-accent-deep">{{ message }}</p>
        }
      </div>
      <div>
        <label class="label" for="new-password">Mật khẩu mới (ít nhất 10 ký tự)</label>
        <input
          id="new-password"
          class="input"
          type="password"
          autocomplete="new-password"
          minlength="10"
          [value]="next()"
          (input)="next.set(value($event))"
        />
        @if (fieldError(error(), 'newPassword'); as message) {
          <p class="mt-2 text-sm text-accent-deep">{{ message }}</p>
        }
      </div>
      @if (done()) {
        <p class="text-sm text-accent-deep" role="status">Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.</p>
      }
      <button type="submit" class="btn btn-primary" [disabled]="busy() || !current() || next().length < 10">Đổi mật khẩu</button>
    </form>

    <button type="button" class="btn btn-outline mt-8" (click)="auth.logout()">Đăng xuất</button>
  `,
})
export class AdminAccount {
  protected readonly auth = inject(AdminAuthService);
  protected readonly fieldError = fieldError;

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<ApiError | undefined>(undefined);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    this.done.set(false);
    try {
      await this.auth.changePassword(this.current(), this.next());
      this.done.set(true);
      this.current.set('');
      this.next.set('');
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
