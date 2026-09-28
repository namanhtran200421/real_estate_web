import { TestBed } from '@angular/core/testing';
import { FunctionalTranspiler, TranslocoService, provideTransloco, provideTranslocoTranspiler } from '@jsverse/transloco';
import en from '../../i18n/en.json';
import vi from '../../i18n/vi.json';
import { LANG, PluralFunction } from './i18n';
import { splitLangPrefix, withLangPrefix } from './lang';

interface Tree {
  [key: string]: string | Tree;
}

const flatten = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value] as [string, string]] : flatten(value, `${prefix}${key}.`),
  );

const placeholders = (value: string) => [...new Set([...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].sort();

describe('translations', () => {
  const viStrings = new Map(flatten(vi));
  const enStrings = new Map(flatten(en));

  it('have the same keys in every language', () => {
    expect([...enStrings.keys()].sort()).toEqual([...viStrings.keys()].sort());
  });

  it('use the same placeholders in every language', () => {
    for (const [key, value] of viStrings) {
      expect(placeholders(enStrings.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });
});

describe('English plurals', () => {
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' } }),
        provideTranslocoTranspiler(FunctionalTranspiler),
        { provide: 'plural', useClass: PluralFunction },
        { provide: LANG, useValue: 'en' },
      ],
    });
    transloco = TestBed.inject(TranslocoService);
    transloco.setTranslation(en, 'en');
  });

  it('pick the singular for one and the plural otherwise', () => {
    expect(transloco.translate('common.nights', { count: 1 })).toBe('1 night');
    expect(transloco.translate('common.nights', { count: 3 })).toBe('3 nights');
    expect(transloco.translate('common.guests', { count: 0 })).toBe('0 guests');
  });

  it('handle several plurals in one sentence', () => {
    expect(transloco.translate('apartment.capacity', { guests: 4, bedrooms: 2, beds: 1, bathrooms: 1 })).toBe(
      '4 guests · 2 bedrooms · 1 bed · 1 bathroom',
    );
  });
});

describe('language URLs', () => {
  it('read English from the /en prefix and strip it', () => {
    expect(splitLangPrefix('/en/apartment?apt=x')).toEqual({ lang: 'en', path: '/apartment?apt=x' });
    expect(splitLangPrefix('/en')).toEqual({ lang: 'en', path: '/' });
    expect(splitLangPrefix('/en?apt=x')).toEqual({ lang: 'en', path: '/?apt=x' });
  });

  it('treat every other URL as Vietnamese', () => {
    expect(splitLangPrefix('/apartment')).toEqual({ lang: 'vi', path: '/apartment' });
    expect(splitLangPrefix('/english')).toEqual({ lang: 'vi', path: '/english' });
  });

  it('add the prefix for English only', () => {
    expect(withLangPrefix('en', '/')).toBe('/en');
    expect(withLangPrefix('en', '/book?apt=x')).toBe('/en/book?apt=x');
    expect(withLangPrefix('vi', '/book')).toBe('/book');
  });
});
