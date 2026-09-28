import { Component, RESPONSE_INIT, effect, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ApartmentService } from '../../services/apartment.service';

/**
 * Shown where an apartment page has no apartment: while the list is still loading, when it
 * failed to load, or when the slug matches nothing (a real 404).
 */
@Component({
  selector: 'app-apartment-not-found',
  imports: [RouterLink],
  template: `
    <section class="section">
      <div class="container-editorial text-center">
        @if (apartments.loading()) {
          <p class="small-caps text-muted-foreground" role="status">Đang tải…</p>
        } @else if (apartments.failed()) {
          <p class="section-label mx-auto max-w-xs">Lỗi kết nối</p>
          <h1 class="text-4xl md:text-5xl">Chưa tải được dữ liệu</h1>
          <p class="mt-6 text-muted-foreground">Vui lòng kiểm tra kết nối mạng và thử lại.</p>
          <button type="button" class="btn btn-outline mt-10" (click)="apartments.reload()">Thử lại</button>
        } @else {
          <p class="section-label mx-auto max-w-xs">404</p>
          <h1 class="text-4xl md:text-5xl">Không tìm thấy căn hộ</h1>
          <p class="mt-6 text-muted-foreground">Căn hộ này không tồn tại hoặc đã bị gỡ.</p>
          <a routerLink="/" fragment="can-ho" class="btn btn-outline mt-10">Xem các căn hộ</a>
        }
      </div>
    </section>
  `,
})
export class ApartmentNotFound {
  protected readonly apartments = inject(ApartmentService);

  constructor() {
    const response = inject(RESPONSE_INIT, { optional: true });
    const meta = inject(Meta);
    // Real status codes for server-rendered responses, and keep the page out of search results.
    effect(() => {
      if (this.apartments.loading()) return;
      let status = 404;
      if (this.apartments.failed()) status = 503;
      if (response) response.status = status;
      meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    });
  }
}
