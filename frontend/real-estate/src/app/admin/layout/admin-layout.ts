import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAuthService } from '../admin-auth.service';

/** Frame of every signed-in admin page: navigation and the signed-in user. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
      <div class="container-editorial flex h-16 max-w-7xl items-center gap-6">
        <a routerLink="/admin" class="shrink-0 font-serif text-xl">Quản lý</a>
        <nav aria-label="Quản lý" class="-mx-2 flex min-w-0 flex-1 gap-1 overflow-x-auto px-2">
          @for (link of links; track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="bg-muted text-foreground"
              [routerLinkActiveOptions]="{ exact: link.path === '/admin' }"
              ariaCurrentWhenActive="page"
              class="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {{ link.label }}
            </a>
          }
        </nav>
        <div class="flex shrink-0 items-center gap-4 text-sm">
          <a routerLink="/" class="link-subtle">Xem website</a>
          <span class="hidden text-muted-foreground md:inline">{{ auth.admin()?.name }}</span>
          <button type="button" class="link hidden md:inline" (click)="auth.logout()">Đăng xuất</button>
        </div>
      </div>
    </header>

    <main class="container-editorial max-w-7xl pb-24 pt-10">
      <router-outlet />
    </main>
  `,
})
export class AdminLayout {
  protected readonly auth = inject(AdminAuthService);

  protected readonly links = [
    { label: 'Tổng quan', path: '/admin' },
    { label: 'Đặt phòng', path: '/admin/bookings' },
    { label: 'Lịch', path: '/admin/calendar' },
    { label: 'Căn hộ', path: '/admin/apartments' },
    { label: 'Ngày lễ', path: '/admin/holidays' },
    { label: 'Mã khuyến mãi', path: '/admin/promo-codes' },
    { label: 'Tin nhắn', path: '/admin/messages' },
    { label: 'Tài khoản', path: '/admin/account' },
  ];
}
