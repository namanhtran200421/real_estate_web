import { ApplicationInitStatus, ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { provideI18n } from '../../i18n/i18n';
import { Photo } from '../../models/apartment';
import { HeroCarousel } from './hero-carousel';

const photos = ['05', '14', '10', '16', '03'].map((f) => ({ src: `apartments/${f}.jpg`, alt: `Ảnh ${f}`, width: 1600, height: 1067 }) as unknown as Photo);

describe('HeroCarousel', () => {
  async function setup() {
    // jsdom has no matchMedia; reduced motion keeps autoplay (and its timers) out of the test.
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    // Embla measures with ResizeObserver and IntersectionObserver, which jsdom lacks.
    const Observer = class { observe() {} unobserve() {} disconnect() {} };
    window.ResizeObserver ??= Observer as unknown as typeof ResizeObserver;
    window.IntersectionObserver ??= Observer as unknown as typeof IntersectionObserver;
    await TestBed.configureTestingModule({ imports: [HeroCarousel], providers: [provideI18n()] }).compileComponents();
    await TestBed.inject(ApplicationInitStatus).donePromise;
    await firstValueFrom(TestBed.inject(TranslocoService).load('vi'));
    TestBed.inject(TranslocoService).setActiveLang('vi');
    const fixture = TestBed.createComponent(HeroCarousel);
    fixture.componentRef.setInput('photos', photos);
    return fixture;
  }

  it('is a labelled carousel region', async () => {
    const fixture = await setup();
    fixture.detectChanges();
    const region = (fixture.nativeElement as HTMLElement).querySelector('[role="region"]');
    expect(region?.getAttribute('aria-roledescription')).toBe('carousel');
  });

  it('mounts all five slides and labelled dots after the visitor engages', async () => {
    const fixture = await setup();
    fixture.detectChanges();
    await fixture.whenStable();
    window.dispatchEvent(new Event('pointerdown'));
    for (let i = 0; i < 4; i++) {
      TestBed.inject(ApplicationRef).tick();
      await fixture.whenStable();
    }
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[aria-roledescription="slide"]').length).toBe(5);
    const dots = [...el.querySelectorAll('.hero-dot')].map((d) => d.getAttribute('aria-label'));
    expect(dots).toEqual(['Ảnh 1/5', 'Ảnh 2/5', 'Ảnh 3/5', 'Ảnh 4/5', 'Ảnh 5/5']);
    expect(el.querySelectorAll('img[fetchpriority="high"]').length).toBe(1);
  });
});
