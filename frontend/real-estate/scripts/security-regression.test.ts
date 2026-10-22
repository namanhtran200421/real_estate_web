/** Pure CSP and deployment-contract checks. Built SSR/browser checks remain release validation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { contentSecurityPolicy, inlineScriptHashes, protectInlineScripts } from '../src/csp.ts';

const hash = (source: string) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`;
const source = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

/** Run the real pre-bundle boot script with deterministic readiness and timeout signals. */
async function loadingBoot(pathname = '/', motion = true) {
  const html = await source('../src/index.html');
  const script = html.match(/<script id="site-loading-boot">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  const events = new Map<string, () => void>();
  const wheel = new Map<string, unknown>();
  const timers = new Map<number, { callback: () => void; due: number }>();
  let clock = 0;
  let nextTimer = 0;
  const advanceTo = (time: number) => {
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > time) break;
      timers.delete(next[0]);
      clock = next[1].due;
      next[1].callback();
    }
    clock = time;
  };
  const root = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
  const loader = {
    hidden: true,
    setAttribute: (name: string, value: string) => attributes.set(`loader:${name}`, value),
    addEventListener: (name: string, callback: unknown) => wheel.set(name, callback),
    removeEventListener: (name: string) => wheel.delete(name),
  };
  const page = { lang: 'vi', classList: {
    add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name),
  } };
  runInNewContext(script, {
    document: { documentElement: page, querySelector: () => root, getElementById: () => loader },
    window: {
      matchMedia: () => ({ matches: motion }),
      addEventListener: (name: string, callback: () => void) => events.set(name, callback),
      removeEventListener: (name: string) => events.delete(name),
    },
    location: { pathname },
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++nextTimer;
      timers.set(id, { callback, due: clock + delay });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  return { attributes, classes, events, wheel, timers, page, loader, html, script, advanceTo };
}

test('early readiness starts the entrance at six seconds and cleans it up after the reveal', async () => {
  const boot = await loadingBoot('/en/');
  assert.equal(boot.page.lang, 'en');
  assert.equal(boot.loader.hidden, false);
  assert.equal(boot.attributes.get('aria-busy'), 'true');
  assert.ok(boot.attributes.has('inert') && boot.classes.has('site-loading'));
  const ready = boot.events.get('vnbooking:ready')!;
  ready();
  ready();
  boot.advanceTo(5999);
  assert.ok(boot.attributes.has('inert') && boot.classes.has('site-loading'));
  boot.advanceTo(6000);
  assert.ok(!boot.attributes.has('inert') && !boot.attributes.has('aria-busy'));
  assert.equal(boot.attributes.get('loader:aria-hidden'), 'true');
  assert.ok(boot.classes.has('site-entering'));
  assert.equal(boot.events.size + boot.wheel.size, 0);
  boot.advanceTo(7600);
  assert.equal(boot.loader.hidden, true);
  assert.equal(boot.classes.size + boot.timers.size + boot.events.size + boot.wheel.size, 0);
});

test('startup waits for late page readiness between the minimum and the watchdog', async () => {
  const boot = await loadingBoot();
  boot.advanceTo(6500);
  assert.ok(boot.attributes.has('inert') && boot.classes.has('site-loading'));
  boot.events.get('vnbooking:ready')!();
  assert.ok(!boot.attributes.has('inert') && !boot.attributes.has('aria-busy'));
  assert.ok(boot.classes.has('site-entering'));
  boot.advanceTo(8100);
  assert.equal(boot.classes.size + boot.timers.size + boot.events.size + boot.wheel.size, 0);
});

test('reduced motion skips the curtain entrance and releases a ready page at six seconds', async () => {
  const boot = await loadingBoot('/', false);
  boot.events.get('vnbooking:ready')!();
  boot.advanceTo(6000);
  assert.equal(boot.loader.hidden, true);
  assert.ok(!boot.attributes.has('inert'));
  assert.equal(boot.classes.size + boot.timers.size + boot.events.size + boot.wheel.size, 0);
});

test('startup restores interaction when the application bundle never becomes ready', async () => {
  const boot = await loadingBoot();
  const lateReady = boot.events.get('vnbooking:ready')!;
  boot.advanceTo(6999);
  assert.ok(boot.attributes.has('inert'));
  boot.advanceTo(7000);
  lateReady();
  assert.ok(!boot.attributes.has('inert') && !boot.attributes.has('aria-busy'));
  assert.equal(boot.classes.size + boot.timers.size + boot.events.size + boot.wheel.size, 0);
});

test('owner routes bypass the startup overlay without matching unrelated guest paths', async () => {
  for (const path of ['/admin', '/admin/login', '/en/admin/login']) {
    const boot = await loadingBoot(path);
    assert.equal(boot.loader.hidden, true, path);
    assert.equal(boot.attributes.size + boot.timers.size + boot.events.size, 0, path);
  }
  const guest = await loadingBoot('/administrator');
  assert.equal(guest.loader.hidden, false);
  assert.equal(guest.page.lang, 'vi');
});

test('startup remains hidden without JavaScript and its executable bytes receive CSP authorization', async () => {
  const boot = await loadingBoot();
  assert.match(boot.html, /id="site-loader"[^>]*\bhidden/);
  assert.match(boot.html, /<app-root><\/app-root>/);
  assert.ok(protectInlineScripts(boot.html).hashes.includes(hash(boot.script)));
});

test('cached SSR policy authorizes exact classic/module inline bytes without sharing script nonces', () => {
  const classic = 'window.synthetic = "café";\n';
  const module = 'import("/chunk-synthetic.js");';
  const html = `<script>${classic}</script><script type="module">${module}</script><script>${classic}</script>`;
  assert.deepEqual(inlineScriptHashes(html), [hash(classic), hash(module)]);
  const csp = contentSecurityPolicy(inlineScriptHashes(html), 'https://api.example.invalid', true);
  assert.ok(csp.includes(hash(classic)) && csp.includes(hash(module)));
  assert.ok(!csp.includes(hash('window.attacker = true;')));
  assert.ok(!csp.includes('nonce-'));
  const scriptPolicy = csp.split(';').find(d => d.trim().startsWith('script-src '))!;
  assert.ok(!scriptPolicy.includes('unsafe-inline') && !scriptPolicy.includes('unsafe-eval'));
  assert.ok(csp.includes("script-src-attr 'none'") && csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes('upgrade-insecure-requests'));
  assert.ok(!contentSecurityPolicy([], 'http://localhost:3000', false).includes('upgrade-insecure-requests'));
});

test('HTML parser excludes external scripts, inert JSON, comments, escaped markup and template contents', () => {
  const html = `<!-- <script>commentOnly()</script> -->
    <script src="/main.js">externalFallback()</script>
    <script type="application/json">{"script":"&lt;script&gt;inert()&lt;/script&gt;"}</script>
    <script type="application/ld+json">{"name":"synthetic"}</script>
    <template><script>templateOnly()</script></template>
    &lt;script&gt;escapedOnly()&lt;/script&gt;
    <script data-label="a>b" TYPE="text/javascript">actual()</script>`;
  assert.deepEqual(inlineScriptHashes(html), [hash('actual()')]);
});

test('script hashes follow browser line-ending normalization and resist attribute-lookalike parsing', () => {
  const html = '<SCRIPT data-example="nonce=pretend" TYPE="MODULE">a();\r\nb();\rc();</SCRIPT>';
  assert.deepEqual(inlineScriptHashes(html), [hash('a();\nb();\nc();')]);
  const protectedResult = protectInlineScripts(html);
  assert.equal(protectedResult.html, html);
});

test('legacy nonce removal preserves script bytes and produces stable cacheable protection', () => {
  const html = `<script nonce="old">boot()</script><script SRC="/main.js" NONCE='old'></script><script type="application/json" nonce=old>{"key":1}</script>`;
  const once = protectInlineScripts(html);
  assert.ok(!/\bnonce\s*=/i.test(once.html));
  assert.deepEqual(once.hashes, [hash('boot()')]);
  assert.ok(once.html.includes('boot()'));
  const twice = protectInlineScripts(once.html);
  assert.deepEqual(twice, once);
  assert.equal(contentSecurityPolicy(once.hashes, 'https://api.example.invalid', true), contentSecurityPolicy(twice.hashes, 'https://api.example.invalid', true));
});

test('all owner and guest booking SSR route contracts retain private/no-store', async () => {
  const routes = await source('../src/app/app.routes.server.ts');
  assert.match(routes, /const PRIVATE\s*=\s*\{[\s\S]*?'Cache-Control':\s*'private, no-store'/);
  for (const path of ['book','book/review','book/payment','booking/manage','booking/:reference/confirmation','admin','admin/**']) {
    assert.ok(routes.includes(`{ path: '${path}', ...PRIVATE }`), `${path} must retain PRIVATE route policy`);
  }
  assert.match(routes, /'Cache-Control':\s*'public, s-maxage=60, stale-while-revalidate=600'/);
  const server = await source('../src/server.ts');
  assert.ok(server.includes('protectInlineScripts('));
  assert.ok(!server.includes('stampScriptNonces('));
});

test('Vercel advanced-route cache contract applies immutable policy only to narrow fingerprinted asset paths', async () => {
  const config = JSON.parse(await source('../vercel.json')) as {headers?:unknown;routes:{src?:string;handle?:string;continue?:boolean;headers?:Record<string,string>;status?:number}[]};
  assert.equal(config.headers, undefined, 'advanced routes must own headers instead of mixing routing systems');
  for(const path of ['/index.html','/index.csr.html']) {
    const redirect=config.routes.find(route=>route.src&&new RegExp(`^(?:${route.src})$`).test(path));
    assert.equal(redirect?.status,308);
    assert.equal(redirect?.headers?.['Location'],'/');
    assert.equal(redirect?.headers?.['Cache-Control'],'no-store');
  }
  const cacheRoutes=config.routes.filter(route=>route.headers?.['Cache-Control']?.includes('max-age='));
  const matching=(path:string)=>cacheRoutes.filter(route=>new RegExp(`^(?:${route.src})$`).test(path));
  for(const path of ['/main-SYNTHETIC.js','/chunk-SYNTHETIC.js','/polyfills-SYNTHETIC.js','/styles-SYNTHETIC.css','/media/font-SYNTHETIC.woff2']){
    const matches=matching(path);assert.equal(matches.length,1,path);
    assert.equal(matches[0].headers?.['Cache-Control'],'public, max-age=31536000, immutable');
    assert.equal(matches[0].continue,true);
    assert.ok(config.routes.indexOf(matches[0])<config.routes.findIndex(route=>route.handle==='filesystem'));
  }
  for(const path of ['/optimized/apartments/synthetic/01.webp','/apartments/synthetic/01.jpg','/brand/logo.svg','/fonts/synthetic.woff2']){
    const matches=matching(path);assert.equal(matches.length,1,path);
    assert.equal(matches[0].headers?.['Cache-Control'],'public, max-age=604800, stale-while-revalidate=86400');
  }
  for(const path of ['/book','/book/payment','/booking/manage','/admin/login','/main-SYNTHETIC.js.map','/media/private.json','/brand/private.json','/optimized/private.json','/main-SYNTHETIC.js/booking']){
    assert.equal(matching(path).length,0,`${path} must not inherit static cache policy`);
  }
});
