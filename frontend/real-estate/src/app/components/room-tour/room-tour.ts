import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink, Scroll } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Apartment } from '../../models/apartment';
import { roomChapters } from '../../data/sun-garden-rooms';
import { MOTION_QUERIES } from '../../motion/motion-prefs';
import { onMotion } from '../../motion/on-motion';
import { RevealDirective } from '../../motion/reveal.directive';

/** The page scroll position at which the pinned track shows the chapter starting at `chapterLeft`. */
export function scrollForChapter(chapterLeft: number, maxShift: number, start: number, end: number): number {
  if (maxShift <= 0) return start;
  const progress = Math.min(Math.max(chapterLeft / maxShift, 0), 1);
  return start + progress * (end - start);
}

/**
 * Walk through the apartment room by room. Desktop motion: the section's height is reserved in CSS,
 * the inner box sticks and the track moves sideways with scroll. Portrait phones: chapters stack
 * full screen (CSS sticky). Otherwise (reduced motion, no JS, landscape): a plain vertical list.
 */
@Component({
  selector: 'app-room-tour',
  imports: [NgOptimizedImage, RevealDirective, RouterLink, TranslocoPipe],
  templateUrl: './room-tour.html',
})
export class RoomTour {
  readonly apartment = input.required<Apartment>();

  /** Skip link: focus the point after the tour (a raw #href would resolve against <base href="/">). */
  protected skipTour(event: Event): void {
    event.preventDefault();
    document.getElementById('sau-tham-quan')?.focus();
  }
  protected readonly chapters = computed(() => roomChapters(this.apartment()));
  private readonly router = inject(Router);
  private readonly section = viewChild.required<ElementRef<HTMLElement>>('section');
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  constructor() {
    onMotion((engine) => {
      const mm = engine.gsap.matchMedia();
      mm.add(MOTION_QUERIES.pinTour, () => {
        const section = this.section().nativeElement;
        const track = this.track().nativeElement;
        const shift = () => Math.max(track.scrollWidth - window.innerWidth, 0);
        const tween = engine.gsap.to(track, {
          x: () => -shift(),
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true },
        });
        engine.gsap.to(section.querySelector('[data-progress]'), {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: true },
        });

        const goTo = (id: string) => {
          const chapter = track.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
          const st = tween.scrollTrigger;
          if (!chapter || !st) return;
          engine.jumpTo(scrollForChapter(chapter.offsetLeft - track.offsetLeft, shift(), st.start, st.end));
        };
        // Deep links (#phong-ngu-2): after the router's own anchor scroll (which lands on chapter 1,
        // the sticky box's position), correct to the chapter. Keyboard focus does the same.
        const ids = new Set(this.chapters().map((c) => c.id));
        if (ids.has(location.hash.slice(1))) requestAnimationFrame(() => goTo(location.hash.slice(1)));
        const routerScroll = this.router.events.subscribe((event) => {
          if (event instanceof Scroll && event.anchor && ids.has(event.anchor)) requestAnimationFrame(() => goTo(event.anchor!));
        });
        const onFocus = (e: FocusEvent) => {
          const chapter = (e.target as Element).closest<HTMLElement>('[data-chapter]');
          if (chapter) goTo(chapter.id);
        };
        track.addEventListener('focusin', onFocus);
        return () => {
          routerScroll.unsubscribe();
          track.removeEventListener('focusin', onFocus);
        };
      });
      return () => mm.revert();
    });
  }
}
