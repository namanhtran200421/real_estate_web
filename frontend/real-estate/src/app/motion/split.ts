import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, untracked, viewChild } from '@angular/core';
import type { MotionEngine } from './engine';
import { MOTION_QUERIES } from './motion-prefs';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/**
 * Text revealed line by line ('lines') or filled word by word from slate to navy ('fill').
 * Assistive tech reads the `.sr-only` copy; only the `aria-hidden` visual copy is split (by lines
 * and words, never characters, so Vietnamese marks stay whole). Server HTML shows the text as is.
 */
@Component({
  selector: 'app-split',
  host: { class: 'split', '[class.split-fill]': "mode() === 'fill'" },
  template: `
    <span class="sr-only">{{ readable() }}</span>
    @for (key of keys(); track key) {
      <span class="split-visual" aria-hidden="true" #visual>{{ text() }}@if (em()) {&ngsp;<em>{{ em() }}</em>}</span>
      @if (mode() === 'fill') {
        <span class="split-visual split-top" aria-hidden="true" #top>{{ text() }}@if (em()) {&ngsp;<em>{{ em() }}</em>}</span>
      }
    }
  `,
})
export class Split {
  readonly text = input.required<string>();
  readonly em = input<string>();
  readonly mode = input<'lines' | 'fill'>('lines');

  protected readonly readable = computed(() => [this.text(), this.em()].filter(Boolean).join(' '));
  /** Any change re-creates the visual copies (Angular owns their DOM; the split never hand-writes it). */
  private readonly renderKey = computed(() => `${this.mode()}|${this.text()}|${this.em() ?? ''}`);
  protected readonly keys = computed(() => [this.renderKey()]);
  private readonly visual = viewChild<ElementRef<HTMLElement>>('visual');
  private readonly top = viewChild<ElementRef<HTMLElement>>('top');

  constructor() {
    const injector = inject(Injector);
    let engine: MotionEngine | undefined;
    let undo: () => void = () => {};

    const split = () => {
      if (!engine) return;
      const { visual, top, fill } = untracked(() => ({
        visual: this.visual()?.nativeElement,
        top: this.top()?.nativeElement,
        fill: this.mode() === 'fill',
      }));
      if (!visual || inView(visual, 0.95)) return;
      undo = fill ? this.fill(engine, top) : this.lines(engine, visual);
    };

    // Runs before the view refreshes: revert the split of the old copies, then split the new ones after render.
    let first = true;
    effect(() => {
      this.renderKey();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        undo();
        undo = () => {};
        if (engine) afterNextRender(split, { injector });
      });
    });

    onMotion((e) => {
      engine = e;
      split();
      return () => {
        undo();
        engine = undefined;
      };
    });
  }

  private lines(engine: MotionEngine, visual: HTMLElement): () => void {
    const mm = engine.gsap.matchMedia();
    mm.add(MOTION_QUERIES.allowed, () => {
      engine.SplitText.create(visual, {
        type: 'lines,words',
        linesClass: 'split-line',
        aria: 'none',
        autoSplit: true,
        onSplit: (self) =>
          engine.gsap.from(self.words, {
            yPercent: 110,
            duration: 0.9,
            ease: 'expo.out',
            stagger: 0.04,
            scrollTrigger: { trigger: visual, start: 'top 85%', once: true },
          }),
      });
    });
    return () => mm.revert();
  }

  private fill(engine: MotionEngine, top: HTMLElement | undefined): () => void {
    if (!top) return () => {};
    const mm = engine.gsap.matchMedia();
    mm.add(MOTION_QUERIES.allowed, () => {
      engine.SplitText.create(top, {
        type: 'words',
        aria: 'none',
        autoSplit: true,
        onSplit: (self) =>
          engine.gsap.fromTo(
            self.words,
            { opacity: 0 },
            { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: top, start: 'top 80%', end: 'bottom 45%', scrub: true } },
          ),
      });
    });
    return () => mm.revert();
  }
}
