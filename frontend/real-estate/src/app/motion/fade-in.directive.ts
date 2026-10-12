import { Directive, ElementRef, inject } from '@angular/core';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/** Gallery thumbnails: a 300 ms fade the first time they come into view. */
@Directive({ selector: '[appFadeIn]' })
export class FadeInDirective {
  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    onMotion((engine) => {
      if (inView(host, 1)) return;
      engine.gsap.from(host, { opacity: 0, duration: 0.3, ease: 'power1.out', scrollTrigger: { trigger: host, start: 'top 95%', once: true } });
    });
  }
}
