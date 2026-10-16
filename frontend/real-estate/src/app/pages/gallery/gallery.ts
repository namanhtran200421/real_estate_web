import { Component, computed, effect, inject, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { Lightbox } from '../../components/lightbox/lightbox';
import { galleryChapters, isPortrait, photoAlt } from '../../data/sun-garden-rooms';
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

  protected readonly isPortrait = isPortrait;

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
