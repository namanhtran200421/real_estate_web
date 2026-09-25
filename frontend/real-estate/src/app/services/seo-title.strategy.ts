import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { SITE } from '../data/site';
import { SeoService } from './seo.service';

/**
 * Applies each route's `title` plus `data.description` / `data.robots` on every navigation.
 * Apartment pages then refine these with the apartment's own details.
 */
@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly seo = inject(SeoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route: ActivatedRouteSnapshot = snapshot.root;
    while (route.firstChild) route = route.firstChild;

    const path = '/' + route.pathFromRoot.flatMap((r) => r.url.map((s) => s.path)).join('/');
    this.seo.update({
      title: this.buildTitle(snapshot) ?? SITE.name,
      description: route.data['description'],
      robots: route.data['robots'],
      path,
      jsonLd:
        path === '/'
          ? {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: SITE.name,
              description: SITE.description,
              inLanguage: 'vi',
            }
          : undefined,
    });
  }
}
