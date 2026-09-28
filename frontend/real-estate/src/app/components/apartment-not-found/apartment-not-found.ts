import { Component, RESPONSE_INIT, effect, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentService } from '../../services/apartment.service';

/**
 * Shown where an apartment page has no apartment: while the list is still loading, when it
 * failed to load, or when the slug matches nothing (a real 404).
 */
@Component({
  selector: 'app-apartment-not-found',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section class="section">
      <div class="container-editorial text-center">
        @if (apartments.loading()) {
          <p class="small-caps text-muted-foreground" role="status">{{ 'common.loading' | transloco }}</p>
        } @else if (apartments.failed()) {
          <p class="section-label mx-auto max-w-xs">{{ 'notFound.connectionError' | transloco }}</p>
          <h1 class="text-4xl md:text-5xl">{{ 'notFound.loadFailed' | transloco }}</h1>
          <p class="mt-6 text-muted-foreground">{{ 'notFound.checkConnection' | transloco }}</p>
          <button type="button" class="btn btn-outline mt-10" (click)="apartments.reload()">
            {{ 'common.retry' | transloco }}
          </button>
        } @else {
          <p class="section-label mx-auto max-w-xs">404</p>
          <h1 class="text-4xl md:text-5xl">{{ 'notFound.title' | transloco }}</h1>
          <p class="mt-6 text-muted-foreground">{{ 'notFound.text' | transloco }}</p>
          <a routerLink="/" fragment="can-ho" class="btn btn-outline mt-10">{{ 'notFound.browse' | transloco }}</a>
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
