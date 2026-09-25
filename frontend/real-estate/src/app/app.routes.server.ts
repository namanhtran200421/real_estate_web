import { RenderMode, ServerRoute } from '@angular/ssr';

// Private booking pages: rendered in the browser only, and kept out of search engines.
const PRIVATE = { renderMode: RenderMode.Client, headers: { 'X-Robots-Tag': 'noindex, nofollow' } } as const;

export const serverRoutes: ServerRoute[] = [
  { path: 'book', ...PRIVATE },
  { path: 'book/review', ...PRIVATE },
  { path: 'book/payment', ...PRIVATE },
  { path: 'booking/manage', ...PRIVATE },
  { path: 'booking/:reference/confirmation', ...PRIVATE },
  // Public pages render on the server per request, so `?apt=` and data edited from
  // the owner dashboard are always reflected in the HTML that crawlers receive.
  // The CDN (e.g. Vercel's edge) may reuse a rendered page for 60s and refresh it in the background.
  {
    path: '**',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' },
  },
];
