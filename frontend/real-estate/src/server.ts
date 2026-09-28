import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { isDevMode } from '@angular/core';
import express, { NextFunction, Request, Response as ExpressResponse } from 'express';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { LANGS, Lang, RenderContext, splitLangPrefix, withLangPrefix } from './app/i18n/lang';
import { contentSecurityPolicy, stampScriptNonces } from './csp';
import { environment } from './environments/environment';

const browserDistFolder = join(import.meta.dirname, '../browser');

// On Vercel every request arrives through Vercel's own proxy, which sets X-Forwarded-Proto.
const onVercel = !!process.env['VERCEL'];

const app = express();
// Trust only the protocol header (for https canonical URLs); the host still comes from Host,
// which is validated against `allowedHosts`. X-Forwarded-Prefix is always set below, never the client's.
const angularApp = new AngularNodeAppEngine({ trustProxyHeaders: ['x-forwarded-proto', 'x-forwarded-prefix'] });

app.disable('x-powered-by');
// Honour X-Forwarded-Proto from Vercel, or from a reverse proxy on the same machine (e.g. nginx).
app.set('trust proxy', onVercel ? true : 'loopback');
app.use(securityHeaders);

const origin = (req: Request) => `${req.protocol}://${req.get('host')}`;

const apiUrl = (process.env['SERVER_API_URL'] || environment.apiUrl).replace(/\/+$/, '');
const internalApiKey = process.env['INTERNAL_API_KEY'] ?? '';

/**
 * Hardening headers on every response (pages, files, robots, sitemap): no MIME sniffing, no
 * framing (clickjacking, e.g. of /admin), no full URLs leaked to other sites, powerful browser
 * features off, and HTTPS remembered by the browser.
 */
function securityHeaders(req: Request, res: ExpressResponse, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=63072000');
  next();
}

const apiOrigin = new URL(environment.apiUrl).origin;

/** Adds the CSP (with a fresh nonce) to an HTML page; other responses pass through unchanged. */
async function withContentSecurityPolicy(response: Response, https: boolean): Promise<Response> {
  if (isDevMode() || !response.headers.get('content-type')?.includes('text/html')) return response;

  const nonce = randomBytes(16).toString('base64');
  const html = stampScriptNonces(await response.text(), nonce);
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce, apiOrigin, https));
  headers.delete('content-length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/** Slugs of the published apartments, for the sitemap. Empty if the API is unreachable. */
async function apartmentSlugs(): Promise<string[]> {
  try {
    const headers: Record<string, string> = {};
    if (internalApiKey) headers['X-Internal-Key'] = internalApiKey;
    const response = await fetch(`${apiUrl}/api/v1/apartments`, { headers, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return [];
    const body = (await response.json()) as { data: { slug: string }[] };
    return body.data.map((apartment) => apartment.slug);
  } catch {
    return [];
  }
}

/**
 * SEO: robots.txt + sitemap.xml, built from the live apartment list and the requesting domain.
 * The booking flow is private, so crawlers are kept out of it.
 */
app.get('/robots.txt', (req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(
      `User-agent: *\nAllow: /\nDisallow: /book\nDisallow: /en/book\nDisallow: /admin\n\nSitemap: ${origin(req)}/sitemap.xml\n`,
    );
});

app.get('/sitemap.xml', async (req, res) => {
  const base = origin(req);
  const slugs = await apartmentSlugs();
  const paths = [
    '/',
    '/about',
    '/contact',
    ...slugs.flatMap((slug) =>
      ['/apartment', '/gallery', '/availability', '/location'].map((p) => `${p}?apt=${slug}`),
    ),
  ];
  const xmlUrl = (lang: Lang, p: string) => escapeXml(base + withLangPrefix(lang, p));
  // Every page in each language, each listing its translations (hreflang) for search engines.
  const urls = paths
    .flatMap((p) => {
      const alternates = LANGS.map(
        (lang) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${xmlUrl(lang, p)}"/>`,
      ).join('');
      return LANGS.map((lang) => `  <url><loc>${xmlUrl(lang, p)}</loc>${alternates}</url>`);
    })
    .join('\n');
  res
    .type('application/xml')
    .set('Cache-Control', 'public, max-age=3600')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
    );
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 * English pages live under /en: the prefix is removed so the route (and its render mode and
 * headers) matches as usual, and the app gets the language, and its /en/ base URL, from the context.
 */
app.use((req, res, next) => {
  const { lang, path } = splitLangPrefix(req.originalUrl);
  // Angular reads originalUrl (falling back to url), so both must be the unprefixed path.
  req.url = req.originalUrl = path;
  // Keeps Angular's own redirects (unknown page → home) inside /en.
  delete req.headers['x-forwarded-prefix'];
  if (lang === 'en') req.headers['x-forwarded-prefix'] = '/en';
  const context: RenderContext = { lang };
  angularApp
    .handle(req, context)
    .then(async (response) => {
      if (!response) return next();
      return writeResponseToNodeResponse(await withContentSecurityPolicy(response, req.secure), res);
    })
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
