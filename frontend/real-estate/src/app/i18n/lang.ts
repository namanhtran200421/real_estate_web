export const LANGS = ['vi', 'en'] as const;
export type Lang = (typeof LANGS)[number];

/** Vietnamese is the site's own language and keeps the plain URLs; English pages live under /en. */
export const DEFAULT_LANG: Lang = 'vi';
const EN_PREFIX = /^\/en(?=[/?#]|$)/;

/** What server.ts passes to each render (Angular's REQUEST_CONTEXT). */
export interface RenderContext {
  lang: Lang;
}

/** "/en/apartment?apt=x" → { lang: 'en', path: '/apartment?apt=x' }; unprefixed URLs are Vietnamese. */
export function splitLangPrefix(url: string): { lang: Lang; path: string } {
  if (!EN_PREFIX.test(url)) return { lang: DEFAULT_LANG, path: url };
  const path = url.replace(EN_PREFIX, '');
  return { lang: 'en', path: path.startsWith('/') ? path : `/${path}` };
}

/** "/apartment" → "/en/apartment" for English; unchanged for Vietnamese. */
export function withLangPrefix(lang: Lang, path: string): string {
  if (lang === DEFAULT_LANG) return path;
  return path === '/' ? '/en' : `/en${path}`;
}
