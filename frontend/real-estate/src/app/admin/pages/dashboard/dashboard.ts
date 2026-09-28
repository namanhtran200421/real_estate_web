import { Component, inject, resource } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StatusBadge } from '../../../components/status-badge/status-badge';
import { AdminApiService } from '../../admin-api.service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, DecimalPipe, RouterLink, StatusBadge],
  template: `
    <h1 class="text-4xl">Tổng quan</h1>

    @if (summary.hasValue()) {
      @let s = summary.value();

      @if (s.transfersToCheck.length) {
        <section class="card card-accent-top mt-8" aria-labelledby="transfers-heading">
          <h2 id="transfers-heading" class="text-2xl">Chuyển khoản cần kiểm tra ({{ s.transfersToCheck.length }})</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Khách đã báo chuyển khoản. Tìm khoản tiền theo nội dung trong ứng dụng ngân hàng, rồi mở đặt phòng để xác nhận.
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

      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <a routerLink="/admin/bookings" [queryParams]="{ status: 'pending' }" class="card card-hover p-5">
          <p class="small-caps text-muted-foreground">Chờ xác nhận</p>
          <p class="mt-2 font-serif text-4xl" [class.text-accent-deep]="s.awaitingConfirmation > 0">{{ s.awaitingConfirmation }}</p>
          <p class="mt-1 text-sm text-muted-foreground">Đã có tiền, chưa xác nhận</p>
        </a>
        <div class="card p-5">
          <p class="small-caps text-muted-foreground">Chờ thanh toán</p>
          <p class="mt-2 font-serif text-4xl">{{ s.awaitingPayment }}</p>
          <p class="mt-1 text-sm text-muted-foreground">Đang giữ chỗ</p>
        </div>
        <div class="card p-5">
          <p class="small-caps text-muted-foreground">Đang lưu trú</p>
          <p class="mt-2 font-serif text-4xl">{{ s.inHouse }}</p>
        </div>
        <div class="card p-5">
          <p class="small-caps text-muted-foreground">Doanh thu tháng này</p>
          <p class="mt-2 font-serif text-2xl">{{ s.revenueThisMonth | number }} ₫</p>
          <p class="mt-1 text-sm text-muted-foreground">Đã nhận, trừ hoàn tiền</p>
        </div>
        <a routerLink="/admin/messages" class="card card-hover p-5">
          <p class="small-caps text-muted-foreground">Tin nhắn mới</p>
          <p class="mt-2 font-serif text-4xl" [class.text-accent-deep]="s.unhandledMessages > 0">{{ s.unhandledMessages }}</p>
        </a>
      </div>

      <h2 class="mt-14 text-2xl">Khách đến trong 7 ngày tới</h2>
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
    } @else if (summary.error()) {
      <p class="mt-8 text-accent-deep" role="alert">Không tải được dữ liệu.</p>
      <button type="button" class="btn btn-outline mt-4" (click)="summary.reload()">Thử lại</button>
    } @else {
      <p class="mt-8 text-muted-foreground" role="status">Đang tải…</p>
    }
  `,
})
export class AdminDashboard {
  private readonly api = inject(AdminApiService);
  protected readonly summary = resource({ loader: () => this.api.summary() });
}
