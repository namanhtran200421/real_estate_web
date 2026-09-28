import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { SITE } from '../data/site';
import { LANG } from '../i18n/i18n';
import { SeoService } from './seo.service';

/**
 * Applies each route's `title` plus `data.description` / `data.robots` on every navigation.
 * Apartment pages then refine these with the apartment's own details.
 */
@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly seo = inject(SeoService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = inject(LANG);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route: ActivatedRouteSnapshot = snapshot.root;
    while (route.firstChild) route = route.firstChild;

    const path = '/' + route.pathFromRoot.flatMap((r) => r.url.map((s) => s.path)).join('/');
    this.seo.update({
      title: this.text(this.buildTitle(snapshot)) ?? SITE.name,
      description: this.text(route.data['description']),
      robots: route.data['robots'],
      path,
      jsonLd:
        path === '/'
          ? {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: SITE.name,
              description: this.transloco.translate('site.description'),
              inLanguage: this.lang,
            }
          : undefined,
    });
  }

  /** Public routes give translation keys; admin routes give plain (Vietnamese) titles, used as they are. */
  private text(value: string | undefined): string | undefined {
    if (!value || !(value in this.transloco.getTranslation(this.lang))) return value;
    return this.transloco.translate(value, { site: SITE.name });
  }
}
