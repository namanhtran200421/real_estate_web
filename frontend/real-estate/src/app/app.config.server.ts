import { mergeApplicationConfig, ApplicationConfig, Provider } from '@angular/core';
import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { environment } from '../environments/environment';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_URL, INTERNAL_API_KEY } from './core/api';
import { SITE_ORIGIN } from './services/seo.service';
import { deploymentOrigin } from '../deployment-origin';

// Read at runtime on the server only; never part of the browser bundle.
const serverApiUrl = (process.env['SERVER_API_URL'] ?? '').replace(/\/+$/, '');
const siteOrigin = deploymentOrigin(process.env);

/**
 * When rendering reaches the API through another address (SERVER_API_URL), use it, and tell the
 * browser that responses cached under that address belong to its own API_URL.
 */
function apiAddressProviders(): Provider[] {
  if (!serverApiUrl) return [];
  return [
    { provide: API_URL, useValue: serverApiUrl },
    { provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP, useValue: { [serverApiUrl]: environment.apiUrl } },
  ];
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: INTERNAL_API_KEY, useFactory: () => process.env['INTERNAL_API_KEY'] ?? '' },
    { provide: SITE_ORIGIN, useValue: siteOrigin ?? '' },
    ...apiAddressProviders(),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
