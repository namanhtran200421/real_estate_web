import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel';
import { Apartment } from '../../models/apartment';

/** Embla's slide duration (higher is slower, about 20–60): an unhurried glide between photos. */
const SLIDE_DURATION = 32;

@Component({
  selector: 'app-apartment-card',
  imports: [DecimalPipe, NgOptimizedImage, RouterLink, TranslocoPipe],
  templateUrl: './apartment-card.html',
})
export class ApartmentCard {
  readonly apartment = input.required<Apartment>();
  /** Featured = wide horizontal card for the lead apartment; default = grid tile. */
  readonly featured = input(false);

  private readonly viewport = viewChild<ElementRef<HTMLDivElement>>('viewport');
  private embla?: EmblaCarouselType;
  /** Reduced motion: the buttons switch photos at once instead of sliding. */
  private reducedMotion = false;

  protected readonly photoIndex = signal(0);
  /**
   * Slides whose image is in the page: the current photo and its neighbours, so the next one is
   * already loaded when it slides in, without downloading every photo up front.
   */
  protected readonly mounted = signal<ReadonlySet<number>>(new Set([0]));

  /** The featured card slides through every photo; grid tiles show the first one. */
  protected readonly slides = computed(() => this.featured() && this.apartment().photos.length > 1);

  constructor() {
    // Browser only: Embla measures and moves real DOM nodes.
    afterNextRender(() => {
      const element = this.viewport()?.nativeElement;
      if (!this.slides() || !element) return;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const embla = EmblaCarousel(element, { loop: true, duration: SLIDE_DURATION });
      embla.on('select', () => this.show(embla.selectedScrollSnap()));
      this.embla = embla;
      this.show(0);
    });

    inject(DestroyRef).onDestroy(() => this.embla?.destroy());
  }

  protected previous(): void {
    this.embla?.scrollPrev(this.reducedMotion);
  }

  protected next(): void {
    this.embla?.scrollNext(this.reducedMotion);
  }

  /** Arrow keys move between photos while the carousel has focus. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') this.previous();
    else if (event.key === 'ArrowRight') this.next();
    else return;
    event.preventDefault();
  }

  private show(index: number): void {
    this.photoIndex.set(index);
    const count = this.apartment().photos.length;
    const mounted = new Set(this.mounted());
    for (const step of [-1, 0, 1, 2]) mounted.add((index + step + count) % count);
    if (mounted.size !== this.mounted().size) this.mounted.set(mounted);
  }
}
