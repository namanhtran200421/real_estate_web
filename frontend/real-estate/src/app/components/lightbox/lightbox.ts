import { ApplicationRef, Component, ElementRef, PLATFORM_ID, inject, input, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { imageLoader } from '../../image-loader';
import { Photo } from '../../models/apartment';
import { MotionService } from '../../motion/motion.service';
import { matches } from '../../motion/motion-prefs';

export function step(index: number, delta: number, total: number): number {
  if (total <= 1) return 0;
  return (index + delta + total) % total;
}

/** Full-screen photo viewer: native modal dialog (Esc and Android back close it), arrows and swipe. */
@Component({
  selector: 'app-lightbox',
  imports: [TranslocoPipe],
  template: `
    <dialog #dialog class="lightbox" (close)="closed()" (keydown.arrowLeft)="go(-1)" (keydown.arrowRight)="go(1)" [attr.aria-label]="'gallery.lightbox.label' | transloco">
      @if (shown() && photos()[index()]; as photo) {
        <img #image [src]="large(photo.src)" [alt]="photo.alt" class="lightbox-img" (pointerdown)="swipeStart($event)" (pointerup)="swipeEnd($event)" />
      }
      <p class="lightbox-pos" aria-live="polite">{{ 'gallery.lightbox.position' | transloco: { n: index() + 1, total: photos().length } }}</p>
      <button type="button" class="lightbox-btn left-4" (click)="go(-1)" [attr.aria-label]="'gallery.lightbox.previous' | transloco">‹</button>
      <button type="button" class="lightbox-btn right-4" (click)="go(1)" [attr.aria-label]="'gallery.lightbox.next' | transloco">›</button>
      <button type="button" class="lightbox-close" (click)="dialog.close()" [attr.aria-label]="'gallery.lightbox.close' | transloco">×</button>
    </dialog>
  `,
})
export class Lightbox {
  /** In the gallery's (chapter) order, so previous/next follow what the guest sees on the page. */
  readonly photos = input.required<Photo[]>();
  protected readonly index = signal(0);
  /** The large photo is only rendered while the viewer is open, so a closed one downloads nothing. */
  protected readonly shown = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly image = viewChild<ElementRef<HTMLImageElement>>('image');
  private readonly motion = inject(MotionService);
  private readonly appRef = inject(ApplicationRef);
  private returnFocus?: HTMLElement;
  private startX = 0;

  constructor() {
    // Browser only: the server DOM has no <dialog> API (close() throws "NotYetImplemented").
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // Any navigation (browser back, iOS swipe-back) closes the viewer; (close) then cleans up.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const dialog = this.dialog()?.nativeElement;
        if (dialog?.open) dialog.close();
      });
  }

  /** The 1600 px WebP the build makes for every photo, not the ~440 kB original JPEG. */
  protected large(src: string): string {
    return imageLoader({ src, width: 1600 });
  }

  open(index: number, from?: HTMLElement): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;
    this.returnFocus = (from?.closest('button') as HTMLElement | null) ?? from;
    const show = async () => {
      this.index.set(index);
      this.shown.set(true);
      this.appRef.tick();
      dialog.showModal();
      document.documentElement.classList.add('has-dialog');
      this.motion.engine()?.pause();
      await this.image()?.nativeElement.decode().catch(() => undefined);
    };
    const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
    if (doc.startViewTransition && matches('allowed') && from) {
      from.style.viewTransitionName = 'lightbox-photo';
      doc.startViewTransition(async () => {
        from.style.viewTransitionName = '';
        await show();
      });
    } else {
      void show();
    }
  }

  protected go(delta: number): void {
    this.index.update((i) => step(i, delta, this.photos().length));
  }

  protected closed(): void {
    this.shown.set(false);
    document.documentElement.classList.remove('has-dialog');
    this.motion.engine()?.resume();
    this.returnFocus?.focus();
  }

  protected swipeStart(e: PointerEvent): void {
    this.startX = e.clientX;
  }

  protected swipeEnd(e: PointerEvent): void {
    const dx = e.clientX - this.startX;
    if (Math.abs(dx) > 50) this.go(dx < 0 ? 1 : -1);
  }
}
