import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { IMAGE_LOADER, ViewportScroller, registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localeVi from '@angular/common/locales/vi';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import {
  PreloadAllModules,
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
} from '@angular/router';

import { routes } from './app.routes';
import { adminAuthInterceptor } from './admin/admin-auth.service';
import { apiInterceptor } from './core/api';
import { imageLoader } from './image-loader';
import { SeoTitleStrategy } from './services/seo-title.strategy';

// Vietnamese number/date formats (e.g. 1.700.000 ₫).
registerLocaleData(localeVi);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // Page chunks are lazy; fetch the rest in the background once the first page is up.
      withPreloading(PreloadAllModules),
    ),
    // Server HTML is reused instead of re-rendered; clicks before hydration are replayed.
    provideClientHydration(withEventReplay(), withIncrementalHydration()),
    // API calls; GET responses made during server rendering are embedded in the page and reused.
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor, adminAuthInterceptor])),
    { provide: TitleStrategy, useClass: SeoTitleStrategy },
    { provide: IMAGE_LOADER, useValue: imageLoader },
    // Keep #anchor targets clear of the sticky header.
    provideAppInitializer(() => inject(ViewportScroller).setOffset([0, 104])),
    { provide: LOCALE_ID, useValue: 'vi' },
  ],
};
