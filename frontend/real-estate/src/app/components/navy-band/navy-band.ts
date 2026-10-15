import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParallaxDirective } from '../../motion/parallax.directive';
import { Split } from '../../motion/split';

/** Night: a navy band with drifting pine ridges, a heading, projected content and a gold CTA. */
@Component({
  selector: 'app-navy-band',
  imports: [RouterLink, ParallaxDirective, Split],
  template: `
    <section class="band-navy relative overflow-x-clip py-24 md:py-32">
      <div class="container-editorial relative z-10 max-w-6xl">
        <p class="label-caps text-accent-deep">{{ eyebrow() }}</p>
        <h2 class="display-section mt-4 max-w-3xl"><app-split [text]="title()" [em]="em()" /></h2>
        <ng-content />
        <a class="btn btn-primary mt-12" [routerLink]="ctaLink()" [queryParams]="ctaQuery()">{{ ctaLabel() }} →</a>
      </div>
      <svg class="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
        <path [appParallax]="6" d="M0 120 L0 70 L80 54 L150 68 L240 40 L320 62 L410 46 L500 70 L590 44 L680 64 L770 38 L860 60 L950 46 L1040 66 L1130 50 L1200 60 L1200 120 Z" class="fill-navy-deep" opacity="0.7" />
        <path [appParallax]="3" d="M0 120 L0 96 L90 84 L170 98 L260 78 L350 94 L440 82 L530 100 L620 84 L710 98 L800 80 L890 96 L980 86 L1070 100 L1160 88 L1200 94 L1200 120 Z" class="fill-navy-deep" />
      </svg>
    </section>
  `,
})
export class NavyBand {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly em = input<string>();
  readonly ctaLabel = input.required<string>();
  readonly ctaLink = input.required<string>();
  readonly ctaQuery = input<Record<string, string>>();
}
