import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request } from 'express';
import { join } from 'node:path';
import { LANGS, Lang, RenderContext, splitLangPrefix, withLangPrefix } from './app/i18n/lang';
import { environment } from './environments/environment';

const browserDistFolder = join(import.meta.dirname, '../browser');

// On Vercel every request arrives through Vercel's own proxy, which sets X-Forwarded-Proto.
const onVercel = !!process.env['VERCEL'];

const app = express();
// Trust only the protocol header (for https canonical URLs); the host still comes from Host,
// which is validated against `allowedHosts`.
const angularApp = new AngularNodeAppEngine({ trustProxyHeaders: ['x-forwarded-proto'] });

app.disable('x-powered-by');
// Honour X-Forwarded-Proto from Vercel, or from a reverse proxy on the same machine (e.g. nginx).
app.set('trust proxy', onVercel ? true : 'loopback');

const origin = (req: Request) => `${req.protocol}://${req.get('host')}`;

const apiUrl = (process.env['SERVER_API_URL'] || environment.apiUrl).replace(/\/+$/, '');
const internalApiKey = process.env['INTERNAL_API_KEY'] ?? '';

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
  const xmlUrl = (lang: Lang, p: string) => (base + withLangPrefix(lang, p)).replace(/&/g, '&amp;');
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
  const context: RenderContext = { lang };
  angularApp
    .handle(req, context)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
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
