import {
  DOCUMENT,
  EnvironmentProviders,
  Injectable,
  InjectionToken,
  LOCALE_ID,
  REQUEST_CONTEXT,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import {
  FunctionalTranspiler,
  Translation,
  TranslocoLoader,
  TranslocoService,
  TranslocoTranspilerFunction,
  provideTransloco,
  provideTranslocoTranspiler,
} from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_LANG, LANGS, Lang, RenderContext, splitLangPrefix } from './lang';

/**
 * The page's language, fixed for the lifetime of the app (the language switch is a link to the
 * other URL). On the server, server.ts strips the /en prefix and passes the language along;
 * in the browser it is read from the URL.
 */
export const LANG = new InjectionToken<Lang>('LANG', {
  providedIn: 'root',
  factory: () => {
    const context = inject(REQUEST_CONTEXT, { optional: true }) as Partial<RenderContext> | null;
    return context?.lang ?? splitLangPrefix(inject(PlatformLocation).pathname).lang;
  },
});

/** Translations are bundled as one lazy chunk per language, so the server needs no HTTP to load them. */
@Injectable({ providedIn: 'root' })
export class TranslationLoader implements TranslocoLoader {
  getTranslation(lang: string): Promise<Translation> {
    const file = lang === 'en' ? import('../../i18n/en.json') : import('../../i18n/vi.json');
    return file.then((module) => module.default);
  }
}

/**
 * English plurals in translations: "{{ count }} [[ plural({{ count }}, night, nights) ]]" gives
 * "1 night" / "3 nights", using the language's plural rules (Intl.PluralRules, built into browsers).
 */
@Injectable()
export class PluralFunction implements TranslocoTranspilerFunction {
  private readonly rules = new Intl.PluralRules(inject(LANG));

  transpile(count: string, one: string, other: string): string {
    return this.rules.select(Number(count)) === 'one' ? one : other;
  }
}

/**
 * Transloco, set to the page's language before the first render (so server HTML and hydration
 * agree), plus the pieces that follow the language: date/number formats and the /en/ base URL.
 * Every router link and navigation stays language-neutral ("/book") and gets the prefix from the base URL.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    ...provideTransloco({
      config: {
        availableLangs: [...LANGS],
        defaultLang: DEFAULT_LANG,
        prodMode: !isDevMode(),
        missingHandler: { logMissingKey: isDevMode() },
      },
      loader: TranslationLoader,
    }),
    // "{{ param }}" placeholders, plus [[ plural(...) ]] (Transloco resolves the name through DI).
    provideTranslocoTranspiler(FunctionalTranspiler),
    { provide: 'plural', useClass: PluralFunction },
    { provide: LOCALE_ID, useFactory: () => inject(LANG) },
    { provide: APP_BASE_HREF, useFactory: () => (inject(LANG) === 'en' ? '/en/' : '/') },
    provideAppInitializer(() => {
      const lang = inject(LANG);
      const transloco = inject(TranslocoService);
      inject(DOCUMENT).documentElement.lang = lang;
      transloco.setActiveLang(lang);
      // Completes without a value if the app is destroyed first (e.g. an aborted server render).
      return firstValueFrom(transloco.load(lang), { defaultValue: undefined });
    }),
  ]);
}
