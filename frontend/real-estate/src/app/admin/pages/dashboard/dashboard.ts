import { Component, computed, inject, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StatusBadge } from '../../../components/status-badge/status-badge';
import { toApiError } from '../../../core/api';
import { AdminApiService } from '../../admin-api.service';
import { AwaitingPayment, BalanceDue, MonthStats } from '../../admin.types';
import { ChartPoint, ColumnChart } from '../../components/column-chart';

const VND = new Intl.NumberFormat('vi-VN');

/** 1500000 → "1,5 tr", 500000 → "500k": short labels for the chart gridlines. */
function compactVnd(value: number): string {
  const format = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (value >= 1_000_000_000) return `${format(value / 1_000_000_000)} tỷ`;
  if (value >= 1_000_000) return `${format(value / 1_000_000)} tr`;
  if (value >= 1_000) return `${format(value / 1_000)}k`;
  return String(value);
}

/** "2026-10" → "T10" (with the year in January, where the axis crosses one). */
function monthLabel(month: string): string {
  const [year, number] = month.split('-');
  return number === '01' ? `T1/${year!.slice(2)}` : `T${Number(number)}`;
}

function monthDetail(month: string): string {
  const [year, number] = month.split('-');
  return `Tháng ${Number(number)}/${year}`;
}

/** Today in the browser, "2026-10-11" (the owner works in Vietnam time). */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** "Đang lưu trú", "Hôm nay" or "Ngày mai" when the guest is close; otherwise nothing. */
function arrivalHint(checkIn: string): string | undefined {
  const today = todayIso();
  if (checkIn < today) return 'Đang lưu trú';
  if (checkIn === today) return 'Nhận phòng hôm nay';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  if (checkIn === next) return 'Nhận phòng ngày mai';
  return undefined;
}

function occupancy(month: MonthStats): number {
  if (month.nightsAvailable === 0) return 0;
  return Math.round((month.nightsBooked / month.nightsAvailable) * 100);
}

/** Change against the previous period, e.g. "+12%"; null when there is nothing to compare with. */
function change(current: number, previous: number): { text: string; up: boolean } | null {
  if (previous <= 0) return null;
  const percent = Math.round(((current - previous) / previous) * 100);
  return { text: `${percent > 0 ? '+' : ''}${percent}%`, up: percent >= 0 };
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, DecimalPipe, RouterLink, StatusBadge, ColumnChart],
  template: `
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="small-caps text-accent-deep">{{ today | date: 'EEEE, dd/MM/yyyy' }}</p>
        <h1 class="mt-2 text-4xl">Tổng quan</h1>
      </div>
      <a routerLink="/admin/bookings" class="btn btn-outline">Tất cả đặt phòng</a>
    </header>

    @if (summary.hasValue()) {
      @let s = summary.value();

      <!-- What needs the owner now -->
      @if (actionError(); as message) {
        <p class="mt-8 rounded-md border border-accent bg-accent-muted p-3 text-sm text-accent-deep" role="alert">{{ message }}</p>
      }
      @if (pendingPayment(); as pending) {
        <section class="card card-accent-top mt-8" aria-labelledby="dashboard-payment-confirm">
          <h2 id="dashboard-payment-confirm" class="text-xl">Xác nhận đã thực nhận tiền?</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Ghi nhận {{ pending.amount | number }} ₫ · {{ pending.method === 'cash' ? 'tiền mặt' : 'chuyển khoản' }} cho {{ pending.reference }}.
          </p>
          <div class="mt-4 flex gap-3">
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="confirmRecord()">Xác nhận đã nhận</button>
            <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="pendingPayment.set(undefined)">Thôi</button>
          </div>
        </section>
      }
      @if (s.bookingsAwaitingPayment.length) {
        <section class="card card-accent-top mt-8" aria-labelledby="awaiting-heading">
          <h2 id="awaiting-heading" class="text-2xl">Chờ tiền về ({{ s.bookingsAwaitingPayment.length }})</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Tìm khoản chuyển theo nội dung trong ứng dụng ngân hàng. Thấy tiền thì bấm "Đã nhận": đặt phòng được xác nhận và khách nhận email.
          </p>
          <ul class="mt-6 divide-y divide-border border-y border-border">
            @for (a of s.bookingsAwaitingPayment; track a.reference) {
              <li class="py-4">
                <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <span class="font-mono text-accent-deep">{{ a.note }}</span>
                  <a [routerLink]="['/admin/bookings', a.reference]" class="min-w-0 flex-1 text-sm text-muted-foreground hover:underline">
                    {{ a.customerName }} · {{ a.apartmentName }} · giữ đến {{ a.holdExpiresAt | date: 'HH:mm dd/MM' }}
                  </a>
                </div>
                <div class="mt-3 flex flex-wrap gap-3">
                  @if (a.depositAmount > 0 && a.depositAmount < a.totalAmount) {
                    <button type="button" class="btn btn-outline" [disabled]="busy()" (click)="received(a, a.depositAmount)">
                      Đã nhận cọc {{ a.depositAmount | number }} ₫
                    </button>
                  }
                  <button type="button" class="btn btn-outline" [disabled]="busy()" (click)="received(a, a.totalAmount)">
                    Đã nhận đủ {{ a.totalAmount | number }} ₫
                  </button>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (s.bookingsWithBalanceDue.length) {
        <section class="card mt-8" aria-labelledby="balance-heading">
          <h2 id="balance-heading" class="text-2xl">Còn thiếu tiền ({{ s.bookingsWithBalanceDue.length }})</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Đã đặt cọc, phần còn lại thu khi khách nhận phòng: tiền mặt, hoặc chuyển khoản với nội dung bên dưới.
          </p>
          <ul class="mt-6 divide-y divide-border border-y border-border">
            @for (d of s.bookingsWithBalanceDue; track d.reference) {
              <li class="py-4">
                <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <span class="w-24 shrink-0 font-medium">{{ d.checkIn | date: 'EEE dd/MM' }}</span>
                  <a [routerLink]="['/admin/bookings', d.reference]" class="min-w-0 flex-1 text-sm text-muted-foreground hover:underline">
                    {{ d.customerName }} · <span class="font-mono text-accent-deep">{{ d.note }}</span> · đã trả
                    {{ d.amountPaid | number }}/{{ d.totalAmount | number }} ₫
                  </a>
                  <span class="text-right">
                    <span class="block font-serif text-xl">{{ d.balance | number }} ₫</span>
                    @if (hint(d.checkIn); as h) {
                      <span class="block text-xs font-medium text-accent-deep">{{ h }}</span>
                    }
                  </span>
                </div>
                <div class="mt-3 flex flex-wrap gap-3">
                  <button type="button" class="btn btn-outline" [disabled]="busy()" (click)="balanceReceived(d, 'bank_transfer')">
                    Đã nhận chuyển khoản
                  </button>
                  <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="balanceReceived(d, 'cash')">Đã nhận tiền mặt</button>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (s.transfersToCheck.length) {
        <section class="card card-accent-top mt-8" aria-labelledby="transfers-heading">
          <h2 id="transfers-heading" class="text-2xl">Chuyển khoản cần kiểm tra ({{ s.transfersToCheck.length }})</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Khách đã gửi ảnh chuyển khoản. Tìm khoản tiền theo nội dung trong ứng dụng ngân hàng, rồi mở đặt phòng để xem ảnh và xác nhận.
          </p>
          <ul class="mt-6 divide-y divide-border border-y border-border">
            @for (t of s.transfersToCheck; track t.paymentId) {
              <li>
                <a [routerLink]="['/admin/bookings', t.reference]" class="flex flex-wrap items-center gap-x-6 gap-y-1 py-4 hover:bg-muted/50">
                  <span class="font-serif text-xl">{{ t.amount | number }} ₫</span>
                  <span class="font-mono text-accent-deep">{{ t.note }}</span>
                  <span class="min-w-0 flex-1 text-sm text-muted-foreground">
                    {{ t.customerName }} · {{ t.apartmentName }} · báo lúc {{ t.reportedAt | date: 'HH:mm dd/MM' }}
                  </span>
                  <span class="link text-sm">Kiểm tra →</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }

      @if (s.awaitingConfirmation > 0 || s.unhandledMessages > 0 || s.lateCheckouts > 0) {
        <div class="mt-6 flex flex-wrap gap-3">
          @if (s.lateCheckouts > 0) {
            <a routerLink="/admin/bookings" [queryParams]="{ status: 'confirmed' }" class="rounded-md border border-accent bg-accent-muted px-4 py-2.5 text-sm text-accent-deep hover:border-accent-deep">
              {{ s.lateCheckouts }} khách đã tới giờ trả phòng →
            </a>
          }
          @if (s.awaitingConfirmation > 0) {
            <a routerLink="/admin/bookings" [queryParams]="{ status: 'pending' }" class="rounded-md border border-accent bg-accent-muted px-4 py-2.5 text-sm hover:border-accent-deep">
              {{ s.awaitingConfirmation }} đặt phòng đã có tiền, chờ xác nhận →
            </a>
          }
          @if (s.unhandledMessages > 0) {
            <a routerLink="/admin/messages" class="rounded-md border border-accent bg-accent-muted px-4 py-2.5 text-sm hover:border-accent-deep">
              {{ s.unhandledMessages }} tin nhắn chưa trả lời →
            </a>
          }
        </div>
      }

      <!-- Key figures -->
      <section aria-label="Số liệu chính" class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @if (kpis(); as k) {
          <div class="card p-5">
            <p class="text-sm text-muted-foreground">Doanh thu tháng này</p>
            <p class="mt-2 text-2xl font-semibold">{{ k.revenue | number }} ₫</p>
            <p class="mt-1 text-sm text-muted-foreground">
              @if (k.revenueChange; as c) {
                <span class="font-medium text-foreground">{{ c.up ? '▲' : '▼' }} {{ c.text }}</span> so với tháng trước
              } @else {
                Tháng trước chưa có doanh thu
              }
            </p>
          </div>
          <div class="card p-5">
            <p class="text-sm text-muted-foreground">Đặt phòng xác nhận tháng này</p>
            <p class="mt-2 text-2xl font-semibold">{{ k.bookings }}</p>
            <p class="mt-1 text-sm text-muted-foreground">
              @if (k.bookingsChange; as c) {
                <span class="font-medium text-foreground">{{ c.up ? '▲' : '▼' }} {{ c.text }}</span> so với tháng trước
              } @else {
                Tháng trước: {{ k.previousBookings }}
              }
            </p>
          </div>
          <div class="card p-5">
            <p class="text-sm text-muted-foreground">Công suất phòng tháng này</p>
            <p class="mt-2 text-2xl font-semibold">{{ k.occupancy }}%</p>
            <div class="mt-3 h-1.5 rounded-full bg-accent-muted" role="presentation">
              <div class="h-1.5 rounded-full bg-accent-deep" [style.width.%]="k.occupancy"></div>
            </div>
            <p class="mt-2 text-sm text-muted-foreground">{{ k.nightsBooked }}/{{ k.nightsAvailable }} đêm đã có khách</p>
          </div>
        }
        <div class="card p-5">
          <p class="text-sm text-muted-foreground">Đang lưu trú</p>
          <p class="mt-2 text-2xl font-semibold">{{ s.inHouse }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ s.arrivalsNext7Days.length }} khách đến trong 7 ngày tới</p>
        </div>
      </section>
    } @else if (summary.error()) {
      <p class="mt-8 text-accent-deep" role="alert">Không tải được dữ liệu.</p>
      <button type="button" class="btn btn-outline mt-4" (click)="summary.reload()">Thử lại</button>
    } @else {
      <p class="mt-8 text-muted-foreground" role="status">Đang tải…</p>
    }

    <!-- Charts -->
    @if (stats.hasValue()) {
      <section aria-label="Biểu đồ" class="mt-8 grid gap-6 lg:grid-cols-2" [class.opacity-60]="stats.isLoading()">
        <div class="card min-w-0 p-5 sm:p-6">
          <h2 class="text-xl">Doanh thu theo tháng</h2>
          <p class="mt-1 text-sm text-muted-foreground">12 tháng gần nhất · tiền đã nhận, trừ hoàn tiền</p>
          <app-column-chart
            class="mt-6 block"
            label="Doanh thu 12 tháng gần nhất"
            [points]="revenuePoints()"
            [highlight]="stats.value().currentMonth"
            [tickFormat]="compactVnd"
          />
        </div>
        <div class="card min-w-0 p-5 sm:p-6">
          <h2 class="text-xl">Công suất phòng</h2>
          <p class="mt-1 text-sm text-muted-foreground">6 tháng qua và 6 tháng tới · tháng tới tính theo đặt phòng đã xác nhận</p>
          <app-column-chart
            class="mt-6 block"
            label="Tỷ lệ đêm có khách theo tháng"
            [points]="occupancyPoints()"
            [highlight]="stats.value().currentMonth"
            [max]="100"
            [tickFormat]="percent"
          />
        </div>
      </section>
    } @else if (stats.error()) {
      <p class="mt-8 text-sm text-muted-foreground" role="alert">
        Không tải được biểu đồ.
        <button type="button" class="link" (click)="stats.reload()">Thử lại</button>
      </p>
    }

    @if (summary.hasValue()) {
      @let s = summary.value();
      <section class="mt-10" aria-labelledby="arrivals-heading">
        <h2 id="arrivals-heading" class="text-2xl">Khách đến trong 7 ngày tới</h2>
        @if (s.arrivalsNext7Days.length) {
          <ul class="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
            @for (b of s.arrivalsNext7Days; track b.reference) {
              <li>
                <a [routerLink]="['/admin/bookings', b.reference]" class="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-muted/50">
                  <span class="w-28 font-medium">{{ b.checkIn | date: 'EEE dd/MM' }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block">{{ b.customerName }} · {{ b.guests }} khách</span>
                    <span class="block text-sm text-muted-foreground">{{ b.apartmentName }} · {{ b.reference }}</span>
                  </span>
                  <app-status-badge [status]="b.status" />
                  <app-status-badge [status]="b.paymentStatus" />
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="mt-4 text-muted-foreground">Không có khách đến trong 7 ngày tới.</p>
        }
      </section>
    }
  `,
})
export class AdminDashboard {
  private readonly api = inject(AdminApiService);

  protected readonly today = new Date();
  protected readonly summary = resource({ loader: () => this.api.summary() });
  protected readonly stats = resource({ loader: () => this.api.stats() });

  protected readonly compactVnd = compactVnd;
  protected readonly percent = (value: number) => `${value}%`;

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | undefined>(undefined);
  protected readonly pendingPayment = signal<{
    reference: string;
    method: 'bank_transfer' | 'cash';
    amount: number;
    note: string;
  } | undefined>(undefined);
  protected readonly hint = arrivalHint;

  /** This month and last, from the chart data. */
  protected readonly kpis = computed(() => {
    if (!this.stats.hasValue()) return undefined;
    const { months, currentMonth } = this.stats.value();
    const index = months.findIndex((m) => m.month === currentMonth);
    const current = months[index];
    const previous = months[index - 1];
    if (!current) return undefined;
    return {
      revenue: current.revenue,
      revenueChange: change(current.revenue, previous?.revenue ?? 0),
      bookings: current.bookings,
      previousBookings: previous?.bookings ?? 0,
      bookingsChange: change(current.bookings, previous?.bookings ?? 0),
      occupancy: occupancy(current),
      nightsBooked: current.nightsBooked,
      nightsAvailable: current.nightsAvailable,
    };
  });

  /** The last 12 months, up to and including this one. */
  protected readonly revenuePoints = computed<ChartPoint[]>(() => {
    if (!this.stats.hasValue()) return [];
    const { months, currentMonth } = this.stats.value();
    return months
      .filter((m) => m.month <= currentMonth)
      .slice(-12)
      .map((m) => ({
        key: m.month,
        label: monthLabel(m.month),
        detail: `${monthDetail(m.month)} · ${m.bookings} đặt phòng xác nhận`,
        value: m.revenue,
        display: `${VND.format(m.revenue)} ₫`,
      }));
  });

  /** Six months back to six months ahead. */
  protected readonly occupancyPoints = computed<ChartPoint[]>(() => {
    if (!this.stats.hasValue()) return [];
    const { months, currentMonth } = this.stats.value();
    const index = months.findIndex((m) => m.month === currentMonth);
    return months.slice(Math.max(0, index - 5), index + 7).map((m) => ({
      key: m.month,
      label: monthLabel(m.month),
      detail: `${monthDetail(m.month)} · ${m.nightsBooked}/${m.nightsAvailable} đêm`,
      value: occupancy(m),
      display: `${occupancy(m)}%`,
    }));
  });

  /** The transfer is in the bank account: records it, which confirms the booking and emails the guest. */
  protected received(booking: AwaitingPayment, amount: number): void {
    this.pendingPayment.set({ reference: booking.reference, method: 'bank_transfer', amount, note: `Chuyển khoản ${booking.note}` });
  }

  /** The rest of the price arrived (usually at check-in): the booking becomes fully paid. */
  protected balanceReceived(booking: BalanceDue, method: 'bank_transfer' | 'cash'): void {
    const note = method === 'cash' ? 'Tiền mặt, phần còn lại' : `Chuyển khoản ${booking.note}, phần còn lại`;
    this.pendingPayment.set({ reference: booking.reference, method, amount: booking.balance, note });
  }

  protected async confirmRecord(): Promise<void> {
    const payment = this.pendingPayment();
    if (!payment) return;
    this.busy.set(true);
    this.actionError.set(undefined);
    try {
      await this.api.recordPayment(payment.reference, payment);
      this.pendingPayment.set(undefined);
      this.summary.reload();
      this.stats.reload();
    } catch (error) {
      this.actionError.set(toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
