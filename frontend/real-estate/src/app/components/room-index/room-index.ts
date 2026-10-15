import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RoomChapter, photoAlt } from '../../data/sun-garden-rooms';
import { Photo } from '../../models/apartment';
import { MOTION_QUERIES } from '../../motion/motion-prefs';
import { onMotion } from '../../motion/on-motion';

/** The photo each room shows in the index (file number), so none repeats the hero or another room. */
const INDEX_FILE: Record<string, string> = { 'phong-khach': '09', bep: '01', 'phong-tam': '12', 'phong-ngu-1': '13', 'phong-ngu-2': '15' };

export interface RoomIndexItem {
  chapter: RoomChapter;
  photo?: Photo;
  /** `object-position` for photos that crop badly when centred. */
  position: string;
}

/** The chapter's index photo: the one named above, else its first. Text-only rooms have none. */
export function indexItems(chapters: RoomChapter[]): RoomIndexItem[] {
  return chapters.map((chapter) => {
    const file = INDEX_FILE[chapter.id];
    const photo = chapter.textOnly ? undefined : ((file && chapter.photos.find((p) => p.src.endsWith(`/${file}.jpg`))) || chapter.photos[0]);
    return { chapter, photo, position: chapter.id === 'phong-tam' ? '50% 15%' : '50% 50%' };
  });
}

/**
 * Home room index. Desktop with motion: names on the left, a sticky frame on the right; as each name
 * crosses the middle of the viewport it becomes active and the frame cross-fades to its photo (opacity
 * only, driven by classes). Everywhere else (phones, reduced motion, no JS): a stacked list with the
 * photos inline.
 */
@Component({
  selector: 'app-room-index',
  imports: [NgOptimizedImage, RouterLink, TranslocoPipe],
  templateUrl: './room-index.html',
})
export class RoomIndex {
  readonly chapters = input.required<RoomChapter[]>();
  readonly apartmentSlug = input.required<string>();

  protected readonly items = computed(() => indexItems(this.chapters()));

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private morphed: HTMLElement | undefined;

  protected alt(item: RoomIndexItem): string {
    return photoAlt(item.chapter, Math.max(item.chapter.photos.indexOf(item.photo!), 0), (key, params) => this.transloco.translate(key, params));
  }

  /**
   * Page transition: the clicked room's visible photo morphs into the apartment hero. The name is set
   * only now and cleared as soon as the navigation settles, so two elements never share it. Modified
   * clicks (new tab) do not navigate here, so they set nothing.
   */
  protected morph(event: Event, id: string): void {
    if (event instanceof MouseEvent && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    const img = [...this.root().nativeElement.querySelectorAll<HTMLElement>(`[data-photo="${id}"] img`)].find((i) => i.getBoundingClientRect().width > 0);
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
    onMotion((engine) => {
      const mm = engine.gsap.matchMedia();
      mm.add(MOTION_QUERIES.desktop, () => {
        const root = this.root().nativeElement;
        const rows = [...root.querySelectorAll<HTMLElement>('[data-room]')];
        const panes = [...root.querySelectorAll<HTMLElement>('[data-pane]')];
        const activate = (id: string) => {
          for (const row of rows) row.classList.toggle('is-active', row.dataset['room'] === id);
          for (const pane of panes) pane.classList.toggle('is-active', pane.dataset['pane'] === id);
        };
        root.classList.add('is-driven');
        activate(rows[0]?.dataset['room'] ?? '');
        for (const row of rows) {
          engine.ScrollTrigger.create({ trigger: row, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && activate(row.dataset['room']!) });
        }
        return () => {
          root.classList.remove('is-driven');
          for (const el of [...rows, ...panes]) el.classList.remove('is-active');
        };
      });
      return () => mm.revert();
    });
  }
}
