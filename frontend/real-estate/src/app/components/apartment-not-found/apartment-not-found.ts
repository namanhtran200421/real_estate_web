import { Component, RESPONSE_INIT, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-apartment-not-found',
  imports: [RouterLink],
  template: `
    <section class="section">
      <div class="container-editorial text-center">
        <p class="section-label mx-auto max-w-xs">404</p>
        <h1 class="text-4xl md:text-5xl">Không tìm thấy căn hộ</h1>
        <p class="mt-6 text-muted-foreground">Căn hộ này không tồn tại hoặc đã bị gỡ.</p>
        <a routerLink="/" fragment="can-ho" class="btn btn-outline mt-10">Xem các căn hộ</a>
      </div>
    </section>
  `,
})
export class ApartmentNotFound {
  constructor() {
    // Real 404 status for server-rendered responses, and keep the page out of search results.
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) response.status = 404;
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }
}
