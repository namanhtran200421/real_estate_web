import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, Scroll } from '@angular/router';
import type { MotionEngine } from './engine';
import { matches } from './motion-prefs';
import { isStoryRoute } from './motion-routes';

/**
 * Runs the motion engine on story pages (Tier 1) and nowhere else. The engine chunk is imported
 * after the first render; navigating into a Tier 2 page tears it down (Lenis, ScrollTriggers, tweens).
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  /** Replaced in tests. */
  static loadEngine: () => Promise<MotionEngine> = () => import('./engine').then((m) => m.createEngine());

  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly engineState = signal<MotionEngine | undefined>(undefined);
  private readonly storyState = signal(false);
  private loading?: Promise<MotionEngine | undefined>;

  readonly engine = this.engineState.asReadonly();
  readonly story = this.storyState.asReadonly();

  /** Called once by App after the first render. */
  start(): void {
    if (!this.browser) return;
    this.onRoute();
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.onRoute();
      else if (event instanceof Scroll) this.onScroll(event);
    });
  }

  /** The engine on story pages with motion allowed; undefined anywhere else. */
  ready(): Promise<MotionEngine | undefined> {
    if (!this.browser || !this.storyState() || !matches('allowed')) return Promise.resolve(undefined);
    this.loading ??= MotionService.loadEngine()
      .then((engine) => {
        this.engineState.set(engine);
        return engine;
      })
      .catch(() => {
        // No engine (offline, blocked chunk): fall back to the static layouts (e.g. the plain room tour).
        document.documentElement.classList.remove('motion');
        return undefined;
      });
    return this.loading.then((engine) => {
      if (!this.storyState()) return undefined;
      engine?.enableSmoothScroll();
      return engine;
    });
  }

  private onRoute(): void {
    const story = isStoryRoute(this.router.routerState.snapshot.root);
    this.storyState.set(story);
    if (story) void this.ready();
    else this.engineState()?.teardown();
  }

  /** Forward navigation → top; back/forward → the saved position. Anchors stay with the router. */
  private onScroll(event: Scroll): void {
    const engine = this.engineState();
    if (!engine || !this.storyState() || event.anchor) return;
    const y = event.position ? event.position[1] : 0;
    requestAnimationFrame(() => {
      engine.refresh();
      engine.jumpTo(y);
    });
  }
}
