import { Component, inject, resource } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../../admin-api.service';

@Component({
  selector: 'app-admin-apartments',
  imports: [DecimalPipe, RouterLink],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-4xl">Căn hộ</h1>
      <a routerLink="/admin/apartments/new" class="btn btn-primary">Thêm căn hộ</a>
    </div>

    @if (apartments.hasValue()) {
      <ul class="mt-8 divide-y divide-border rounded-lg border border-border bg-card">
        @for (a of apartments.value(); track a.id) {
          <li>
            <a [routerLink]="['/admin/apartments', a.slug]" class="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-muted/50">
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{{ a.name }}</span>
                <span class="block text-sm text-muted-foreground">{{ a.area }} · tối đa {{ a.guests }} khách · /{{ a.slug }}</span>
              </span>
              <span class="text-sm">Từ {{ a.pricing.weekday | number }} ₫/đêm · cọc {{ a.depositPercent }}%</span>
              @if (a.isActive) {
                <span class="small-caps rounded-md border border-foreground bg-foreground px-2.5 py-1 text-[0.625rem] text-background">Đang hiển thị</span>
              } @else {
                <span class="small-caps rounded-md border border-border bg-muted px-2.5 py-1 text-[0.625rem] text-muted-foreground">Đang ẩn</span>
              }
            </a>
          </li>
        }
      </ul>
    } @else if (apartments.error()) {
      <p class="mt-8 text-accent-deep" role="alert">Không tải được danh sách.</p>
    } @else {
      <p class="mt-8 text-muted-foreground" role="status">Đang tải…</p>
    }
  `,
})
export class AdminApartments {
  private readonly api = inject(AdminApiService);
  protected readonly apartments = resource({ loader: () => this.api.apartments() });
}
