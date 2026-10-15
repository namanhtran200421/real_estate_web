import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, Router, RouterLink } from '@angular/router';
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

  /** Five windows: one photo per chapter (09, none for the text-only kitchen, 12, 13, 15 for Sun Garden). */
  protected readonly windows = computed(() => {
    const apt = this.featured();
    if (!apt) return [];
    const pick: Record<string, string> = { 'phong-khach': '09', 'phong-tam': '12', 'phong-ngu-1': '13', 'phong-ngu-2': '15' };
    return roomChapters(apt).map((chapter) => ({
      chapter,
      photo: chapter.textOnly ? undefined : (roomPhoto(apt, pick[chapter.id] ?? '') ?? chapter.photos[0]),
    }));
  });

  protected readonly promises = ['availability', 'prices', 'vietqr'].map((key) => `home.scenes.promises.${key}`);

  private readonly router = inject(Router);
  private morphed: HTMLElement | undefined;

  /**
   * Page transition: the clicked window's photo morphs into the apartment hero. The name is set
   * only now and cleared as soon as the navigation settles (done, cancelled or failed), so two
   * elements never share it. Modified clicks (new tab) do not navigate here, so they set nothing.
   */
  protected morph(event: Event): void {
    if (event instanceof MouseEvent && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    const img = (event.currentTarget as Element).querySelector('img');
    if (!img) return;
    this.clearMorph();
    img.style.viewTransitionName = 'apt-photo';
    this.morphed = img;
    const settled = this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError || e instanceof NavigationSkipped) {
        settled.unsubscribe();
        requestAnimationFrame(() => this.clearMorph());
      }
    });
  }

  private clearMorph(): void {
    if (this.morphed) this.morphed.style.viewTransitionName = '';
    this.morphed = undefined;
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
