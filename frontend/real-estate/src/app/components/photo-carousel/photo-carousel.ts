import { Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel';
import { isPortrait } from '../../data/sun-garden-rooms';
import { Photo } from '../../models/apartment';

/**
 * A row of photos with the current one centred and the neighbours dimmed at the sides. Every slide
 * has its photo's own shape at one height, so nothing is cropped. Drag, swipe or use the arrow keys;
 * clicking a side photo brings it to the centre, clicking the centred one opens it (`opened`).
 * The page drives it through `index`, `previous()`, `next()` and `goTo()`. Before Embla starts (on
 * the server, or without script) the row scrolls natively.
 */
@Component({
  selector: 'app-photo-carousel',
  imports: [NgOptimizedImage],
  templateUrl: './photo-carousel.html',
  host: { class: 'block' },
})
export class PhotoCarousel {
  readonly photos = input.required<Photo[]>();
  /** Alt text per photo, in order. */
  readonly alts = input.required<string[]>();
  /** Names the carousel for assistive technology. */
  readonly label = input.required<string>();
  /** Prioritise the first image only when this carousel is the page's initial above-the-fold content. */
  readonly priority = input(false);
  /** The photo centred when the carousel starts (the gallery opens at a room this way). */
  readonly startIndex = input(0);
  /** The centred photo was chosen: its index and the image, for the lightbox's return focus. */
  readonly opened = output<{ index: number; image: HTMLImageElement }>();

  private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
  private embla?: EmblaCarouselType;
  private reducedMotion = false;

  protected readonly isPortrait = isPortrait;
  /** The centred photo. */
  readonly index = signal(0);
  protected readonly started = signal(false);

  constructor() {
    afterNextRender(() => {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (this.photos().length < 2) return;
      const embla = EmblaCarousel(this.viewport().nativeElement, { align: 'center', containScroll: false, duration: 34, startIndex: this.startIndex() });
      this.index.set(embla.selectedScrollSnap());
      embla.on('select', () => this.index.set(embla.selectedScrollSnap()));
      this.embla = embla;
      this.started.set(true);
    });
    inject(DestroyRef).onDestroy(() => this.embla?.destroy());
  }

  previous(): void {
    this.embla?.scrollPrev(this.reducedMotion);
  }

  next(): void {
    this.embla?.scrollNext(this.reducedMotion);
  }

  goTo(index: number): void {
    this.embla?.scrollTo(index, this.reducedMotion);
  }

  /** Embla swallows the click that ends a drag, so this runs only for a real click or key press. */
  protected choose(index: number, event: Event): void {
    if (this.started() && index !== this.index()) {
      this.goTo(index);
      return;
    }
    const image = (event.currentTarget as HTMLElement).querySelector('img');
    if (image) this.opened.emit({ index, image });
  }
}
