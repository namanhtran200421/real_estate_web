import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { IMAGE_CONFIG, IMAGE_LOADER, ViewportScroller, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localeVi from '@angular/common/locales/vi';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
} from '@angular/router';

import { routes } from './app.routes';
import { adminAuthInterceptor } from './admin/admin-auth.service';
import { apiInterceptor } from './core/api';
import { GuestPagesPreloading } from './core/preloading';
import { provideI18n } from './i18n/i18n';
import { imageLoader } from './image-loader';
import imageWidths from './image-widths.json';
import { SeoTitleStrategy } from './services/seo-title.strategy';

// Vietnamese number/date formats (e.g. 1.700.000 ₫); English uses Angular's built-in data.
registerLocaleData(localeVi);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // Page chunks are lazy; fetch the guest pages in the background once the first page is up.
      withPreloading(GuestPagesPreloading),
    ),
    // Server HTML is reused instead of re-rendered; clicks before hydration are replayed.
    provideClientHydration(withEventReplay(), withIncrementalHydration()),
    // API calls; GET responses made during server rendering are embedded in the page and reused.
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor, adminAuthInterceptor])),
    { provide: TitleStrategy, useClass: SeoTitleStrategy },
    { provide: IMAGE_LOADER, useValue: imageLoader },
    // Offscreen images load lazily (NgOptimizedImage's default); srcset lists only the sizes that exist.
    { provide: IMAGE_CONFIG, useValue: { breakpoints: imageWidths } },
    // Keep #anchor targets clear of the sticky header.
    provideAppInitializer(() => inject(ViewportScroller).setOffset([0, 104])),
    // Vietnamese at /, English at /en: translations, date/number locale and the base URL.
    provideI18n(),
  ],
};
