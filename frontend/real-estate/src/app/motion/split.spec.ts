import { Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MotionEngine } from './engine';
import { MotionService } from './motion.service';
import { Split } from './split';

@Component({
  imports: [Split],
  template: `<h2><app-split text="Một góc Đà Lạt" em="của riêng bạn" /></h2><p><app-split text="Sương sớm, gỗ ấm" mode="fill" /></p>`,
})
class Host {}

describe('app-split', () => {
  it('exposes the source text once to assistive technology', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const readable = (el: Element) =>
      [...el.querySelectorAll('.sr-only')].map((n) => n.textContent?.replace(/\s+/g, ' ').trim()).join(' ');
    expect(readable(root.querySelector('h2')!)).toBe('Một góc Đà Lạt của riêng bạn');
    expect(readable(root.querySelector('p')!)).toBe('Sương sớm, gỗ ấm');
    for (const visual of root.querySelectorAll('.split-visual')) {
      expect(visual.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders the visible text on the server (no JavaScript needed to read it)', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const visual = fixture.nativeElement.querySelector('h2 .split-visual') as HTMLElement;
    expect(visual.textContent?.replace(/\s+/g, ' ').trim()).toBe('Một góc Đà Lạt của riêng bạn');
  });
});

describe('app-split rebuild with a splitting engine', () => {
  @Component({
    imports: [Split],
    template: `<h2><app-split [text]="text()" [em]="em()" /></h2>`,
  })
  class Dynamic {
    readonly text = signal('Một góc Đà Lạt');
    readonly em = signal<string | undefined>('của riêng bạn');
  }

  // Like the real SplitText: replaces the target's children with its own spans.
  const engine = {
    gsap: {
      context: (fn: () => void) => {
        fn();
        return { revert: () => {} };
      },
      matchMedia: () => ({ add: (_q: string, fn: () => void) => fn(), revert: () => {} }),
      from: () => ({}),
      fromTo: () => ({}),
    },
    SplitText: {
      create: (el: HTMLElement, vars: { onSplit?: (s: { words: Element[] }) => void }) => {
        const word = document.createElement('div');
        word.textContent = el.textContent;
        el.replaceChildren(word);
        vars.onSplit?.({ words: [word] });
        return {};
      },
    },
  } as unknown as MotionEngine;

  const handleError = vi.fn();

  beforeEach(() => {
    handleError.mockReset();
    vi.stubGlobal('innerHeight', 0);
    TestBed.configureTestingModule({
      providers: [
        { provide: MotionService, useValue: { ready: () => Promise.resolve(engine) } },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the copies in sync when text and em change after the split', async () => {
    const fixture = TestBed.createComponent(Dynamic);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    const root: HTMLElement = fixture.nativeElement;
    const norm = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
    const check = (expected: string) => {
      expect(norm(root.querySelector('.sr-only'))).toBe(expected);
      expect(norm(root.querySelector('.split-visual'))).toBe(expected);
      expect(root.querySelector('.split-visual')?.getAttribute('aria-hidden')).toBe('true');
    };
    const step = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r));
      fixture.detectChanges();
    };
    fixture.componentInstance.text.set('Sương sớm');
    await step();
    check('Sương sớm của riêng bạn');
    fixture.componentInstance.em.set(undefined);
    await step();
    check('Sương sớm');
    fixture.componentInstance.em.set('gỗ ấm');
    await step();
    check('Sương sớm gỗ ấm');
    expect(handleError).not.toHaveBeenCalled();
  });
});
