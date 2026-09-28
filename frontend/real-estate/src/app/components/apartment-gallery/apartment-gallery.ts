import { Component, computed, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Photo } from '../../models/apartment';

@Component({
  selector: 'app-apartment-gallery',
  imports: [NgOptimizedImage, RouterLink, TranslocoPipe],
  templateUrl: './apartment-gallery.html',
})
export class ApartmentGallery {
  readonly photos = input.required<Photo[]>();
  /** Apartment slug, for the "see all photos" link. */
  readonly slug = input.required<string>();

  /**
   * Show only as many photos as fill the grid without gaps:
   * 5+ → cover + 4, 3–4 → cover + 2, fewer → all of them.
   */
  protected readonly visible = computed(() => {
    const photos = this.photos();
    const count = photos.length >= 5 ? 5 : photos.length >= 3 ? 3 : photos.length;
    return photos.slice(0, count);
  });

  protected readonly gridClass = computed(
    () => ({ 5: 'md:grid-cols-4', 3: 'md:grid-cols-3', 2: 'md:grid-cols-2' })[this.visible().length] ?? '',
  );

  protected photoClass(index: number): string {
    const count = this.visible().length;
    if (index === 0) {
      return count >= 3
        ? 'aspect-[4/3] md:col-span-2 md:row-span-2 md:aspect-auto'
        : 'aspect-[4/3] md:row-span-2 md:aspect-auto';
    }
    return count === 2 ? 'hidden md:block md:row-span-2' : 'hidden md:block';
  }
}
