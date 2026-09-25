import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request } from 'express';
import { join } from 'node:path';
import { APARTMENTS } from './app/data/apartments.mock';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.disable('x-powered-by');
// Honour X-Forwarded-Proto from a reverse proxy on the same machine (e.g. nginx), for correct https URLs.
app.set('trust proxy', 'loopback');

const origin = (req: Request) => `${req.protocol}://${req.get('host')}`;

/**
 * SEO: robots.txt + sitemap.xml, built from the live apartment list and the requesting domain.
 * The booking flow is private, so crawlers are kept out of it.
 */
app.get('/robots.txt', (req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(`User-agent: *\nAllow: /\nDisallow: /book\n\nSitemap: ${origin(req)}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const base = origin(req);
  const paths = [
    '/',
    '/about',
    '/contact',
    ...APARTMENTS.flatMap((a) =>
      ['/apartment', '/gallery', '/availability', '/location'].map((p) => `${p}?apt=${a.slug}`),
    ),
  ];
  const urls = paths
    .map((p) => `  <url><loc>${(base + p).replace(/&/g, '&amp;')}</loc></url>`)
    .join('\n');
  res
    .type('application/xml')
    .set('Cache-Control', 'public, max-age=3600')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
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
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
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
