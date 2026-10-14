import { Directive, ElementRef, inject, input } from '@angular/core';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/** SVG route lines draw in once when they come into view. */
@Directive({ selector: '[appDrawPath]' })
export class DrawPathDirective {
  readonly drawDelay = input(0);

  constructor() {
    const path = inject(ElementRef<SVGGeometryElement>).nativeElement as SVGGeometryElement;
    onMotion((engine) => {
      if (typeof SVGGeometryElement === 'undefined' || !(path instanceof SVGGeometryElement) || inView(path, 0.9)) return;
      let length = 0;
      try {
        length = path.getTotalLength();
      } catch {
        return;
      }
      if (!length) return;
      engine.gsap.fromTo(
        path,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 1.2, delay: this.drawDelay(), ease: 'power2.inOut', scrollTrigger: { trigger: path, start: 'top 85%', once: true } },
      );
      return () => {
        path.style.strokeDasharray = '';
        path.style.strokeDashoffset = '';
      };
    });
  }
}
