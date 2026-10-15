import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentCard } from '../../components/apartment-card/apartment-card';
import { NavyBand } from '../../components/navy-band/navy-band';
import { RouteMap } from '../../components/route-map/route-map';
import { roomChapters, roomPhoto } from '../../data/sun-garden-rooms';
import { RevealDirective } from '../../motion/reveal.directive';
import { Split } from '../../motion/split';
import { inView } from '../../motion/in-view';
import { onMotion } from '../../motion/on-motion';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-home',
  imports: [ApartmentCard, DecimalPipe, NavyBand, NgOptimizedImage, RevealDirective, RouteMap, RouterLink, Split, TranslocoPipe],
  templateUrl: './home.html',
  host: { class: 'block' },
})
export class Home {
  private readonly apartments = inject(ApartmentService).all;

  protected readonly featured = computed(() => this.apartments()[0]);
  protected readonly others = computed(() => this.apartments().slice(1));

  /** Hero: centre pane (the one priority image) is also the phone hero. */
  protected readonly hero = computed(() => {
    const apt = this.featured();
    if (!apt) return undefined;
    return {
      centre: roomPhoto(apt, '05') ?? apt.photos[0],
      left: roomPhoto(apt, '04') ?? apt.photos[1],
      right: roomPhoto(apt, '14') ?? apt.photos[2],
      detail: roomPhoto(apt, '02') ?? apt.photos[3],
    };
  });

  /** Five windows: one photo per chapter (09, 08, 12, 13, 16 for Sun Garden). */
  protected readonly windows = computed(() => {
    const apt = this.featured();
    if (!apt) return [];
    const pick = ['09', '08', '12', '13', '16'];
    return roomChapters(apt).map((chapter, i) => ({
      chapter,
      photo: roomPhoto(apt, pick[i]) ?? chapter.photos[0],
    }));
  });

  protected readonly promises = ['availability', 'prices', 'vietqr'].map((key) => `home.scenes.promises.${key}`);

  /** Page transition: the clicked window's photo morphs into the apartment hero (named only now, never twice). */
  protected morph(event: Event): void {
    const img = (event.currentTarget as Element).querySelector('img');
    if (img) img.style.viewTransitionName = 'apt-photo';
  }

  constructor() {
    // Dusk: the five windows light up one after another (150 ms apart) when the row enters.
    onMotion((engine) => {
      const row = document.querySelector<HTMLElement>('[data-windows]');
      if (!row || inView(row)) return;
      const veils = [...row.querySelectorAll('[data-window] .window-veil')];
      engine.gsap.fromTo(veils, { opacity: 1 }, { opacity: 0, duration: 0.6, ease: 'power2.out', stagger: 0.15, scrollTrigger: { trigger: row, start: 'top 75%', once: true } });
    });
  }
}
