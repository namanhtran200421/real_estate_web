import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import EmblaCarousel, { type EmblaCarouselType, type EmblaPluginType } from 'embla-carousel';
import Autoplay from 'embla-carousel-autoplay';
import Fade from 'embla-carousel-fade';
import { Photo } from '../../models/apartment';

/** Time each photo stays on screen. */
export const AUTOPLAY_DELAY = 6000; // ms

/**
 * Home hero: full-bleed photos that cross-fade on their own. The server renders the first photo
 * only, as a plain image (it is the LCP). Embla starts in the browser: it mounts the other photos,
 * then fades between them. Autoplay never starts under reduced motion, and stops on hover, on focus
 * inside and while the tab is hidden. The copy layer is projected, so it never moves with the slides.
 */
@Component({
  selector: 'app-hero-carousel',
  imports: [NgOptimizedImage, TranslocoPipe],
  templateUrl: './hero-carousel.html',
  host: { class: 'relative block h-[100svh] min-h-[38rem] bg-background' },
})
export class HeroCarousel {
  readonly photos = input.required<Photo[]>();

  private readonly viewport = viewChild<ElementRef<HTMLDivElement>>('viewport');
  private readonly injector = inject(Injector);
  private embla?: EmblaCarouselType;
  private reducedMotion = false;

  protected readonly index = signal(0);
  /** False on the server and until hydration: only the first photo exists then. */
  protected readonly started = signal(false);
  protected readonly slides = computed(() => (this.started() ? this.photos() : this.photos().slice(0, 1)));

  constructor() {
    afterNextRender(() => {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (this.photos().length < 2) return;
      this.started.set(true);
      // The other photos are in the page after this render; Embla measures them then.
      afterNextRender(() => this.init(), { injector: this.injector });
    });
    inject(DestroyRef).onDestroy(() => this.embla?.destroy());
  }

  protected previous(): void {
    this.embla?.scrollPrev(this.reducedMotion);
  }

  protected next(): void {
    this.embla?.scrollNext(this.reducedMotion);
  }

  protected goTo(i: number): void {
    this.embla?.scrollTo(i, this.reducedMotion);
  }

  private init(): void {
    const root = this.viewport()?.nativeElement;
    if (!root) return;
    const plugins: EmblaPluginType[] = [Fade()];
    const autoplay = this.reducedMotion
      ? undefined
      : Autoplay({ delay: AUTOPLAY_DELAY, stopOnInteraction: false, stopOnMouseEnter: false, stopOnFocusIn: false });
    if (autoplay) plugins.push(autoplay);
    const embla = EmblaCarousel(root, { loop: true, duration: 40 }, plugins);
    embla.on('select', () => this.index.set(embla.selectedScrollSnap()));
    this.embla = embla;

    if (autoplay) {
      // One rule for all three reasons to hold still: the pointer is over it, focus is inside it, or the tab is hidden.
      // (The plugin's own hover and focus options restart on the next slide change, so they cannot hold.)
      const host = root.parentElement!;
      const hold = { hover: false, focus: false };
      const sync = () => (document.hidden || hold.hover || hold.focus ? autoplay.stop() : autoplay.play());
      const on = (target: EventTarget, type: string, handler: (e: Event) => void) => {
        target.addEventListener(type, handler);
        return () => target.removeEventListener(type, handler);
      };
      const offs = [
        // pointermove too: a pointer already over the carousel when it started never fires mouseenter.
        on(host, 'pointermove', (e) => {
          if ((e as PointerEvent).pointerType !== 'mouse' || hold.hover) return;
          hold.hover = true;
          sync();
        }),
        on(host, 'mouseenter', () => ((hold.hover = true), sync())),
        on(host, 'mouseleave', () => ((hold.hover = false), sync())),
        on(host, 'focusin', () => ((hold.focus = true), sync())),
        on(host, 'focusout', (e) => ((hold.focus = host.contains((e as FocusEvent).relatedTarget as Node | null)), sync())),
        on(document, 'visibilitychange', sync),
      ];
      embla.on('select', sync);
      this.cleanup = () => offs.forEach((off) => off());
    }
  }

  private cleanup?: () => void;
  private readonly _destroy = inject(DestroyRef).onDestroy(() => this.cleanup?.());
}
