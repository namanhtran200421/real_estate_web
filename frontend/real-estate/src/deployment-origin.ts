/**
 * Public site origin for canonical links, robots.txt and sitemap.xml.
 *
 * Request Host is intentionally not used in production because it is client-controlled and these
 * responses can be cached. Vercel's URL variables omit the scheme; an explicit PUBLIC_SITE_URL is
 * useful for a custom domain or another hosting provider.
 */
export function deploymentOrigin(env: Record<string, string | undefined>): string | undefined {
  const production = env['NODE_ENV'] === 'production';
  const explicit = env['PUBLIC_SITE_URL']?.trim();
  const vercelHost = (env['VERCEL_PROJECT_PRODUCTION_URL'] || env['VERCEL_URL'])?.trim();
  const candidate = explicit || (vercelHost ? `https://${vercelHost}` : '');
  if (!candidate) {
    if (production) {
      throw new Error('PUBLIC_SITE_URL or a Vercel deployment URL is required in production');
    }
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('PUBLIC_SITE_URL (or the Vercel deployment URL) must be a valid absolute URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (production && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `PUBLIC_SITE_URL must contain only an ${production ? 'https' : 'http(s)'} origin, without credentials, path, query or fragment`,
    );
  }
  return url.origin;
}
