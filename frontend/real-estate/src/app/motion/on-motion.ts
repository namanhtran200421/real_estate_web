import { DestroyRef, afterNextRender, inject } from '@angular/core';
import type { MotionEngine } from './engine';
import { MotionService } from './motion.service';

/**
 * Runs `setup` after this component renders in the browser, on story pages with motion allowed.
 * Animations created inside are collected in a gsap context and reverted on destroy, together
 * with the cleanup function `setup` may return. Never set signals from GSAP callbacks.
 */
export function onMotion(setup: (engine: MotionEngine) => void | (() => void)): void {
  const motion = inject(MotionService);
  let destroyed = false;
  let revert: (() => void) | undefined;
  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    revert?.();
  });
  afterNextRender(() => {
    void motion.ready().then((engine) => {
      if (!engine || destroyed) return;
      let cleanup: void | (() => void);
      const context = engine.gsap.context(() => {
        cleanup = setup(engine);
      });
      revert = () => {
        if (typeof cleanup === 'function') cleanup();
        context.revert();
      };
    });
  });
}
