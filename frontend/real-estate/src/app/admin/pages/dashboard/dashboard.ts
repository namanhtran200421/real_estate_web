import { Component, computed, inject, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { StatusBadge } from '../../../components/status-badge/status-badge';
import { toApiError } from '../../../core/api';
import { PaymentPurpose } from '../../../models/booking';
import { AdminApiService } from '../../admin-api.service';
import { AwaitingPayment, BalanceDue, PeriodStats, StatsPeriod } from '../../admin.types';
import { todayIso, addDaysIso } from '../../../shared/dates';
import {
  REPORT_PERIODS,
  moveReport,
  reportAxisLabel,
  reportLabel,
  reportStart,
  validReportDate,
} from '../../dashboard-period';
import { ChartPoint, ColumnChart } from '../../components/column-chart';

const VND = new Intl.NumberFormat('vi-VN');

/** 1500000 → "1,5 tr", 500000 → "500k": short labels for the chart gridlines. */
function compactVnd(value: number): string {
  const sign = value < 0 ? '−' : '';
  value = Math.abs(value);
  const format = (n: number) => sign + n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (value >= 1_000_000_000) return `${format(value / 1_000_000_000)} tỷ`;
  if (value >= 1_000_000) return `${format(value / 1_000_000)} tr`;
  if (value >= 1_000) return `${format(value / 1_000)}k`;
  return sign + String(value);
}

/** "Đang lưu trú", "Hôm nay" or "Ngày mai" when the guest is close; otherwise nothing. */
function arrivalHint(checkIn: string): string | undefined {
  const today = todayIso();
  if (checkIn < today) return 'Đang lưu trú';
  if (checkIn === today) return 'Nhận phòng hôm nay';
  const next = addDaysIso(today, 1);
  if (checkIn === next) return 'Nhận phòng ngày mai';
  return undefined;
}

function occupancy(month: PeriodStats): number {
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
    <header class="flex flex-wrap items-end justify-between gap-4 mobile-stack">
      <div>
        <p class="small-caps text-accent-deep">{{ today | date: 'EEEE, dd/MM/yyyy' : '+0700' }}</p>
        <h1 class="mt-2 text-4xl">Tổng quan</h1>
      </div>
      <a routerLink="/admin/bookings" class="btn btn-outline">Tất cả đặt phòng</a>
    </header>

    @if (summary.hasValue()) {
      @let s = summary.value();

      <!-- What needs the owner now -->
      @if (actionError(); as message) {
        <p
          class="mt-8 rounded-md border border-accent bg-accent-muted p-3 text-sm text-accent-deep"
          role="alert"
        >
          {{ message }}
        </p>
      }
      @if (pendingPayment(); as pending) {
        <section class="card card-accent-top mt-8" aria-labelledby="dashboard-payment-confirm">
          <h2 id="dashboard-payment-confirm" class="text-xl">Xác nhận đã thực nhận tiền?</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Ghi nhận {{ purposeNames[pending.purpose] }} {{ pending.amount | number }} ₫ ·
            {{ pending.method === 'cash' ? 'tiền mặt' : 'chuyển khoản' }} cho
            {{ pending.reference }}.
          </p>
          <div class="mt-4 flex gap-3 mobile-center">
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="busy()"
              (click)="confirmRecord()"
            >
              Xác nhận đã nhận
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              [disabled]="busy()"
              (click)="pendingPayment.set(undefined)"
            >
              Thôi
            </button>
          </div>
        </section>
      }
      @if (s.bookingsAwaitingPayment.length) {
        <section class="card card-accent-top mt-8" aria-labelledby="awaiting-heading">
          <h2 id="awaiting-heading" class="text-2xl">
            Chờ tiền về · hiện tại ({{ s.bookingsAwaitingPayment.length }})
          </h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Tìm khoản chuyển theo nội dung trong ứng dụng ngân hàng. Thấy tiền thì bấm "Đã nhận":
            đặt phòng được xác nhận và khách nhận email.
          </p>
          <ul class="mt-6 divide-y divide-border border-y border-border">
            @for (a of s.bookingsAwaitingPayment; track a.reference) {
              <li class="py-4">
                <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 mobile-stack">
                  <span class="font-mono text-accent-deep">{{ a.note }}</span>
                  <a
                    [routerLink]="['/admin/bookings', a.reference]"
                    class="min-w-0 flex-1 text-sm text-muted-foreground hover:underline"
                  >
                    {{ a.customerName }} · {{ a.apartmentName }} · giữ đến
                    {{ a.holdExpiresAt | date: 'HH:mm dd/MM' }}
                  </a>
                </div>
                <div class="mt-3 flex flex-wrap gap-3 mobile-center">
                  @if (a.depositFirst) {
                    <button
                      type="button"
                      class="btn btn-outline"
                      [disabled]="busy()"
                      (click)="received(a, a.depositAmount, 'asset_security')"
                    >
                      Đã nhận cọc {{ a.depositAmount | number }} ₫
                    </button>
                  } @else {
                    @if (a.depositAmount > 0 && a.depositAmount < a.totalAmount) {
                      <button
                        type="button"
                        class="btn btn-outline"
                        [disabled]="busy()"
                        (click)="received(a, a.depositAmount)"
                      >
                        Đã nhận cọc {{ a.depositAmount | number }} ₫
                      </button>
                    }
                    <button
                      type="button"
                      class="btn btn-outline"
                      [disabled]="busy()"
                      (click)="received(a, a.totalAmount)"
                    >
                      Đã nhận đủ {{ a.totalAmount | number }} ₫
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (s.bookingsWithBalanceDue.length) {
        <section class="card mt-8" aria-labelledby="balance-heading">
          <h2 id="balance-heading" class="text-2xl">
            Còn thiếu tiền ({{ s.bookingsWithBalanceDue.length }})
          </h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Đã đặt cọc, phần còn lại thu khi khách nhận phòng: tiền mặt, hoặc chuyển khoản với nội
            dung bên dưới.
          </p>
          <ul class="mt-6 divide-y divide-border border-y border-border">
            @for (d of s.bookingsWithBalanceDue; track d.reference) {
              <li class="py-4">
                <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1 mobile-stack">
                  <span class="w-24 shrink-0 font-medium">{{ d.checkIn | date: 'EEE dd/MM' }}</span>
                  <a
                    [routerLink]="['/admin/bookings', d.reference]"
                    class="min-w-0 flex-1 text-sm text-muted-foreground hover:underline"
                  >
                    {{ d.customerName }} ·
                    <span class="font-mono text-accent-deep">{{ d.note }}</span>
                    @if (d.depositFirst) {
                      · Tiền phòng (từ {{ d.checkIn | date: 'dd/MM' }})
                    } @else {
                      · đã trả {{ d.amountPaid | number }}/{{ d.totalAmount | number }} ₫
                    }
                  </a>
                  <span class="text-right">
                    <span class="block font-serif text-xl">{{ d.balance | number }} ₫</span>
                    @if (hint(d.checkIn); as h) {
                      <span class="block text-xs font-medium text-accent-deep">{{ h }}</span>
                    }
                  </span>
                </div>
                <div class="mt-3 flex flex-wrap gap-3 mobile-center">
                  <button
                    type="button"
                    class="btn btn-outline"
                    [disabled]="busy()"
                    (click)="balanceReceived(d, 'bank_transfer')"
                  >
                    Đã nhận chuyển khoản
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    [disabled]="busy()"
                    (click)="balanceReceived(d, 'cash')"
                  >
                    Đã nhận tiền mặt
                  </button>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (s.transfersToCheck.length) {
        <section class="card card-accent-top mt-8" aria-labelledby="transfers-heading">
          <h2 id="transfers-heading" class="text-2xl">
            Chuyển khoản cần kiểm tra ({{ s.transfersToCheck.length }})
          </h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Khách đã gửi ảnh chuyển khoản. Tìm khoản tiền theo nội dung trong ứng dụng ngân hàng,
            rồi mở đặt phòng để xem ảnh và xác nhận.
          </p>
          <ul class="mt-6 divide-y divide-border border-y border-border">
            @for (t of s.transfersToCheck; track t.paymentId) {
              <li>
                <a
                  [routerLink]="['/admin/bookings', t.reference]"
                  class="flex flex-wrap items-center gap-x-6 gap-y-1 py-4 hover:bg-muted/50 mobile-stack"
                >
                  <span class="font-serif text-xl">{{ t.amount | number }} ₫</span>
                  <span class="font-mono text-accent-deep">{{ t.note }}</span>
                  <span class="min-w-0 flex-1 text-sm text-muted-foreground">
                    {{ t.customerName }} · {{ t.apartmentName }} · báo lúc
                    {{ t.reportedAt | date: 'HH:mm dd/MM' }}
                  </span>
                  <span class="link text-sm">Kiểm tra →</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }

      @if (s.awaitingConfirmation > 0 || s.unhandledMessages > 0 || s.lateCheckouts > 0) {
        <div class="mt-6 flex flex-wrap gap-3 mobile-center">
          @if (s.lateCheckouts > 0) {
            <a
              routerLink="/admin/bookings"
              [queryParams]="{ status: 'confirmed' }"
              class="rounded-md border border-accent bg-accent-muted px-4 py-2.5 text-sm text-accent-deep hover:border-accent-deep"
            >
              {{ s.lateCheckouts }} khách đã tới giờ trả phòng →
            </a>
          }
          @if (s.awaitingConfirmation > 0) {
            <a
              routerLink="/admin/bookings"
              [queryParams]="{ status: 'pending' }"
              class="rounded-md border border-accent bg-accent-muted px-4 py-2.5 text-sm hover:border-accent-deep"
            >
              {{ s.awaitingConfirmation }} đặt phòng đã có tiền, chờ xác nhận →
            </a>
          }
          @if (s.unhandledMessages > 0) {
            <a
              routerLink="/admin/messages"
              class="rounded-md border border-accent bg-accent-muted px-4 py-2.5 text-sm hover:border-accent-deep"
            >
              {{ s.unhandledMessages }} tin nhắn chưa trả lời →
            </a>
          }
        </div>
      }
    } @else if (summary.error()) {
      <p class="mt-8 text-accent-deep" role="alert">Không tải được dữ liệu.</p>
      <button type="button" class="btn btn-outline mt-4" (click)="summary.reload()">Thử lại</button>
    } @else {
      <p class="mt-8 text-muted-foreground" role="status">Đang tải…</p>
    }

    <section class="card mt-8 p-5 sm:p-6" aria-label="Bộ lọc báo cáo">
      <div class="flex flex-wrap items-end justify-between gap-6 mobile-stack">
        <div class="w-full sm:w-auto">
          <p class="label" id="report-period-label">Xem báo cáo theo</p>
          <div class="grid grid-cols-4 gap-2" role="group" aria-labelledby="report-period-label">
            @for (option of periods; track option.value) {
              <button
                type="button"
                class="input min-w-14 cursor-pointer px-3 text-center hover:border-accent-deep"
                [attr.aria-pressed]="period() === option.value"
                [class.bg-accent-muted]="period() === option.value"
                [class.border-accent-deep]="period() === option.value"
                [class.font-semibold]="period() === option.value"
                (click)="setPeriod(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </div>
        <div class="w-full sm:w-48">
          <label class="label" for="report-date">Chọn ngày trong kỳ</label>
          <input
            id="report-date"
            type="date"
            class="input"
            min="2000-01-01"
            max="2100-12-31"
            [value]="reportDate()"
            (change)="selectDate($event)"
          />
        </div>
        <button type="button" class="btn btn-outline" (click)="resetPeriod()">
          {{ currentLabel() }}
        </button>
      </div>
      <div class="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5">
        <button
          type="button"
          class="icon-btn shrink-0"
          aria-label="Kỳ trước"
          [disabled]="!canMove(-1)"
          (click)="move(-1)"
        >
          ←
        </button>
        <div class="min-w-0 text-center" aria-live="polite">
          <h2 class="text-xl">{{ selectedLabel() }}</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            Giờ Việt Nam{{ period() === 'week' ? ' · Thứ Hai – Chủ Nhật' : '' }}
          </p>
        </div>
        <button
          type="button"
          class="icon-btn shrink-0"
          aria-label="Kỳ sau"
          [disabled]="!canMove(1)"
          (click)="move(1)"
        >
          →
        </button>
      </div>
    </section>

    <section
      class="mt-6 min-h-44"
      aria-label="Số liệu báo cáo"
      [attr.aria-busy]="stats.isLoading()"
    >
      @if (stats.isLoading()) {
        <p class="grid min-h-44 place-items-center text-muted-foreground" role="status">
          Đang tải báo cáo…
        </p>
      } @else if (stats.error()) {
        <div class="card" role="alert">
          <p>Không tải được báo cáo. Vui lòng thử lại.</p>
          <button type="button" class="btn btn-outline mt-4" (click)="stats.reload()">
            Thử lại
          </button>
        </div>
      } @else if (kpis(); as k) {
        <p class="mb-4 text-sm text-muted-foreground">
          So với {{ previousLabel() }}.
          @if (partialPeriod()) {
            Kỳ đang xem chưa kết thúc; kỳ trước được tính toàn bộ.
          }
        </p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="card p-5">
            <p class="text-sm text-muted-foreground">Doanh thu trong {{ unitLabel() }}</p>
            <p class="mt-2 text-2xl font-semibold">{{ k.revenue | number }} ₫</p>
            <p class="mt-1 text-sm text-muted-foreground">
              @if (k.revenueChange; as c) {
                <span class="font-medium text-foreground">{{ c.up ? '▲' : '▼' }} {{ c.text }}</span>
                so với kỳ trước
              } @else {
                Kỳ trước: {{ k.previousRevenue | number }} ₫
              }
            </p>
          </div>
          <div class="card p-5">
            <p class="text-sm text-muted-foreground">Đặt phòng xác nhận trong {{ unitLabel() }}</p>
            <p class="mt-2 text-2xl font-semibold">{{ k.bookings }}</p>
            <p class="mt-1 text-sm text-muted-foreground">
              @if (k.bookingsChange; as c) {
                <span class="font-medium text-foreground">{{ c.up ? '▲' : '▼' }} {{ c.text }}</span>
                so với kỳ trước
              } @else {
                Kỳ trước: {{ k.previousBookings }}
              }
            </p>
          </div>
          <div class="card p-5">
            <p class="text-sm text-muted-foreground">Công suất phòng trong {{ unitLabel() }}</p>
            <p class="mt-2 text-2xl font-semibold">{{ k.occupancy }}%</p>
            <div class="mt-3 h-1.5 rounded-full bg-accent-muted" role="presentation">
              <div class="h-1.5 rounded-full bg-accent-deep" [style.width.%]="k.occupancy"></div>
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ k.nightsBooked }}/{{ k.nightsAvailable }} đêm đã có khách
            </p>
          </div>
          @if (summary.hasValue()) {
            <div class="card p-5">
              <p class="text-sm text-muted-foreground">Đang lưu trú · hiện tại</p>
              <p class="mt-2 text-2xl font-semibold">{{ summary.value().inHouse }}</p>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ summary.value().arrivalsNext7Days.length }} khách đến trong 7 ngày tới
              </p>
            </div>
          }
        </div>
        <section aria-label="Biểu đồ" class="mt-8 grid gap-6 lg:grid-cols-2">
          <div class="card min-w-0 p-5 sm:p-6">
            <h2 class="text-xl">Doanh thu theo {{ unitLabel() }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ revenuePoints().length }} {{ unitLabel() }} đến kỳ đang xem · tiền đã nhận, trừ
              hoàn tiền; không gồm tiền đặt cọc
            </p>
            <app-column-chart
              class="mt-6 block"
              [label]="'Doanh thu theo ' + unitLabel()"
              [points]="revenuePoints()"
              [highlight]="k.start"
              [tickFormat]="compactVnd"
              [minStep]="1"
            />
          </div>
          <div class="card min-w-0 p-5 sm:p-6">
            <h2 class="text-xl">Công suất phòng theo {{ unitLabel() }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              Căn hộ đang hiển thị · đêm thuộc đặt phòng đã xác nhận, trước và sau kỳ đang xem
            </p>
            <app-column-chart
              class="mt-6 block"
              [label]="'Công suất phòng theo ' + unitLabel()"
              [points]="occupancyPoints()"
              [highlight]="k.start"
              [max]="100"
              [tickFormat]="percent"
            />
          </div>
        </section>
      }
    </section>

    @if (summary.hasValue()) {
      @let s = summary.value();
      <section class="mt-10" aria-labelledby="arrivals-heading">
        <h2 id="arrivals-heading" class="text-2xl">Khách đến trong 7 ngày tới</h2>
        @if (s.arrivalsNext7Days.length) {
          <ul class="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
            @for (b of s.arrivalsNext7Days; track b.reference) {
              <li>
                <a
                  [routerLink]="['/admin/bookings', b.reference]"
                  class="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-muted/50 mobile-stack"
                >
                  <span class="w-28 font-medium">{{ b.checkIn | date: 'EEE dd/MM' }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block">{{ b.customerName }} · {{ b.guests }} khách</span>
                    <span class="block text-sm text-muted-foreground"
                      >{{ b.apartmentName }} · {{ b.reference }}</span
                    >
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly periods = REPORT_PERIODS;
  protected readonly period = computed<StatsPeriod>(() => {
    const value = this.query().get('period');
    return REPORT_PERIODS.find((option) => option.value === value)?.value ?? 'month';
  });
  protected readonly reportDate = computed(() => {
    const value = this.query().get('date');
    return validReportDate(value) ? value : todayIso();
  });
  protected readonly selectedLabel = computed(() =>
    reportLabel(this.period(), reportStart(this.period(), this.reportDate())),
  );
  protected readonly unitLabel = computed(
    () => ({ day: 'ngày', week: 'tuần', month: 'tháng', year: 'năm' })[this.period()],
  );
  protected readonly currentLabel = computed(
    () =>
      ({ day: 'Hôm nay', week: 'Tuần này', month: 'Tháng này', year: 'Năm nay' })[this.period()],
  );
  protected readonly previousLabel = computed(() => {
    if (!this.stats.hasValue()) return '';
    const previous = this.stats.value().previous;
    return reportLabel(this.period(), previous.start, previous.end);
  });
  protected readonly partialPeriod = computed(
    () => this.stats.hasValue() && this.stats.value().today < this.stats.value().selected.end,
  );

  protected setPeriod(period: StatsPeriod): void {
    this.navigatePeriod(period, this.reportDate());
  }
  protected selectDate(event: Event): void {
    const date = (event.target as HTMLInputElement).value;
    if (validReportDate(date)) this.navigatePeriod(this.period(), date);
    else (event.target as HTMLInputElement).value = this.reportDate();
  }
  protected canMove(direction: number): boolean {
    return validReportDate(moveReport(this.period(), this.reportDate(), direction));
  }
  protected move(direction: number): void {
    const date = moveReport(this.period(), this.reportDate(), direction);
    if (validReportDate(date)) this.navigatePeriod(this.period(), date);
  }
  protected resetPeriod(): void {
    this.navigatePeriod(this.period(), todayIso());
  }
  private navigatePeriod(period: StatsPeriod, date: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { period, date },
      queryParamsHandling: 'merge',
    });
  }

  protected readonly today = new Date();
  protected readonly summary = resource({ loader: () => this.api.summary() });
  protected readonly stats = resource({
    params: () => ({ period: this.period(), date: this.reportDate() }),
    loader: ({ params }) => this.api.stats(params.period, params.date),
  });

  protected readonly compactVnd = compactVnd;
  protected readonly percent = (value: number) => `${value}%`;

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | undefined>(undefined);
  protected readonly pendingPayment = signal<
    | {
        reference: string;
        method: 'bank_transfer' | 'cash';
        purpose: PaymentPurpose;
        amount: number;
        note: string;
      }
    | undefined
  >(undefined);
  protected readonly hint = arrivalHint;
  protected readonly purposeNames: Record<PaymentPurpose, string> = {
    accommodation: 'tiền phòng',
    asset_security: 'tiền đặt cọc',
    incident: 'tiền bồi thường',
  };

  protected readonly kpis = computed(() => {
    if (!this.stats.hasValue()) return undefined;
    const { selected: current, previous } = this.stats.value();
    return {
      start: current.start,
      revenue: current.revenue,
      previousRevenue: previous.revenue,
      revenueChange: change(current.revenue, previous.revenue),
      bookings: current.bookings,
      previousBookings: previous.bookings,
      bookingsChange: change(current.bookings, previous.bookings),
      occupancy: occupancy(current),
      nightsBooked: current.nightsBooked,
      nightsAvailable: current.nightsAvailable,
    };
  });

  protected readonly revenuePoints = computed<ChartPoint[]>(() => {
    if (!this.stats.hasValue()) return [];
    const { periods, selected } = this.stats.value();
    return periods
      .filter((bucket) => bucket.start <= selected.start)
      .map((bucket) => ({
        key: bucket.start,
        label: reportAxisLabel(this.period(), bucket.start),
        detail: `${reportLabel(this.period(), bucket.start, bucket.end)} · ${bucket.bookings} đặt phòng xác nhận`,
        value: bucket.revenue,
        display: `${VND.format(bucket.revenue)} ₫`,
      }));
  });

  protected readonly occupancyPoints = computed<ChartPoint[]>(() => {
    if (!this.stats.hasValue()) return [];
    const { periods, selected } = this.stats.value();
    const index = periods.findIndex((bucket) => bucket.start === selected.start);
    const back = { day: 6, week: 5, month: 5, year: 2 }[this.period()];
    return periods.slice(Math.max(0, index - back)).map((bucket) => ({
      key: bucket.start,
      label: reportAxisLabel(this.period(), bucket.start),
      detail: `${reportLabel(this.period(), bucket.start, bucket.end)} · ${bucket.nightsBooked}/${bucket.nightsAvailable} đêm`,
      value: occupancy(bucket),
      display: `${occupancy(bucket)}%`,
    }));
  });

  /** The transfer is in the bank account: records it, which confirms the booking and emails the guest. */
  protected received(
    booking: AwaitingPayment,
    amount: number,
    purpose: PaymentPurpose = 'accommodation',
  ): void {
    this.pendingPayment.set({
      reference: booking.reference,
      method: 'bank_transfer',
      purpose,
      amount,
      note: `Chuyển khoản ${booking.note}`,
    });
  }

  /** The rest of the price arrived (usually at check-in): the booking becomes fully paid. */
  protected balanceReceived(booking: BalanceDue, method: 'bank_transfer' | 'cash'): void {
    const note =
      method === 'cash' ? 'Tiền mặt, phần còn lại' : `Chuyển khoản ${booking.note}, phần còn lại`;
    this.pendingPayment.set({
      reference: booking.reference,
      method,
      purpose: 'accommodation',
      amount: booking.balance,
      note,
    });
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
