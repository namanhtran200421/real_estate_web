import { Component, ElementRef, computed, effect, input, viewChild } from '@angular/core';
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
    <span class="split-visual" aria-hidden="true" #visual>{{ text() }}@if (em()) {&ngsp;<em>{{ em() }}</em>}</span>
    @if (mode() === 'fill') {
      <span class="split-visual split-top" aria-hidden="true" #top>{{ text() }}@if (em()) {&ngsp;<em>{{ em() }}</em>}</span>
    }
  `,
})
export class Split {
  readonly text = input.required<string>();
  readonly em = input<string>();
  readonly mode = input<'lines' | 'fill'>('lines');

  protected readonly readable = computed(() => [this.text(), this.em()].filter(Boolean).join(' '));
  private readonly visual = viewChild.required<ElementRef<HTMLElement>>('visual');
  private readonly top = viewChild<ElementRef<HTMLElement>>('top');

  constructor() {
    let rebuild: (() => void) | undefined;
    // The split owns the visual copy's DOM after the first render; text changes rebuild it.
    effect(() => {
      this.readable();
      rebuild?.();
    });

    onMotion((engine) => {
      const visual = this.visual().nativeElement;
      if (inView(visual, 0.95)) return;
      const run = () => (this.mode() === 'fill' ? this.fill(engine) : this.lines(engine, visual));
      let undo = run();
      rebuild = () => {
        undo();
        for (const el of [visual, this.top()?.nativeElement]) {
          if (!el) continue;
          el.replaceChildren(document.createTextNode(this.text()));
          if (this.em()) el.append(' ', Object.assign(document.createElement('em'), { textContent: this.em() }));
        }
        undo = run();
      };
      return () => undo();
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

  private fill(engine: MotionEngine): () => void {
    const top = this.top()?.nativeElement;
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
