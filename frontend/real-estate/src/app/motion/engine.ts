/**
 * The motion engine: the only module that imports GSAP and Lenis (everything else uses
 * `import type`), so they land in one lazy chunk loaded by MotionService on story pages only.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { MOTION_QUERIES } from './motion-prefs';

gsap.registerPlugin(ScrollTrigger, SplitText);
gsap.ticker.lagSmoothing(0);
// Lets browser checks tell whether this chunk was loaded (it must never be on a direct Tier 2 load).
(globalThis as { __motionEngine?: boolean }).__motionEngine = true;

export interface MotionEngine {
  readonly gsap: typeof gsap;
  readonly ScrollTrigger: typeof ScrollTrigger;
  readonly SplitText: typeof SplitText;
  /** Lenis while smooth scrolling is on (desktop motion devices only). */
  smooth(): Lenis | null;
  enableSmoothScroll(): void;
  disableSmoothScroll(): void;
  /** Jumps to `y` without animating, keeping Lenis and ScrollTrigger in sync. */
  jumpTo(y: number): void;
  /** Dialogs: stop and restart smooth scrolling. */
  pause(): void;
  resume(): void;
  refresh(): void;
  /** Leaving the story pages: no smooth scroll, no ScrollTriggers, no running tweens. */
  teardown(): void;
}

export function createEngine(win: Window = window): MotionEngine {
  let lenis: Lenis | null = null;
  const tick = (time: number) => lenis?.raf(time * 1000);

  function enableSmoothScroll(): void {
    if (lenis || !win.matchMedia(MOTION_QUERIES.desktop).matches) return;
    lenis = new Lenis({
      autoRaf: false,
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
      anchors: false,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tick);
  }

  function disableSmoothScroll(): void {
    if (!lenis) return;
    gsap.ticker.remove(tick);
    lenis.destroy();
    lenis = null;
  }

  return {
    gsap,
    ScrollTrigger,
    SplitText,
    smooth: () => lenis,
    enableSmoothScroll,
    disableSmoothScroll,
    jumpTo(y) {
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else win.scrollTo(0, y);
      ScrollTrigger.update();
    },
    pause: () => lenis?.stop(),
    resume: () => lenis?.start(),
    refresh: () => ScrollTrigger.refresh(),
    teardown() {
      disableSmoothScroll();
      // Component contexts revert their own tweens on destroy; kill any trigger left behind.
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    },
  };
}
