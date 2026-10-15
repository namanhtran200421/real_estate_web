import { Component, computed, effect, inject, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { Lightbox } from '../../components/lightbox/lightbox';
import { galleryChapters } from '../../data/sun-garden-rooms';
import { Photo } from '../../models/apartment';
import { FadeInDirective } from '../../motion/fade-in.directive';
import { ApartmentService } from '../../services/apartment.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-gallery',
  imports: [NgOptimizedImage, RouterLink, TranslocoPipe, ApartmentHeader, ApartmentNotFound, FadeInDirective, Lightbox],
  templateUrl: './gallery.html',
})
export class Gallery {
  private readonly apartments = inject(ApartmentService);

  /** Bound from the `?apt=` query param. */
  readonly slug = input<string>(undefined, { alias: 'apt' });

  protected readonly apartment = computed(() => this.apartments.resolve(this.slug()));
  protected readonly chapters = computed(() => {
    const apt = this.apartment();
    return apt ? galleryChapters(apt) : [];
  });
  /** Photos in the order they appear on the page (chapter by chapter): the lightbox steps through these. */
  protected readonly ordered = computed(() => this.chapters().flatMap((c) => c.photos));

  /**
   * Classes for photo `i` of a chapter with `count` photos. Phones: two columns. From md the list is
   * a six-column grid whose tiles always fill the row (a lone leftover tile is widened), so the
   * chapter spans the full width whatever its count.
   */
  protected tile(count: number, i: number): { item: string; box: string } {
    if (count === 1) return { item: 'col-span-2 md:col-span-6', box: 'aspect-[4/3] md:aspect-[16/9]' };
    if (count === 2 || count === 4) return { item: 'md:col-span-3', box: 'aspect-[3/4] md:aspect-square' };
    if (count === 3) {
      return i === 0
        ? { item: 'col-span-2 md:col-span-3 md:row-span-2', box: 'aspect-[4/3] md:aspect-auto md:h-full' }
        : { item: 'md:col-span-3', box: 'aspect-[3/4] md:aspect-[4/3]' };
    }
    const rest = count % 3;
    const last = rest > 0 && i >= count - rest;
    if (last && rest === 1) return { item: 'col-span-2 md:col-span-6', box: 'aspect-[4/3] md:aspect-[16/9]' };
    if (last) return { item: 'md:col-span-3', box: 'aspect-[3/4] md:aspect-[4/3]' };
    return { item: 'md:col-span-2', box: 'aspect-[3/4]' };
  }

  protected indexOf(photo: Photo): number {
    return this.ordered().indexOf(photo);
  }

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'apartment.tabs.gallery', path: '/gallery' });
    });
  }
}
