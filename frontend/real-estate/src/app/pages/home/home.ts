import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HeroCarousel } from '../../components/hero-carousel/hero-carousel';
import { Photo } from '../../models/apartment';
import { ApartmentCard } from '../../components/apartment-card/apartment-card';
import { NavyBand } from '../../components/navy-band/navy-band';
import { RouteMap } from '../../components/route-map/route-map';
import { roomChapters, roomPhoto } from '../../data/sun-garden-rooms';
import { Split } from '../../motion/split';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-home',
  imports: [ApartmentCard, DecimalPipe, HeroCarousel, NavyBand, NgOptimizedImage, RouteMap, RouterLink, Split, TranslocoPipe],
  templateUrl: './home.html',
  host: { class: 'block' },
})
export class Home {
  private readonly apartments = inject(ApartmentService).all;

  protected readonly featured = computed(() => this.apartments()[0]);
  protected readonly others = computed(() => this.apartments().slice(1));

  /** Two rooms (the living room and the first bedroom), each linking to that room on the apartment page. */
  protected readonly rooms = computed(() => {
    const apt = this.featured();
    if (!apt) return [];
    return roomChapters(apt)
      .filter((chapter) => chapter.photos.length && (chapter.key === 'living' || chapter.key === 'bedroom1'))
      .slice(0, 2)
      .map((chapter) => ({ id: chapter.id, key: chapter.key, photo: chapter.photos[0] }));
  });

  /** Hero carousel photos (05 leads and is the LCP). */
  protected readonly hero = computed(() => {
    const apt = this.featured();
    if (!apt) return undefined;
    const slides = ['05', '14', '10', '16', '03'].map((file) => roomPhoto(apt, file)).filter((p): p is Photo => !!p);
    return {
      slides: slides.length === 5 ? slides : apt.photos.slice(0, 5),
    };
  });

  protected readonly promises = ['availability', 'prices', 'vietqr'].map((key) => `home.scenes.promises.${key}`);
}
