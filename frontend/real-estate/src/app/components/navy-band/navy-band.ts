import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Split } from '../../motion/split';

/** Night: a navy band with a heading, projected content and a gold CTA. */
@Component({
  selector: 'app-navy-band',
  imports: [RouterLink, Split],
  template: `
    <section class="band-navy relative overflow-x-clip py-24 md:py-32">
      <div class="container-editorial relative z-10 max-w-6xl">
        <p class="label-caps text-accent-deep">{{ eyebrow() }}</p>
        <h2 class="display-section mt-4 max-w-3xl"><app-split [text]="title()" [em]="em()" /></h2>
        <ng-content />
        <a class="btn btn-primary mt-12" [routerLink]="ctaLink()" [queryParams]="ctaQuery()">{{ ctaLabel() }} →</a>
        <ng-content select="[bandAfter]" />
      </div>
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
