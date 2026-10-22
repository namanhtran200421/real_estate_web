import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';

/**
 * Hash-based script policy for completed SSR HTML. Hashes can be cached with the HTML without
 * sharing a nonce between visitors. Styles remain inline for Angular and critical CSS.
 */
export function contentSecurityPolicy(scriptHashes: readonly string[], apiOrigin: string, https: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')} https://challenges.cloudflare.com`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${apiOrigin} https://challenges.cloudflare.com`,
    'frame-src https://challenges.cloudflare.com https://www.google.com https://maps.google.com',
    "worker-src 'none'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (https) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

const JAVASCRIPT_TYPES = new Set([
  '', 'module', 'importmap', 'speculationrules',
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1',
  'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
  'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript',
]);

/**
 * Inspect renderer-owned scripts using an HTML parser, not a regular expression. Hash the
 * parsed inline text (including browser line-ending normalization), skip inert data and
 * external scripts, and remove legacy nonce attributes without reserializing the document.
 *
 * This is a final SSR transform, not a sanitizer: templates must continue escaping untrusted
 * data and must never insert raw executable markup from a guest or listing field.
 */
export function protectInlineScripts(html: string): { html: string; hashes: string[] } {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const hashes = new Set<string>();
  const nonceRanges: { startOffset: number; endOffset: number }[] = [];

  function visit(node: DefaultTreeAdapterMap['node']): void {
    if ('tagName' in node && node.tagName === 'script') {
      const nonce = node.sourceCodeLocation?.attrs?.['nonce'];
      if (nonce) nonceRanges.push(nonce);
      const type = node.attrs.find((attr) => attr.name === 'type')?.value.trim().toLowerCase() ?? '';
      const external = node.attrs.some((attr) => attr.name === 'src');
      if (!external && JAVASCRIPT_TYPES.has(type)) {
        const text = node.childNodes.filter((child) => 'value' in child).map((child) => child.value).join('');
        if (text) hashes.add(`'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`);
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }

  visit(document);
  for (const range of nonceRanges.sort((a, b) => b.startOffset - a.startOffset)) {
    html = html.slice(0, range.startOffset) + html.slice(range.endOffset);
  }
  return { html, hashes: [...hashes] };
}

export function inlineScriptHashes(html: string): string[] {
  return protectInlineScripts(html).hashes;
}
