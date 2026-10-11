import { Component, DestroyRef, computed, inject, resource, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AdminApiService } from '../admin-api.service';
import { AdminAuthService } from '../admin-auth.service';

/** 24×24 stroke icons (one path each), drawn in currentColor. */
const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  bookings: 'M9 3h6v3H9zM8 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2M9 14l2 2 4-4',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  messages: 'M4 5h16v11H9l-5 4z',
  apartments: 'M4 21V6l8-3 8 3v15M3 21h18M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4',
  holidays: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z',
  promo: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  website: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

type IconName = keyof typeof ICONS;

interface NavLink {
  label: string;
  path: string;
  icon: IconName;
  badge?: 'bookings' | 'messages';
}

/**
 * Frame of every signed-in admin page: a sidebar on large screens, a menu button on phones.
 * Counts of what needs the owner (money to look for, messages to answer) ride the navigation and
 * refresh on every page change.
 */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <!-- Phone: top bar with the menu button -->
      <header class="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-md lg:hidden">
        <a routerLink="/admin" class="font-serif text-lg">Quản lý</a>
        <button
          type="button"
          class="relative grid h-10 w-10 place-items-center rounded-md hover:bg-muted"
          aria-controls="admin-nav"
          [attr.aria-expanded]="menuOpen()"
          [attr.aria-label]="menuOpen() ? 'Đóng menu' : 'Mở menu'"
          (click)="menuOpen.update((open) => !open)"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path [attr.d]="icons[menuOpen() ? 'close' : 'menu']" />
          </svg>
          @if (!menuOpen() && attention() > 0) {
            <span class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-deep" aria-hidden="true"></span>
          }
        </button>
      </header>

      <aside
        id="admin-nav"
        class="fixed inset-x-0 bottom-0 top-14 z-30 overflow-y-auto border-border bg-background lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-screen lg:flex-col lg:border-r"
        [class.hidden]="!menuOpen()"
        [class.flex]="menuOpen()"
        [class.flex-col]="menuOpen()"
      >
        <a routerLink="/admin" class="hidden px-6 pb-2 pt-7 lg:block">
          <span class="small-caps block text-accent-deep">VN Booking Hub</span>
          <span class="mt-1 block font-serif text-2xl">Quản lý</span>
        </a>

        <nav aria-label="Quản lý" class="flex-1 space-y-6 px-3 py-5">
          @for (group of groups; track group.title) {
            <div>
              <p class="small-caps px-3 pb-2 text-muted-foreground">{{ group.title }}</p>
              <ul class="space-y-0.5">
                @for (link of group.links; track link.path) {
                  <li>
                    <a
                      [routerLink]="link.path"
                      routerLinkActive="bg-accent-muted !text-foreground font-medium"
                      [routerLinkActiveOptions]="{ exact: link.path === '/admin' }"
                      ariaCurrentWhenActive="page"
                      class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <svg viewBox="0 0 24 24" class="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path [attr.d]="icons[link.icon]" />
                      </svg>
                      <span class="flex-1">{{ link.label }}</span>
                      @if (link.badge && counts()[link.badge] > 0) {
                        <span class="min-w-6 rounded-full bg-accent-deep px-2 py-0.5 text-center text-xs font-semibold text-white">
                          {{ counts()[link.badge] }}<span class="sr-only"> cần xử lý</span>
                        </span>
                      }
                    </a>
                  </li>
                }
              </ul>
            </div>
          }
        </nav>

        <div class="border-t border-border px-3 py-4">
          <a
            routerLink="/admin/account"
            routerLinkActive="bg-accent-muted"
            class="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted"
          >
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground" aria-hidden="true">
              {{ initials() }}
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ auth.admin()?.name }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ auth.admin()?.email }}</span>
            </span>
          </a>
          <div class="mt-2 flex gap-1">
            <a routerLink="/" class="flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path [attr.d]="icons.website" />
              </svg>
              Website
            </a>
            <button
              type="button"
              class="flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              (click)="auth.logout()"
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path [attr.d]="icons.logout" />
              </svg>
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      <main class="min-w-0 px-4 pb-24 pt-8 sm:px-8 lg:px-10 lg:pt-10">
        <div class="mx-auto max-w-6xl">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class AdminLayout {
  protected readonly auth = inject(AdminAuthService);
  private readonly api = inject(AdminApiService);

  protected readonly icons = ICONS;
  protected readonly menuOpen = signal(false);

  protected readonly groups: { title: string; links: NavLink[] }[] = [
    {
      title: 'Vận hành',
      links: [
        { label: 'Tổng quan', path: '/admin', icon: 'dashboard' },
        { label: 'Đặt phòng', path: '/admin/bookings', icon: 'bookings', badge: 'bookings' },
        { label: 'Lịch', path: '/admin/calendar', icon: 'calendar' },
        { label: 'Tin nhắn', path: '/admin/messages', icon: 'messages', badge: 'messages' },
      ],
    },
    {
      title: 'Thiết lập',
      links: [
        { label: 'Căn hộ', path: '/admin/apartments', icon: 'apartments' },
        { label: 'Ngày lễ', path: '/admin/holidays', icon: 'holidays' },
        { label: 'Mã khuyến mãi', path: '/admin/promo-codes', icon: 'promo' },
      ],
    },
  ];

  /** Bumped on every page change, which refreshes the counts. */
  private readonly page = signal(0);
  private readonly summary = resource({ params: () => this.page(), loader: () => this.api.summary() });

  protected readonly counts = computed(() => {
    if (!this.summary.hasValue()) return { bookings: 0, messages: 0 };
    const summary = this.summary.value();
    return {
      bookings: summary.bookingsAwaitingPayment.length + summary.transfersToCheck.length,
      messages: summary.unhandledMessages,
    };
  });
  protected readonly attention = computed(() => this.counts().bookings + this.counts().messages);

  protected readonly initials = computed(() => {
    const words = (this.auth.admin()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    return words.slice(-2).map((word) => word[0]!.toUpperCase()).join('') || '?';
  });

  constructor() {
    const subscription = inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.menuOpen.set(false);
        this.page.update((n) => n + 1);
      });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
