import { Directive, ElementRef, inject } from '@angular/core';
import { MOTION_QUERIES } from './motion-prefs';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/**
 * Lights-on (daylight bloom) for large photos (≥ 40vw): a mist veil fades, a warm wash pulses,
 * the image settles from 1.05. Put on a `.lights` wrapper containing one <img>.
 */
@Directive({ selector: '[appReveal]' })
export class RevealDirective {
  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    onMotion((engine) => {
      const img = host.querySelector('img');
      if (!img || inView(host)) return;
      const veil = Object.assign(document.createElement('span'), { className: 'lights-veil' });
      const warm = Object.assign(document.createElement('span'), { className: 'lights-warm' });
      veil.setAttribute('aria-hidden', 'true');
      warm.setAttribute('aria-hidden', 'true');
      host.append(veil, warm);
      const mm = engine.gsap.matchMedia();
      mm.add(MOTION_QUERIES.allowed, () => {
        engine.gsap
          .timeline({ scrollTrigger: { trigger: host, start: 'top 85%', end: 'top 40%', scrub: true } })
          .fromTo(veil, { opacity: 1 }, { opacity: 0, ease: 'none' }, 0)
          .fromTo(img, { scale: 1.05 }, { scale: 1, ease: 'none' }, 0)
          .fromTo(warm, { opacity: 0 }, { opacity: 1, ease: 'sine.inOut', yoyo: true, repeat: 1, duration: 0.5 }, 0);
      });
      return () => {
        mm.revert();
        veil.remove();
        warm.remove();
      };
    });
  }
}
