import { Injectable } from '@angular/core';

/** The blocks that fade in: text, lists, panels, forms, pictures and actions. */
const TARGETS = 'h1, h2, h3, p, ul, ol, dl, table, form, figure, img, .panel, .card, a.btn';
/** Never touched: things that move on their own, float, or sit in a dialog. */
const SKIP = 'header, dialog, .lift, .book-bar, .photo-carousel__viewport, [data-no-fade], [class*="sr-only"]';
const STAGGER_MS = 60;

/**
 * A subtle fade for every guest page: each block below the first screen rises 12px and fades in
 * the first time it scrolls into view; blocks that arrive together are staggered by 60ms.
 * The hidden state is only set here (in the browser, motion allowed), so without script or with
 * reduced motion everything is simply shown. Pictures fade without moving.
 */
@Injectable({ providedIn: 'root' })
export class ScrollFade {
  private observer?: IntersectionObserver;
  private mutations?: MutationObserver;
  private scanQueued = false;

  /** Watch the page's main content and footer; call again after each navigation. */
  watch(): void {
    if (typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    if (!document.querySelector('app-root.guest')) return;
    this.observer ??= new IntersectionObserver((entries) => this.reveal(entries), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    if (!this.mutations) {
      // Content that arrives later (the apartment from the API, a deferred footer) is picked up too.
      this.mutations = new MutationObserver(() => this.queueScan());
      this.mutations.observe(document.body, { childList: true, subtree: true });
    }
    this.queueScan();
  }

  private queueScan(): void {
    if (this.scanQueued) return;
    this.scanQueued = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.scanQueued = false;
        this.scan();
      }),
    );
  }

  private scan(): void {
    const roots = document.querySelectorAll<HTMLElement>('app-root.guest main, app-root.guest footer');
    roots.forEach((root) =>
      root.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
        if (el.dataset['fade']) return;
        el.dataset['fade'] = 'seen';
        // Only the outermost block fades; already visible, floating or skipped blocks never do.
        if (el.parentElement?.closest('[data-fade="pending"], [data-fade="done"]')) return;
        if (el.closest(SKIP)) return;
        const box = el.getBoundingClientRect();
        // Visually hidden blocks (screen-reader lists) never scroll into view: leave them alone.
        if (box.width <= 1 || box.height <= 1) return;
        if (box.top < window.innerHeight * 0.92) return;
        const position = getComputedStyle(el).position;
        if (position === 'fixed' || position === 'sticky') return;
        el.dataset['fade'] = 'pending';
        el.classList.add('fade-pending');
        if (el.tagName === 'IMG' || el.tagName === 'FIGURE') el.classList.add('fade-still');
        this.observer!.observe(el);
      }),
    );
  }

  private reveal(entries: IntersectionObserverEntry[]): void {
    let order = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      this.observer!.unobserve(el);
      el.style.setProperty('--fade-delay', `${Math.min(order++, 6) * STAGGER_MS}ms`);
      el.classList.add('fade-in');
      el.dataset['fade'] = 'done';
      // Hand the element back to its own transitions (hover, press) once it has arrived.
      el.addEventListener(
        'transitionend',
        () => {
          el.classList.remove('fade-pending', 'fade-in', 'fade-still');
          el.style.removeProperty('--fade-delay');
        },
        { once: true },
      );
    }
  }
}
