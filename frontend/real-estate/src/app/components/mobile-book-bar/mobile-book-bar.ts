import { Component, DestroyRef, afterNextRender, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Phones: "from {price} ₫ · Book" once the hero has scrolled away, hidden while the booking card shows. */
@Component({
  selector: 'app-mobile-book-bar',
  imports: [DecimalPipe, RouterLink, TranslocoPipe],
  template: `
    <div class="book-bar md:hidden" [class.is-shown]="shown()" [attr.inert]="shown() ? null : ''" role="region" [attr.aria-label]="'apartment.bookBar.label' | transloco">
      <p class="font-serif text-lg">{{ 'home.scenes.perNight' | transloco: { price: (price() | number) } }}</p>
      <a class="btn btn-primary min-h-12" routerLink="/book" [queryParams]="{ apt: slug() }">{{ 'apartment.bookBar.cta' | transloco }}</a>
    </div>
  `,
})
export class MobileBookBar {
  readonly slug = input.required<string>();
  readonly price = input.required<number>();
  /** Selectors of elements whose visibility hides the bar (the hero, the booking card). */
  readonly watch = input.required<string[]>();
  protected readonly shown = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const visible = new Set<Element>();
      const observer = new IntersectionObserver((entries) => {
        for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
        this.shown.set(visible.size === 0);
      });
      for (const selector of this.watch()) document.querySelectorAll(selector).forEach((el) => observer.observe(el));
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
