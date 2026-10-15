import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HeroCarousel } from '../../components/hero-carousel/hero-carousel';
import { RoomIndex } from '../../components/room-index/room-index';
import { Photo } from '../../models/apartment';
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
  imports: [ApartmentCard, DecimalPipe, HeroCarousel, NavyBand, NgOptimizedImage, RevealDirective, RoomIndex, RouteMap, RouterLink, Split, TranslocoPipe],
  templateUrl: './home.html',
  host: { class: 'block' },
})
export class Home {
  private readonly apartments = inject(ApartmentService).all;

  protected readonly featured = computed(() => this.apartments()[0]);
  protected readonly others = computed(() => this.apartments().slice(1));

  /** Hero carousel photos (05 leads and is the LCP) and the detail photo of the "place" section. */
  protected readonly hero = computed(() => {
    const apt = this.featured();
    if (!apt) return undefined;
    const slides = ['05', '14', '10', '16', '03'].map((file) => roomPhoto(apt, file)).filter((p): p is Photo => !!p);
    return {
      slides: slides.length === 5 ? slides : apt.photos.slice(0, 5),
      detail: roomPhoto(apt, '02') ?? apt.photos[3],
    };
  });

  protected readonly chapters = computed(() => {
    const apt = this.featured();
    return apt ? roomChapters(apt) : [];
  });

  protected readonly promises = ['availability', 'prices', 'vietqr'].map((key) => `home.scenes.promises.${key}`);

  constructor() {
    // The closing glow blooms as the closing call comes up (opacity only).
    onMotion((engine) => {
      const glow = document.querySelector<HTMLElement>('[data-final-glow]');
      if (!glow || inView(glow, 0.5)) return;
      engine.gsap.fromTo(glow, { opacity: 0.25 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: glow, start: 'top 90%', end: 'center 55%', scrub: true } });
    });
  }
}
