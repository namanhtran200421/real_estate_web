/**
 * Content-Security-Policy for rendered pages (used by server.ts).
 *
 * Scripts run only from this site, Cloudflare Turnstile, or inline with the response's nonce, so
 * injected markup cannot execute. Styles may be inline (Angular and critical CSS use them). The
 * browser talks only to our API and Turnstile, frames only Turnstile and Google Maps, and the
 * page itself cannot be framed.
 */
export function contentSecurityPolicy(nonce: string, apiOrigin: string, https: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${apiOrigin} https://challenges.cloudflare.com`,
    'frame-src https://challenges.cloudflare.com https://www.google.com https://maps.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (https) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/**
 * `<script` start tags that run code and carry no nonce yet: JSON data blocks (transfer state,
 * JSON-LD) are left alone. Angular escapes every value it renders and the JSON blocks escape
 * "<", so each such tag in a rendered page was written by Angular itself (hydration event
 * replay, critical CSS loader, the app bundle), never by data.
 */
const EXECUTABLE_SCRIPT = /<script(?=[\s>])(?![^>]*\bnonce=)(?![^>]*\btype=["']?application\/(?:ld\+)?json)/gi;

/** Gives every executable `<script>` in a rendered page the response's nonce. */
export function stampScriptNonces(html: string, nonce: string): string {
  return html.replace(EXECUTABLE_SCRIPT, `<script nonce="${nonce}"`);
}
