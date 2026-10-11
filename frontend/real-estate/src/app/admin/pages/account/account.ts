import { Component, computed, inject, resource, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiError, fieldError, toApiError } from '../../../core/api';
import { AdminAuthService } from '../../admin-auth.service';
import { AdminSessionInfo } from '../../admin.types';

/** Must match the API (backend/src/modules/admin-auth/password.ts); the API has the final say. */
const MIN_LENGTH = 12;

/** "Chrome · macOS" from a user agent; good enough to recognise one's own devices. */
function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Thiết bị không rõ';
  const browser =
    [
      ['Edg/', 'Edge'],
      ['OPR/', 'Opera'],
      ['Firefox/', 'Firefox'],
      ['CriOS/', 'Chrome'],
      ['Chrome/', 'Chrome'],
      ['Safari/', 'Safari'],
    ].find(([token]) => userAgent.includes(token!))?.[1] ?? 'Trình duyệt';
  const system =
    [
      ['iPhone', 'iPhone'],
      ['iPad', 'iPad'],
      ['Android', 'Android'],
      ['Mac OS X', 'macOS'],
      ['Windows', 'Windows'],
      ['Linux', 'Linux'],
    ].find(([token]) => userAgent.includes(token!))?.[1] ?? '';
  return system ? `${browser} · ${system}` : browser;
}

@Component({
  selector: 'app-admin-account',
  imports: [DatePipe],
  template: `
    <header>
      <p class="small-caps text-accent-deep">Tài khoản</p>
      <h1 class="mt-2 text-4xl">{{ auth.admin()?.name }}</h1>
      <p class="mt-2 text-muted-foreground">{{ auth.admin()?.email }}</p>
    </header>

    <div class="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
      <!-- Change password -->
      <form class="card space-y-5" (submit)="$event.preventDefault(); submit()" novalidate>
        <div>
          <h2 class="text-2xl">Đổi mật khẩu</h2>
          <p class="mt-1 text-sm text-muted-foreground">Sau khi đổi, mọi thiết bị khác sẽ bị đăng xuất và bạn nhận email thông báo.</p>
        </div>

        <div>
          <label class="label" for="current-password">Mật khẩu hiện tại</label>
          <input
            id="current-password"
            class="input"
            [type]="show() ? 'text' : 'password'"
            autocomplete="current-password"
            maxlength="200"
            [value]="current()"
            (input)="current.set(value($event))"
            [attr.aria-invalid]="!!fieldError(error(), 'currentPassword')"
            aria-describedby="current-password-error"
          />
          @if (fieldError(error(), 'currentPassword'); as message) {
            <p id="current-password-error" class="mt-2 text-sm text-accent-deep">{{ message }}</p>
          }
        </div>

        <div>
          <label class="label" for="new-password">Mật khẩu mới</label>
          <input
            id="new-password"
            class="input"
            [type]="show() ? 'text' : 'password'"
            autocomplete="new-password"
            maxlength="200"
            [value]="next()"
            (input)="next.set(value($event))"
            [attr.aria-invalid]="!!fieldError(error(), 'newPassword')"
            aria-describedby="password-rules new-password-error"
          />
          @if (fieldError(error(), 'newPassword'); as message) {
            <p id="new-password-error" class="mt-2 text-sm text-accent-deep">{{ message }}</p>
          }
        </div>

        <div>
          <label class="label" for="confirm-password">Nhập lại mật khẩu mới</label>
          <input
            id="confirm-password"
            class="input"
            [type]="show() ? 'text' : 'password'"
            autocomplete="new-password"
            maxlength="200"
            [value]="confirmation()"
            (input)="confirmation.set(value($event))"
          />
        </div>

        <ul id="password-rules" class="space-y-1.5 text-sm" aria-label="Yêu cầu mật khẩu">
          @for (rule of rules(); track rule.label) {
            <li class="flex items-center gap-2" [class.text-muted-foreground]="!rule.ok">
              <span
                class="grid h-4 w-4 place-items-center rounded-full text-[10px]"
                [class.bg-accent-deep]="rule.ok"
                [class.text-white]="rule.ok"
                [class.border]="!rule.ok"
                [class.border-border-hover]="!rule.ok"
                aria-hidden="true"
                >{{ rule.ok ? '✓' : '' }}</span
              >
              {{ rule.label }}<span class="sr-only">{{ rule.ok ? ': đạt' : ': chưa đạt' }}</span>
            </li>
          }
          <li class="text-muted-foreground">Mẹo: một câu dài dễ nhớ an toàn hơn một từ ngắn có ký tự lạ.</li>
        </ul>

        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="h-4 w-4 accent-accent-deep" [checked]="show()" (change)="show.set(!show())" />
          Hiện mật khẩu
        </label>

        @if (done()) {
          <p class="rounded-md border border-accent bg-accent-muted p-3 text-sm" role="status">
            Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.
          </p>
        }
        @if (error() && !fieldError(error(), 'currentPassword') && !fieldError(error(), 'newPassword')) {
          <p class="text-sm text-accent-deep" role="alert">{{ error()!.message }}</p>
        }

        <button type="submit" class="btn btn-primary" [disabled]="busy() || !canSubmit()">
          {{ busy() ? 'Đang đổi…' : 'Đổi mật khẩu' }}
        </button>
      </form>

      <!-- Signed-in devices -->
      <section class="card" aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" class="text-2xl">Thiết bị đang đăng nhập</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Đăng nhập tự kết thúc khi không dùng một thời gian. Thấy thiết bị lạ? Đăng xuất thiết bị đó và đổi mật khẩu.
        </p>

        @if (sessions.hasValue()) {
          <ul class="mt-6 divide-y divide-border border-y border-border">
            @for (session of sessions.value(); track session.id) {
              <li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">
                    {{ device(session.userAgent) }}
                    @if (session.current) {
                      <span class="ml-2 rounded-full bg-accent-muted px-2 py-0.5 text-xs font-normal text-accent-deep">Thiết bị này</span>
                    }
                  </p>
                  <p class="mt-0.5 text-sm text-muted-foreground">
                    IP {{ session.ip ?? 'không rõ' }} · hoạt động {{ session.lastSeenAt | date: 'HH:mm dd/MM' }} · đăng nhập
                    {{ session.createdAt | date: 'HH:mm dd/MM' }}
                  </p>
                </div>
                @if (!session.current) {
                  <button type="button" class="btn btn-ghost" [disabled]="sessionBusy()" (click)="revoke(session)">Đăng xuất</button>
                }
              </li>
            }
          </ul>
          @if (sessions.value().length > 1) {
            <button type="button" class="btn btn-outline mt-6" [disabled]="sessionBusy()" (click)="revokeOthers()">
              Đăng xuất tất cả thiết bị khác
            </button>
          }
        } @else if (sessions.error()) {
          <p class="mt-6 text-sm text-accent-deep" role="alert">
            Không tải được danh sách thiết bị.
            <button type="button" class="link" (click)="sessions.reload()">Thử lại</button>
          </p>
        } @else {
          <p class="mt-6 text-sm text-muted-foreground" role="status">Đang tải…</p>
        }
        @if (sessionError(); as message) {
          <p class="mt-4 text-sm text-accent-deep" role="alert">{{ message }}</p>
        }

        <hr class="my-6" />
        <button type="button" class="btn btn-ghost -ml-3" (click)="auth.logout()">Đăng xuất khỏi thiết bị này</button>
      </section>
    </div>
  `,
})
export class AdminAccount {
  protected readonly auth = inject(AdminAuthService);
  protected readonly fieldError = fieldError;
  protected readonly device = deviceName;

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly confirmation = signal('');
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<ApiError | undefined>(undefined);

  protected readonly sessions = resource({ loader: () => this.auth.sessions() });
  protected readonly sessionBusy = signal(false);
  protected readonly sessionError = signal<string | undefined>(undefined);

  /** What the form can check before sending; the API also rejects common and guessable passwords. */
  protected readonly rules = computed(() => {
    const password = this.next();
    const name = (this.auth.admin()?.email ?? '').split('@')[0]!.toLowerCase();
    return [
      { label: `Ít nhất ${MIN_LENGTH} ký tự`, ok: password.length >= MIN_LENGTH },
      { label: 'Không chứa tên email', ok: password.length > 0 && !(name.length >= 4 && password.toLowerCase().includes(name)) },
      { label: 'Khác mật khẩu hiện tại', ok: password.length > 0 && password !== this.current() },
      { label: 'Nhập lại khớp', ok: password.length > 0 && password === this.confirmation() },
    ];
  });

  protected readonly canSubmit = computed(() => this.current().length > 0 && this.rules().every((rule) => rule.ok));

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(undefined);
    this.done.set(false);
    try {
      await this.auth.changePassword(this.current(), this.next());
      this.done.set(true);
      this.current.set('');
      this.next.set('');
      this.confirmation.set('');
      this.show.set(false);
      this.sessions.reload();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(session: AdminSessionInfo): Promise<void> {
    await this.runSessionAction(() => this.auth.revokeSession(session));
  }

  protected async revokeOthers(): Promise<void> {
    if (!confirm('Đăng xuất tất cả thiết bị khác?')) return;
    await this.runSessionAction(() => this.auth.revokeOtherSessions());
  }

  private async runSessionAction(action: () => Promise<void>): Promise<void> {
    this.sessionBusy.set(true);
    this.sessionError.set(undefined);
    try {
      await action();
      this.sessions.reload();
    } catch (error) {
      this.sessionError.set(toApiError(error).message);
    } finally {
      this.sessionBusy.set(false);
    }
  }
}
