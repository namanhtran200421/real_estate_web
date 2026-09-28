import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { imageLoader } from '../../image-loader';
import { Apartment } from '../../models/apartment';

const SLIDE_MS = 850;

@Component({
  selector: 'app-apartment-card',
  imports: [DecimalPipe, NgOptimizedImage, RouterLink, TranslocoPipe],
  templateUrl: './apartment-card.html',
})
export class ApartmentCard {
  readonly apartment = input.required<Apartment>();
  /** Featured = wide horizontal card for the lead apartment; default = grid tile. */
  readonly featured = input(false);

  private readonly destroyRef = inject(DestroyRef);
  private readonly carousel = viewChild<ElementRef<HTMLDivElement>>('carousel');
  private readonly preloads = new Map<string, Promise<boolean>>();
  private observer?: IntersectionObserver;
  private slideTimer?: ReturnType<typeof setTimeout>;
  private inView = false;
  private reducedMotion = false;
  private loading = false;

  protected readonly photoIndex = signal(0);
  protected readonly incomingIndex = signal<number | null>(null);
  protected readonly incomingSrc = signal('');
  protected readonly direction = signal<1 | -1>(1);
  protected readonly moving = signal(false);
  protected readonly settling = signal(false);
  protected readonly currentPhoto = computed(() => {
    const photos = this.apartment().photos;
    return photos[this.photoIndex() % photos.length];
  });

  constructor() {
    afterNextRender(() => {
      if (!this.featured()) return;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const element = this.carousel()?.nativeElement;
      if (element) {
        this.observer = new IntersectionObserver(([entry]) => {
          this.inView = entry.isIntersecting;
          if (this.inView) this.prefetchNeighbors();
        }, { rootMargin: '240px' });
        this.observer.observe(element);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      if (this.slideTimer) clearTimeout(this.slideTimer);
    });
  }

  protected previous(): void {
    void this.changePhoto(-1);
  }

  protected next(): void {
    void this.changePhoto(1);
  }

  protected completeSlide(event: TransitionEvent): void {
    if (event.propertyName === 'transform') this.finishSlide();
  }

  private async changePhoto(step: 1 | -1): Promise<void> {
    const count = this.apartment().photos.length;
    if (!this.featured() || count < 2 || this.loading || this.incomingIndex() !== null || this.settling()) return;

    this.loading = true;
    const nextIndex = (this.photoIndex() + step + count) % count;
    const src = this.photoUrl(nextIndex);
    const ready = await this.preload(src);
    this.loading = false;
    if (this.destroyRef.destroyed || !ready) return;

    if (this.reducedMotion) {
      this.photoIndex.set(nextIndex);
      this.prefetchNeighbors();
      return;
    }

    this.direction.set(step);
    this.incomingSrc.set(src);
    this.incomingIndex.set(nextIndex);
    // Let the incoming image paint outside the frame before both layers start moving.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.destroyRef.destroyed) this.moving.set(true);
    }));
    this.slideTimer = setTimeout(() => this.finishSlide(), SLIDE_MS + 300);
  }

  private finishSlide(): void {
    const nextIndex = this.incomingIndex();
    if (nextIndex === null) return;
    if (this.slideTimer) clearTimeout(this.slideTimer);
    // The incoming layer is already in place. Swap the main image without
    // animating it back from its offscreen exit position.
    this.settling.set(true);
    this.photoIndex.set(nextIndex);
    this.incomingIndex.set(null);
    this.moving.set(false);
    this.prefetchNeighbors();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.destroyRef.destroyed) this.settling.set(false);
    }));
  }

  private photoUrl(index: number): string {
    const photo = this.apartment().photos[index];
    const width = this.carousel()?.nativeElement.clientWidth || 960;
    return imageLoader({ src: photo.src, width: Math.ceil(width * Math.min(window.devicePixelRatio || 1, 2)) });
  }

  private prefetchNeighbors(): void {
    if (!this.featured() || !this.inView || this.apartment().photos.length < 2) return;
    const count = this.apartment().photos.length;
    void this.preload(this.photoUrl((this.photoIndex() + 1) % count));
    void this.preload(this.photoUrl((this.photoIndex() - 1 + count) % count));
  }

  private preload(src: string): Promise<boolean> {
    const cached = this.preloads.get(src);
    if (cached) return cached;
    const request = new Promise<boolean>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const decoded = image.decode?.();
        if (decoded) void decoded.then(() => resolve(true), () => resolve(true));
        else resolve(true);
      };
      image.onerror = () => resolve(false);
      image.src = src;
    });
    this.preloads.set(src, request);
    void request.then((loaded) => { if (!loaded) this.preloads.delete(src); });
    return request;
  }
}
