import { Component, computed, effect, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { Lightbox } from '../../components/lightbox/lightbox';
import { PhotoCarousel } from '../../components/photo-carousel/photo-carousel';
import { galleryChapters, photoAlt } from '../../data/sun-garden-rooms';
import { Photo } from '../../models/apartment';
import { ApartmentService } from '../../services/apartment.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-gallery',
  imports: [TranslocoPipe, ApartmentHeader, ApartmentNotFound, Lightbox, PhotoCarousel],
  templateUrl: './gallery.html',
})
export class Gallery {
  private readonly apartments = inject(ApartmentService);
  private readonly transloco = inject(TranslocoService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly chapters = computed(() => {
    const apt = this.apartment();
    return apt ? galleryChapters(apt) : [];
  });
  /** Photos in the order they appear on the page (chapter by chapter): the lightbox steps through these. */
  protected readonly ordered = computed(() => this.chapters().flatMap((c) => c.photos));

  /** Alt text for each of `ordered()`: the room and the position in the room. */
  protected readonly alts = computed(() =>
    this.chapters().flatMap((chapter) => chapter.photos.map((_, i) => photoAlt(chapter, i, (key, params) => this.transloco.translate(key, params)))),
  );

  protected indexOf(photo: Photo): number {
    return this.ordered().indexOf(photo);
  }

  /** Where each room's photos start in `ordered()`. */
  private readonly starts = computed(() => {
    let at = 0;
    return this.chapters().map((chapter) => ((at += chapter.photos.length), at - chapter.photos.length));
  });

  /** The first photo of room `c`. */
  protected roomStart(c: number): number {
    return this.starts()[c] ?? 0;
  }

  /** The room that photo `index` belongs to. */
  protected roomOf(index: number): number {
    let room = 0;
    this.starts().forEach((start, c) => {
      if (start <= index && this.chapters()[c].photos.length) room = c;
    });
    return room;
  }

  protected two(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** Chapter `index` as shown on the page: "01", "02"… */
  protected number(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'apartment.tabs.gallery', path: '/gallery' });
    });
  }
}
