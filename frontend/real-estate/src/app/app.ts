import { ApplicationRef, Component, afterNextRender, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SiteFooter } from './components/site-footer/site-footer';
import { SiteHeader } from './components/site-header/site-header';
import { CustomCursor } from './motion/custom-cursor';
import { MotionService } from './motion/motion.service';
import { ScrollFade } from './motion/scroll-fade';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteHeader, SiteFooter, CustomCursor],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { class: 'block', '[class.guest]': '!inAdmin()' },
})
export class App {
  private readonly router = inject(Router);

  /** The admin area has its own navigation, so the public header and footer are hidden there. */
  protected readonly inAdmin = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/admin')),
    ),
    { initialValue: false },
  );

  constructor() {
    const application = inject(ApplicationRef);
    const motion = inject(MotionService);
    const fade = inject(ScrollFade);
    afterNextRender(() => {
      // Resource completion includes error states. No minimum display time or navigation replay.
      void application.whenStable().then(() => window.dispatchEvent(new Event('vnbooking:ready')));
      motion.start();
      fade.watch();
    });

    // After a navigation (not the first page), screen-reader and keyboard users start at the new page's h1.
    let previousPath: string | undefined;
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0];
      const changed = previousPath !== undefined && previousPath !== path;
      previousPath = path;
      if (typeof document !== 'undefined') fade.watch();
      // First page, or only the fragment/query changed (#chapter, ?apt): leave focus alone.
      if (!changed || typeof document === 'undefined') return;
      requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>('main h1');
        if (!heading) return;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      });
    });
  }
}
