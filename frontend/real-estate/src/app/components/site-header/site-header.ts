import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { SITE } from '../../data/site';
import { LANG } from '../../i18n/i18n';
import { LANGS, withLangPrefix } from '../../i18n/lang';

@Component({
  selector: 'app-site-header',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './site-header.html',
})
export class SiteHeader {
  private readonly router = inject(Router);
  protected readonly site = SITE;
  protected readonly lang = inject(LANG);
  protected readonly menuOpen = signal(false);

  /** `label` is a translation key. */
  protected readonly links = [
    { label: 'nav.home', path: '/' },
    { label: 'nav.about', path: '/about' },
    { label: 'nav.contact', path: '/contact' },
  ];

  /** The current page in each language; switching is a full page load of the other URL. */
  protected readonly languages = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.languageLinks()),
    ),
    { initialValue: this.languageLinks() },
  );

  private languageLinks() {
    return LANGS.map((lang) => ({ lang, href: withLangPrefix(lang, this.router.url) }));
  }
}
