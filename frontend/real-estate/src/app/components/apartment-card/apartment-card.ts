import { Component, DestroyRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Apartment } from '../../models/apartment';

@Component({
  selector: 'app-apartment-card',
  imports: [DecimalPipe, NgOptimizedImage, RouterLink, TranslocoPipe],
  templateUrl: './apartment-card.html',
})
export class ApartmentCard {
  readonly apartment = input.required<Apartment>();
  /** Featured = wide horizontal card for the lead apartment; default = grid tile. */
  readonly featured = input(false);

  protected readonly photoIndex = signal(0);
  protected readonly currentPhoto = computed(() => {
    const photos = this.apartment().photos;
    return photos[this.photoIndex() % photos.length];
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const timer = setInterval(() => {
        if (this.featured() && this.apartment().photos.length > 1) this.changePhoto(1);
      }, 6000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected changePhoto(direction: number): void {
    const count = this.apartment().photos.length;
    if (count > 1) this.photoIndex.update((index) => (index + direction + count) % count);
  }
}
