import { Component, ElementRef, computed, effect, inject, input } from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApartmentHeader } from '../../components/apartment-header/apartment-header';
import { ApartmentNotFound } from '../../components/apartment-not-found/apartment-not-found';
import { Lightbox } from '../../components/lightbox/lightbox';
import { galleryChapters, isPortrait, photoAlt } from '../../data/sun-garden-rooms';
import { Photo } from '../../models/apartment';
import { MOTION_QUERIES } from '../../motion/motion-prefs';
import { onMotion } from '../../motion/on-motion';
import { ApartmentService } from '../../services/apartment.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-gallery',
  imports: [NgOptimizedImage, NgTemplateOutlet, RouterLink, TranslocoPipe, ApartmentHeader, ApartmentNotFound, Lightbox],
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

  /** Chapter `index` as shown on the page: "01", "02"… */
  protected number(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    onMotion(({ gsap }) => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES.allowed, () => {
        // Photos below the fold open with a wipe up while the picture settles from a slight zoom.
        // Ones already on screen are left alone: no flash, and the first photo stays the LCP.
        for (const frame of host.querySelectorAll<HTMLElement>('[data-photo]')) {
          if (frame.getBoundingClientRect().top < window.innerHeight) continue;
          gsap
            .timeline({ scrollTrigger: { trigger: frame, start: 'top 90%', once: true } })
            .fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.out' })
            .fromTo(frame.querySelector('[data-photo-inner]'), { scale: 1.2 }, { scale: 1, duration: 1.6, ease: 'expo.out' }, 0);
        }
        // The second column drifts against the first as the chapter passes.
        for (const column of host.querySelectorAll<HTMLElement>('[data-drift]')) {
          gsap.fromTo(column, { y: 48 }, { y: -48, ease: 'none', scrollTrigger: { trigger: column.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
        }
        // Each pinned title's hairline fills as its chapter scrolls by.
        for (const bar of host.querySelectorAll<HTMLElement>('[data-progress]')) {
          gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: bar.closest('section'), start: 'top 70%', end: 'bottom 70%', scrub: true } });
        }
      });
      return () => mm.revert();
    });

    const seo = inject(SeoService);
    effect(() => {
      const apt = this.apartment();
      if (apt) seo.updateForApartment(apt, { label: 'apartment.tabs.gallery', path: '/gallery' });
    });
  }
}
