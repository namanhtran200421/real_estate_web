import { Component, ElementRef, PLATFORM_ID, effect, inject, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { matches } from './motion-prefs';
import { MotionService } from './motion.service';

/**
 * Desktop decoration: a navy dot that follows the pointer and grows into a gold "Xem" ring over
 * photos that open the lightbox. The native cursor stays visible; hidden over form fields.
 * Hidden until the first pointer move. It only reads the engine, never starts it, so Tier 2 pages stay light.
 */
@Component({
  selector: 'app-custom-cursor',
  imports: [TranslocoPipe],
  template: `<div class="cursor is-hidden" #cursor aria-hidden="true"><span class="cursor-label">{{ 'motion.cursorView' | transloco }}</span></div>`,
})
export class CustomCursor {
  private readonly cursor = viewChild.required<ElementRef<HTMLElement>>('cursor');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const motion = inject(MotionService);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    // Lives in the app shell, so it follows the route: on while a story page has the engine, off elsewhere.
    effect((onCleanup) => {
      const engine = motion.engine();
      if (!browser || !engine || !motion.story() || !matches('desktop')) return;
      const el = this.cursor().nativeElement;
      const x = engine.gsap.quickTo(el, 'x', { duration: 0.25, ease: 'power3.out' });
      const y = engine.gsap.quickTo(el, 'y', { duration: 0.25, ease: 'power3.out' });
      const move = (e: PointerEvent) => {
        x(e.clientX);
        y(e.clientY);
        const target = e.target as Element;
        el.classList.toggle('is-view', !!target.closest('[data-cursor="view"]'));
        el.classList.toggle('is-hidden', !!target.closest('input, select, textarea, [contenteditable]'));
      };
      host.classList.add('is-active');
      window.addEventListener('pointermove', move, { passive: true });
      onCleanup(() => {
        window.removeEventListener('pointermove', move);
        host.classList.remove('is-active');
      });
    });
  }
}
