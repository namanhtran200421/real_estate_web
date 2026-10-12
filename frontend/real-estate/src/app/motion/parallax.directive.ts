import { Directive, ElementRef, inject, input } from '@angular/core';
import { onMotion } from './on-motion';

/** Scroll-linked drift (never autoplaying): moves ±`appParallax` percent of the element's height. */
@Directive({ selector: '[appParallax]' })
export class ParallaxDirective {
  readonly appParallax = input(8);

  constructor() {
    const host = inject(ElementRef<Element>).nativeElement as Element;
    onMotion((engine) => {
      const range = this.appParallax();
      engine.gsap.fromTo(
        host,
        { yPercent: -range },
        { yPercent: range, ease: 'none', scrollTrigger: { trigger: host.parentElement ?? host, start: 'top bottom', end: 'bottom top', scrub: true } },
      );
    });
  }
}
