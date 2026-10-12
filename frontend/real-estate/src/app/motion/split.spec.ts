import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
