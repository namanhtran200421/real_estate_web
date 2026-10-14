import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { provideRouter } from '@angular/router';
import { provideI18n } from '../../i18n/i18n';
import { ApartmentService } from '../../services/apartment.service';
import { Policy } from './policy';

async function render(percent?: number) {
  await TestBed.configureTestingModule({
    imports: [Policy],
    providers: [
      provideRouter([]),
      provideI18n(),
      { provide: ApartmentService, useValue: { resolve: () => (percent === undefined ? undefined : { depositPercent: percent }) } },
    ],
  }).compileComponents();
  // TestBed does not wait for async app initializers; the language file loads in one.
  await TestBed.inject(ApplicationInitStatus).donePromise;
  // The app initializer does this before the first render in the real app.
  await firstValueFrom(TestBed.inject(TranslocoService).load('vi'));
  TestBed.inject(TranslocoService).setActiveLang('vi');
  const fixture = TestBed.createComponent(Policy);
  for (let i = 0; i < 4; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return fixture.nativeElement as HTMLElement;
}

describe('Policy', () => {
  it('renders the 21 items under one heading', async () => {
    const el = await render(25);
    expect(el.querySelectorAll('article[id^="item-"]').length).toBe(21);
    expect(el.querySelector('h1')?.textContent).toContain('Chính sách lưu trú');
    expect(el.querySelector('#item-1 h2')?.textContent).toContain('1. Thời gian nhận và trả phòng');
  });

  it('fills the deposit percent of the apartment into item 2', async () => {
    const el = await render(25);
    const text = el.querySelector('#item-2')!.textContent!;
    expect(text).toContain('25%');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('20%');
  });

  it('falls back to 20% when no apartment is published', async () => {
    const el = await render();
    expect(el.querySelector('#item-2')!.textContent).toContain('20%');
  });

  it('lists the five check-out steps as an ordered list', async () => {
    const el = await render(20);
    expect(el.querySelectorAll('#item-21 ol li').length).toBe(5);
  });

  it('links each item from the contents list with a fragment', async () => {
    const el = await render(20);
    expect(el.querySelectorAll('nav a').length).toBe(21);
  });
});
