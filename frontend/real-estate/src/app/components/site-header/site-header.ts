import { Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, inject, viewChild } from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { IsActiveMatchOptions, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { SITE } from '../../data/site';
import { LANG } from '../../i18n/i18n';
import { LANGS, withLangPrefix } from '../../i18n/lang';
import { MotionService } from '../../motion/motion.service';

@Component({
  selector: 'app-site-header',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './site-header.html',
})
export class SiteHeader {
  private readonly router = inject(Router);
  protected readonly site = SITE;
  protected readonly lang = inject(LANG);
  private readonly motion = inject(MotionService);
  private readonly menu = viewChild<ElementRef<HTMLDialogElement>>('menu');

  /** `label` is a translation key. */
  protected readonly links = [
    { label: 'nav.home', path: '/' },
    { label: 'nav.apartment', path: '/apartment' },
    { label: 'nav.availability', path: '/availability' },
    { label: 'nav.about', path: '/about' },
    { label: 'nav.contact', path: '/contact' },
  ];

  /** A link stays active on its page whatever apartment (`?apt=`) is selected. */
  protected readonly activeOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  /** The current page in each language; switching is a full page load of the other URL. */
  protected readonly languages = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.languageLinks()),
    ),
    { initialValue: this.languageLinks() },
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Browser only: the server DOM has no <dialog> API (close() throws "NotYetImplemented").
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // Any navigation (links, browser back, iOS swipe-back) closes the menu; (close) then cleans up.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeIfOpen());
    // The menu is phone/tablet only: close it when the viewport grows past the lg breakpoint.
    afterNextRender(() => {
      const wide = window.matchMedia('(min-width: 1024px)');
      const onChange = (e: MediaQueryListEvent) => {
        if (e.matches) this.closeIfOpen();
      };
      wide.addEventListener('change', onChange);
      destroyRef.onDestroy(() => wide.removeEventListener('change', onChange));
    });
  }

  private languageLinks() {
    return LANGS.map((lang) => ({ lang, href: withLangPrefix(lang, this.router.url) }));
  }

  protected openMenu(): void {
    const menu = this.menu()?.nativeElement;
    if (!menu) return;
    menu.showModal();
    document.documentElement.classList.add('has-dialog');
    this.motion.engine()?.pause();
  }

  /** Closes the menu if it is open (the initial navigation can end before the view exists). */
  private closeIfOpen(): void {
    const menu = this.menu()?.nativeElement;
    if (menu?.open) menu.close();
  }

  protected closeMenu(): void {
    this.closeIfOpen();
  }

  /** Skip links: focus the target in place (no navigation). */
  protected skipTo(event: Event, id: string): void {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  }

  /** Runs for every close: the button, a link, Esc, or the Android back gesture. */
  protected menuClosed(): void {
    document.documentElement.classList.remove('has-dialog');
    this.motion.engine()?.resume();
  }
}
