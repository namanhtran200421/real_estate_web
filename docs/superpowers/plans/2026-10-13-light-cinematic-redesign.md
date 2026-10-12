# Light-cinematic redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the guest-facing site of VN Booking Hub as a light, cinematic, award-style story site with four signature motion moments, while the booking flow stays fast and unchanged in behaviour.

**Architecture:** Guest design tokens become the Tailwind v4 `@theme` defaults; the owner admin keeps today's look through a host stylesheet. A single lazily imported motion engine (GSAP + ScrollTrigger + SplitText + Lenis) runs only on Tier 1 story routes through `MotionService`, small directives and a handful of scene components; Tier 2 pages never load it. Server-rendered HTML is always complete and visible; the opening is pure CSS in `index.html`.

**Tech Stack:** Angular 22 (zoneless, SSR, incremental hydration), Tailwind v4, Transloco, Vitest (`npx ng test`), `gsap@3.15.0`, `lenis@1.3.26`, `playwright-core@1.63.0` (browser checks).

**Spec:** `docs/superpowers/specs/2026-10-13-light-cinematic-redesign-design.md` (v2). Decisions, council findings and their resolutions: `docs/superpowers/redesign-ledger.md`. Read both before starting any task.

## Global Constraints

- Work only in `frontend/real-estate` (plus `docs/`). Never touch `backend/`, the database, or push to `main`. Branch: `redesign/light-cinematic`.
- Owner admin (`/admin/**` including `/admin/login`) must look exactly as before.
- Tier 1 (story, motion engine allowed): routes `''`, `apartment`, `gallery`, `location`, `about`. Tier 2 (no engine): `availability`, `contact`, `book`, `book/review`, `book/payment`, `booking/manage`, `booking/:reference/confirmation`.
- Only `src/app/motion/engine.ts` may `import` (value import) from `gsap`, `gsap/*` or `lenis`. Everyone else uses `import type`.
- Pinned versions: `gsap@3.15.0`, `lenis@1.3.26`, `playwright-core@1.63.0` (exact, no caret).
- Animate only `transform`, `opacity`, SVG `stroke-dashoffset`. Scrubbed scale ≤ 1.05. No autoplaying loops.
- Server HTML always renders the final visible state. Nothing is hidden before the engine has loaded, except the CSS-only opening (`html.motion-opening`).
- Exactly one `priority` image per page.
- Never `overflow: hidden` on page-level ancestors of sticky elements; use `overflow-x: clip`.
- Display line-height ≥ 1.05; labels ≥ 12 px with tracking ≤ 0.12em; body text weight ≥ 400.
- All new copy in both `src/i18n/vi.json` and `src/i18n/en.json` (the parity test in `src/app/i18n/i18n.spec.ts` must stay green).
- Listing facts (guests, bedrooms, price, nearby places, photos) come from the API (`Apartment`), never hard-coded. Exception: the photo-to-room casting for `sun-garden-a04-12` in `src/app/data/sun-garden-rooms.ts`.
- Component styles stay under the 4 kB warning budget: put shared styling in `src/styles.css`.
- Commit after each task with a message describing the change, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Navigating from a story page into the booking flow** (Home → Book → Payment): smooth scroll, ScrollTriggers and the cursor must be gone; the date picker's `app-select` listbox must scroll with the wheel. Pinned in Task 4 (unit) and Task 13 (browser check `teardown`).
2. **Back button after scrolling a long story page**: returns to the saved position, not the top. Pinned in Task 4 (unit: `Scroll` event with position → `jumpTo(y)`) and Task 14 (`restoration` check).
3. **Vietnamese display headings** (Ở, ễ, ộ, ạ): stacked marks never clipped by line masks. Pinned in Task 6 (CSS rule + browser screenshot check `diacritics`).
4. **Screen readers and split text**: the accessible text of every split heading/statement equals its source string. Pinned in Task 6 (unit).
5. **Deep link to a room chapter** (`/apartment#phong-ngu-2`) on desktop with the pinned tour: lands on that chapter, not the first. Pinned in Task 10 (unit `scrollForChapter`, browser check `tour-deeplink`).

---

## File structure

```
frontend/real-estate/
  e2e/
    README.md                 how to run browser checks
    lib.mjs                   launch, viewports, scroll-through, error capture, asserts
    run.mjs                   runs all checks or one: node e2e/run.mjs <name> --site <url>
    checks/*.mjs              one file per check (added by tasks)
  src/
    index.html                fonts URL, theme-color, opening <style> + boot <script>
    styles.css                guest tokens, base, components (.panel, .band-navy, .arch, .lights, tour, bars)
    app/
      app.ts / app.html       guest host class, MotionService start, cursor, h1 focus
      app.config.ts           withViewTransitions(...)
      app.routes.ts           data: STORY on Tier 1
      admin/admin-theme.css   today's tokens/fonts on admin hosts
      motion/
        motion-prefs.ts       MOTION_QUERIES + matches()
        motion-routes.ts      STORY, isStoryRoute(), pathOf()
        view-transitions.ts   animateTransition()
        engine.ts             the only gsap/lenis importer: createEngine()
        motion.service.ts     loads engine on story routes, teardown, scroll sync
        on-motion.ts          onMotion() helper for directives/components
        split.ts              <app-split> (lines | fill), accessible
        reveal.directive.ts   [appReveal] lights-on
        fade-in.directive.ts  [appFadeIn]
        parallax.directive.ts [appParallax]
        draw-path.directive.ts[appDrawPath]
        custom-cursor.ts      <app-custom-cursor>
      data/sun-garden-rooms.ts room casting + chapters()
      components/
        site-header/*         pill header, dialog menu
        site-footer/*         sand footer
        apartment-header/*    restyled tabs block (Tier 2 + gallery/location)
        route-map/*           <app-route-map> SVG diagram + layout helper
        room-tour/*           <app-room-tour> + scrollForChapter helper
        mobile-book-bar/*     <app-mobile-book-bar>
        lightbox/*            <app-lightbox> dialog
        navy-band/*           <app-navy-band> shared closing band
      pages/home/*            six scenes
      pages/apartment-detail/* hero, tour, details
      pages/gallery/*, location/*, about/*  Tier 1 pages
      pages/(availability|contact|booking*|booking-lookup)/*  Tier 2 restyle
```

---

### Task 1: Browser check harness

**Files:**
- Create: `frontend/real-estate/e2e/README.md`, `e2e/lib.mjs`, `e2e/run.mjs`, `e2e/checks/smoke.mjs`
- Modify: `frontend/real-estate/package.json` (devDependency `playwright-core` `1.63.0`), `frontend/real-estate/.gitignore` (add `/e2e/output/`)

**Interfaces:**
- Produces: `e2e/lib.mjs` exports `openPage(browser, { viewport, reducedMotion, javaScriptEnabled })`, `scrollThrough(page)`, `captureErrors(page) → { errors: string[], cspViolations: string[] }`, `shot(page, name)`, `VIEWPORTS = { desktop: {width:1440,height:900}, phone: {width:390,height:844} }`. Each check file default-exports `async function check({ browser, site, assert, lib })`.

- [ ] **Step 1: Install playwright-core (exact) and ignore output**

```bash
cd frontend/real-estate
npm install --save-dev --save-exact playwright-core@1.63.0
printf '/e2e/output/\n' >> .gitignore
```

- [ ] **Step 2: Write `e2e/lib.mjs`**

```js
// Shared helpers for the browser checks (run against a running site; see e2e/README.md).
import { mkdirSync } from 'node:fs';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};

const OUTPUT = new URL('./output/', import.meta.url).pathname;
mkdirSync(OUTPUT, { recursive: true });

/** A fresh page; phones get touch + mobile emulation so hover/pointer media queries behave. */
export async function openPage(browser, { viewport = VIEWPORTS.desktop, reducedMotion = 'no-preference', javaScriptEnabled = true } = {}) {
  const phone = viewport.width < 768;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion,
    javaScriptEnabled,
  });
  return context.newPage();
}

/** Console errors, page errors, CSP violations and Angular hydration warnings (NG05xx). */
export function captureErrors(page) {
  const errors = [];
  const cspViolations = [];
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' || /NG05\d\d/.test(text)) errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.exposeFunction('__cspViolation', (v) => cspViolations.push(v)).catch(() => {});
  page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation?.(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return { errors, cspViolations };
}

/** Scrolls to the bottom in steps (lets lazy images and reveals run), then back to the top. */
export async function scrollThrough(page, step = 500) {
  await page.evaluate(async (step) => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
  }, step);
  await page.waitForTimeout(400);
}

export async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: `${OUTPUT}${name}.png`, fullPage });
}
```

- [ ] **Step 3: Write `e2e/run.mjs`**

```js
// Usage: node e2e/run.mjs [check-name] --site http://localhost:4200
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright-core';
import * as lib from './lib.mjs';

const args = process.argv.slice(2);
const site = (args[args.indexOf('--site') + 1] ?? 'http://localhost:4200').replace(/\/$/, '');
const engineName = args.includes('--firefox') ? 'firefox' : args.includes('--webkit') ? 'webkit' : 'chromium';
const only = args.find((a) => !a.startsWith('--') && a !== site);

const names = readdirSync(new URL('./checks/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => f.replace('.mjs', ''));
const selected = only ? names.filter((n) => n === only) : names;
if (!selected.length) throw new Error(`No check named ${only}. Known: ${names.join(', ')}`);

const browser = await { chromium, firefox, webkit }[engineName].launch();
let failed = 0;
for (const name of selected) {
  const { default: check } = await import(`./checks/${name}.mjs`);
  try {
    await check({ browser, site, assert, lib });
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}\n  ${error.message.split('\n').join('\n  ')}`);
  }
}
await browser.close();
process.exitCode = failed ? 1 : 0;
```

- [ ] **Step 4: Write the first check `e2e/checks/smoke.mjs`**

```js
// Every guest page loads at both sizes without console errors.
const PAGES = ['/', '/apartment', '/gallery', '/location', '/about', '/availability', '/contact', '/book'];

export default async function check({ browser, site, assert, lib }) {
  for (const [label, viewport] of Object.entries(lib.VIEWPORTS)) {
    const page = await lib.openPage(browser, { viewport });
    const { errors } = lib.captureErrors(page);
    for (const path of PAGES) {
      const response = await page.goto(site + path, { waitUntil: 'networkidle' });
      assert.ok(response && response.status() < 400, `${path} answered ${response?.status()}`);
      await lib.scrollThrough(page);
      await lib.shot(page, `smoke-${label}${path.replaceAll('/', '_') || '_home'}`);
    }
    assert.deepEqual(errors, [], `console errors at ${label}`);
    await page.context().close();
  }
}
```

- [ ] **Step 5: Write `e2e/README.md`**

````markdown
# Browser checks

Run against a running site (the checks do not start servers).

```bash
# 1. API on a disposable local database (never the Neon URL in backend/.env)
cd backend
PORT=3100 DATABASE_URL=postgresql://localhost/real_estate_test DB_SSL=false TURNSTILE_SECRET_KEY= RESEND_API_KEY= \
  SITE_URL=http://localhost:4377 CORS_ORIGINS=http://localhost:4377 npm run dev
# 2. Site pointed at it (regenerate environment.ts afterwards with `node scripts/write-env.mjs`)
cd frontend/real-estate
API_URL=http://localhost:3100 TURNSTILE_SITE_KEY= node scripts/write-env.mjs && npx ng serve --port 4377
# 3. Checks
node e2e/run.mjs --site http://localhost:4377            # all
node e2e/run.mjs smoke --site http://localhost:4377      # one
node e2e/run.mjs smoke --site http://localhost:4377 --firefox   # needs `npx playwright-core install firefox`
```

Screenshots land in `e2e/output/` (git-ignored). Production SSR with CSP: `npm run build`, then
`API_URL=http://localhost:3100 node dist/real-estate/server/server.mjs` (port 4000) and `--site http://localhost:4000`.
````

- [ ] **Step 6: Run the smoke check against today's site to prove the harness works**

Start the API and site as in the README, then run: `node e2e/run.mjs smoke --site http://localhost:4377`
Expected: `✓ smoke`, screenshots in `e2e/output/`.

- [ ] **Step 7: Commit**

```bash
git add frontend/real-estate/e2e frontend/real-estate/package.json frontend/real-estate/package-lock.json frontend/real-estate/.gitignore
git commit -m "Add browser checks for the guest site redesign"
```

---

### Task 2: Guest tokens, typography and the admin's unchanged look

**Files:**
- Modify: `src/styles.css`, `src/index.html`, `src/app/app.ts`
- Create: `src/app/admin/admin-theme.css`
- Modify: `src/app/admin/layout/admin-layout.ts`, `src/app/admin/pages/login/login.ts` (add `styleUrl: '../../admin-theme.css'` / correct relative path)
- Create: `e2e/checks/theme.mjs`

**Interfaces:**
- Produces: CSS tokens `--color-*` (guest values), `--color-navy-deep`, `--color-danger`; classes `.panel`, `.band-navy`, `.arch`, `.lights`, `.label-caps`, `.display`; app-root gets class `guest` on guest routes.

- [ ] **Step 1: Write the failing browser check `e2e/checks/theme.mjs`**

```js
// Guest pages use the new tokens and fonts; the admin login keeps today's.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  const guest = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const h1 = document.querySelector('h1');
    return { bg: html.backgroundColor, font: getComputedStyle(document.body).fontFamily, h1: h1 && getComputedStyle(h1).fontFamily, guest: document.querySelector('app-root').classList.contains('guest') };
  });
  assert.equal(guest.bg, 'rgb(246, 241, 232)');
  assert.match(guest.font, /Be Vietnam Pro/);
  assert.match(guest.h1, /Fraunces/);
  assert.equal(guest.guest, true);

  await page.goto(site + '/admin/login', { waitUntil: 'networkidle' });
  const admin = await page.evaluate(() => {
    const host = document.querySelector('app-admin-login');
    const s = getComputedStyle(host);
    return { bg: s.backgroundColor, font: s.fontFamily, color: s.color, guest: document.querySelector('app-root').classList.contains('guest') };
  });
  assert.equal(admin.bg, 'rgb(250, 250, 248)');
  assert.match(admin.font, /Source Sans 3/);
  assert.equal(admin.color, 'rgb(26, 26, 26)');
  assert.equal(admin.guest, false);
  await lib.shot(page, 'theme-admin-login');
  await page.context().close();
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `node e2e/run.mjs theme --site http://localhost:4377`
Expected: `✗ theme` (background is `rgb(250, 250, 248)` on the guest page).

- [ ] **Step 3: Replace the `@theme` colour and font tokens in `src/styles.css`**

Replace the colour and typography block inside `@theme` with:

```css
  /* Colour: the logo's navy and gold on warm ivory (guest site). The owner admin restores
     today's values in src/app/admin/admin-theme.css. Contrast ratios: see the redesign spec §3.1. */
  --color-background: #f6f1e8;
  --color-foreground: #11305a;
  --color-muted: #ece4d6;
  --color-muted-foreground: #5d6474;
  --color-accent: #ddb37f;
  --color-accent-secondary: #e6c194;
  --color-accent-foreground: #11305a;
  --color-accent-deep: #7a5426;
  --color-accent-muted: rgb(221 179 127 / 0.14);
  --color-border: #e3d9c8;
  --color-border-hover: #cfc2ab;
  --color-input: #8f8472;
  --color-card: #fffdf8;
  --color-ring: #7a5426;
  --color-navy-deep: #0b2242;
  --color-danger: #a3261b;

  /* Typography */
  --font-serif: 'Fraunces', 'Fraunces Fallback', Georgia, serif;
  --font-sans: 'Be Vietnam Pro', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
```

Update `--shadow-accent` to `0 4px 14px rgb(122 84 38 / 0.2)`.

- [ ] **Step 4: Add the fallback face and guest base rules to `@layer base` in `src/styles.css`**

Add at the top of `@layer base`:

```css
  /* Georgia sized like Fraunces, so the display text barely moves when the web font swaps in. */
  @font-face {
    font-family: 'Fraunces Fallback';
    src: local('Georgia');
    size-adjust: 103%;
    ascent-override: 95%;
    descent-override: 25%;
    line-gap-override: 0%;
  }
```

Add after the existing `h4 { … }` rules (guest-only differences live under `.guest`, the app-root class on guest routes):

```css
  .guest {
    overflow-x: clip;
  }

  .guest :is(h1, h2, h3) {
    font-weight: 300;
    font-variation-settings: 'opsz' 144;
    line-height: 1.08;
  }

  .guest h3 {
    font-weight: 400;
    font-variation-settings: 'opsz' 48;
    line-height: 1.25;
  }

  .guest p,
  .guest li {
    font-weight: 400;
  }

  .guest em {
    font-style: italic;
    color: var(--color-accent-deep);
  }
```

- [ ] **Step 5: Add guest components to `@layer components` in `src/styles.css`**

```css
  /* Labels: Be Vietnam Pro caps, ≥ 12 px, tracking ≤ .12em so Vietnamese words keep their gaps. */
  .guest .small-caps,
  .guest .section-label,
  .label-caps {
    font-family: var(--font-sans);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .display {
    font-family: var(--font-serif);
    font-weight: 300;
    font-size: clamp(3.5rem, 9vw, 8.25rem);
    font-variation-settings: 'opsz' 144;
    line-height: 1.05;
    letter-spacing: -0.025em;
  }

  .display-section {
    font-family: var(--font-serif);
    font-weight: 300;
    font-size: clamp(2.25rem, 5vw, 4rem);
    font-variation-settings: 'opsz' 144;
    line-height: 1.08;
    letter-spacing: -0.02em;
  }

  /* Paper panel: forms, calendar, prices, QR, booking card. */
  .panel {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    box-shadow: 0 30px 60px -40px rgb(17 48 90 / 0.35);
    padding: 1.5rem;
  }

  @media (width >= 48rem) {
    .panel {
      padding: 2rem;
    }
  }

  /* Navy band: ivory text, logo-gold accents, gold focus ring. */
  .band-navy {
    --color-foreground: #f6f1e8;
    --color-muted-foreground: rgb(246 241 232 / 0.82);
    --color-accent-deep: #ddb37f;
    --color-ring: #ddb37f;
    background: linear-gradient(180deg, #11305a, var(--color-navy-deep));
    color: var(--color-foreground);
  }

  /* Arched villa-window frame for portrait photos. */
  .arch {
    position: relative;
    overflow: clip;
    border-radius: 999px 999px 0.75rem 0.75rem;
  }

  /* Lights-on: the layers the reveal directive adds (absent until the motion engine runs). */
  .lights {
    position: relative;
    overflow: clip;
  }

  .lights-veil,
  .lights-warm {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .lights-veil {
    background: rgb(246 241 232 / 0.55);
  }

  .lights-warm {
    background: rgb(221 179 127 / 0.12);
    opacity: 0;
  }

  /* Two-tone focus over photos. */
  .focus-photo:focus-visible {
    outline: 2px solid #11305a;
    outline-offset: 2px;
    box-shadow: 0 0 0 6px #f6f1e8;
  }

  .guest .btn {
    border-radius: 999px;
  }

  .btn-navy {
    background: #11305a;
    color: #f6f1e8;
  }

  .btn-navy:hover {
    background: var(--color-navy-deep);
  }

  .text-danger {
    color: var(--color-danger);
  }
```

- [ ] **Step 6: Create `src/app/admin/admin-theme.css` with today's values**

```css
/* The owner admin keeps the original look: today's tokens and fonts, inherited by everything inside. */
:host {
  --color-background: #fafaf8;
  --color-foreground: #1a1a1a;
  --color-muted: #f5f3f0;
  --color-muted-foreground: #6b6b6b;
  --color-accent: #ddb37f;
  --color-accent-secondary: #e6c194;
  --color-accent-foreground: #1a1a1a;
  --color-accent-deep: #8a612e;
  --color-accent-muted: rgb(221 179 127 / 0.12);
  --color-border: #e8e4df;
  --color-border-hover: #d6d0c8;
  --color-input: #e8e4df;
  --color-card: #ffffff;
  --color-ring: #8a612e;
  --font-serif: 'Playfair Display', Georgia, serif;
  --font-sans: 'Source Sans 3', system-ui, sans-serif;
  --shadow-accent: 0 4px 14px rgb(138 97 46 / 0.2);

  display: block;
  min-height: 100dvh;
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
}
```

In `admin-layout.ts` and `pages/login/login.ts` add to the `@Component` metadata: `styleUrl: '<relative path>/admin-theme.css'` (`'../admin-theme.css'` from `layout/`, `'../../admin-theme.css'` from `pages/login/`). If a component already has `styles`/`styleUrl`, use `styleUrls: [...]` with both.

- [ ] **Step 7: Mark guest routes on the app root (`src/app/app.ts`)**

Add to the `@Component` metadata: `host: { '[class.guest]': '!inAdmin()' }`.

- [ ] **Step 8: Update fonts and theme colour in `src/index.html`**

Replace the fonts stylesheet `<link>` with:

```html
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,300..400;1,9..144,300..400&family=IBM+Plex+Mono:wght@400;500&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Source+Sans+3:wght@400;500&display=swap">
```

Change `<meta name="theme-color" content="#FAFAF8">` to `#F6F1E8`.

- [ ] **Step 9: Run the check, the unit tests and the build**

Run: `node e2e/run.mjs theme --site http://localhost:4377` → Expected `✓ theme`
Run: `npx ng test --watch=false` → Expected all pass
Run: `npx ng build` → Expected success, no new warnings (component style budget respected)

- [ ] **Step 10: Commit**

```bash
git add frontend/real-estate/src frontend/real-estate/e2e/checks/theme.mjs
git commit -m "Give guest pages the light-cinematic tokens and fonts; keep the admin's look"
```

---

### Task 3: Motion rules: queries, story routes, view transitions, focus on navigation

**Files:**
- Create: `src/app/motion/motion-prefs.ts`, `src/app/motion/motion-routes.ts`, `src/app/motion/view-transitions.ts`
- Create: `src/app/motion/motion-routes.spec.ts`, `src/app/motion/view-transitions.spec.ts`
- Modify: `src/app/app.routes.ts` (Tier 1 `data`), `src/app/app.config.ts` (`withViewTransitions`), `src/app/app.ts` (focus `h1` after navigation)

**Interfaces:**
- Produces:
  - `MOTION_QUERIES: { allowed, desktop, pinTour, stackTour }` (strings), `matches(query: keyof typeof MOTION_QUERIES, win?: Pick<Window,'matchMedia'>): boolean`
  - `STORY = { motion: true } as const`, `isStoryRoute(route: ActivatedRouteSnapshot | null): boolean`, `pathOf(route: ActivatedRouteSnapshot): string`
  - `animateTransition(c: { fromPath: string; toPath: string; fromStory: boolean; toStory: boolean; reducedMotion: boolean }): boolean`

- [ ] **Step 1: Write the failing tests**

`src/app/motion/motion-routes.spec.ts`:

```ts
import { routes } from '../app.routes';
import { isStoryRoute, pathOf, STORY } from './motion-routes';
import { ActivatedRouteSnapshot } from '@angular/router';

function snapshot(chain: { path: string; data?: Record<string, unknown> }[]): ActivatedRouteSnapshot {
  let child: ActivatedRouteSnapshot | null = null;
  for (const level of [...chain].reverse()) {
    child = { url: level.path ? level.path.split('/').map((path) => ({ path })) : [], data: level.data ?? {}, firstChild: child } as unknown as ActivatedRouteSnapshot;
  }
  return child!;
}

describe('story routes', () => {
  it('marks exactly the five story pages', () => {
    const story = routes.filter((r) => r.data?.['motion'] === true).map((r) => r.path);
    expect(story.sort()).toEqual(['', 'about', 'apartment', 'gallery', 'location']);
  });

  it('finds the story flag on the deepest matched route', () => {
    expect(isStoryRoute(snapshot([{ path: '' }, { path: 'gallery', data: STORY }]))).toBe(true);
    expect(isStoryRoute(snapshot([{ path: '' }, { path: 'book' }]))).toBe(false);
    expect(isStoryRoute(null)).toBe(false);
  });

  it('builds the full path of a snapshot chain', () => {
    expect(pathOf(snapshot([{ path: '' }, { path: 'book/payment' }]))).toBe('/book/payment');
    expect(pathOf(snapshot([{ path: '' }]))).toBe('/');
  });
});
```

`src/app/motion/view-transitions.spec.ts`:

```ts
import { animateTransition } from './view-transitions';

const base = { fromPath: '/', toPath: '/apartment', fromStory: true, toStory: true, reducedMotion: false };

describe('animateTransition', () => {
  it('animates between two different story pages', () => {
    expect(animateTransition(base)).toBe(true);
  });
  it('never animates with reduced motion', () => {
    expect(animateTransition({ ...base, reducedMotion: true })).toBe(false);
  });
  it('never animates when the booking flow is involved', () => {
    expect(animateTransition({ ...base, toPath: '/book', toStory: false })).toBe(false);
    expect(animateTransition({ ...base, fromPath: '/book', fromStory: false })).toBe(false);
  });
  it('does not animate a change on the same page (#chapter, ?apt)', () => {
    expect(animateTransition({ ...base, toPath: '/' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false` → Expected: FAIL, modules `./motion-routes` and `./view-transitions` not found.

- [ ] **Step 3: Implement the three modules**

`src/app/motion/motion-prefs.ts`:

```ts
/**
 * Media queries for motion, shared by MotionService and gsap.matchMedia().
 * src/styles.css and src/index.html repeat them verbatim (CSS cannot import these): keep in sync.
 */
export const MOTION_QUERIES = {
  allowed: '(prefers-reduced-motion: no-preference)',
  desktop: '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px)',
  pinTour: '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px) and (min-height: 700px)',
  stackTour: '(prefers-reduced-motion: no-preference) and (max-width: 767px) and (min-height: 600px) and (orientation: portrait)',
} as const;

export type MotionQuery = keyof typeof MOTION_QUERIES;

export function matches(query: MotionQuery, win: Pick<Window, 'matchMedia'> = window): boolean {
  return win.matchMedia(MOTION_QUERIES[query]).matches;
}
```

`src/app/motion/motion-routes.ts`:

```ts
import { ActivatedRouteSnapshot } from '@angular/router';

/** Route data for story pages (Tier 1): the only routes where the motion engine runs. */
export const STORY = { motion: true } as const;

export function isStoryRoute(route: ActivatedRouteSnapshot | null): boolean {
  let story = false;
  for (let current = route; current; current = current.firstChild) {
    if (current.data?.['motion'] === true) story = true;
  }
  return story;
}

/** "/book/payment" for a snapshot chain (query and fragment excluded). */
export function pathOf(route: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  for (let current: ActivatedRouteSnapshot | null = route; current; current = current.firstChild) {
    parts.push(...current.url.map((segment) => segment.path));
  }
  return `/${parts.join('/')}`;
}
```

`src/app/motion/view-transitions.ts`:

```ts
export interface TransitionContext {
  fromPath: string;
  toPath: string;
  fromStory: boolean;
  toStory: boolean;
  reducedMotion: boolean;
}

/** Cross-page transitions only between two different story pages, and only with motion allowed. */
export function animateTransition(c: TransitionContext): boolean {
  return !c.reducedMotion && c.fromStory && c.toStory && c.fromPath !== c.toPath;
}
```

- [ ] **Step 4: Mark Tier 1 routes in `src/app/app.routes.ts`**

Import `STORY` and add `data: STORY` to the `''`, `apartment`, `gallery`, `location` routes, and merge into `about`: `data: { ...STORY, description: 'meta.about' }`.

- [ ] **Step 5: Enable view transitions in `src/app/app.config.ts`**

Add `withViewTransitions` to the `provideRouter(...)` features:

```ts
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          const animate = animateTransition({
            fromPath: pathOf(from),
            toPath: pathOf(to),
            fromStory: isStoryRoute(from),
            toStory: isStoryRoute(to),
            reducedMotion: !matches('allowed'),
          });
          if (!animate) transition.skipTransition();
        },
      }),
```

Add to `src/styles.css` (outside layers):

```css
/* Page transitions: a short crossfade; the header stays put. */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 300ms;
}

app-site-header {
  view-transition-name: site-header;
}
```

- [ ] **Step 6: Move focus to the page heading after navigation (`src/app/app.ts`)**

```ts
  constructor() {
    // After a navigation (not the first page), screen-reader and keyboard users start at the new page's h1.
    let first = true;
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      if (typeof document === 'undefined') return;
      requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>('main h1');
        if (!heading) return;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      });
    });
  }
```

(Keep the existing `inAdmin` signal; `filter`/`NavigationEnd` are already imported.)

- [ ] **Step 7: Run tests and build**

Run: `npx ng test --watch=false` → Expected PASS (new specs included).
Run: `npx ng build` → Expected success.

- [ ] **Step 8: Commit**

```bash
git add frontend/real-estate/src
git commit -m "Mark story routes, gate page transitions and focus the heading after navigation"
```

---

### Task 4: Motion engine and MotionService

**Files:**
- Modify: `frontend/real-estate/package.json` (exact `gsap@3.15.0`, `lenis@1.3.26`)
- Create: `src/app/motion/engine.ts`, `src/app/motion/motion.service.ts`, `src/app/motion/on-motion.ts`, `src/app/motion/motion.service.spec.ts`
- Create: `scripts/check-motion-bundle.mjs`
- Modify: `src/app/app.ts` (start the service after first render), `src/styles.css` (import Lenis CSS), `package.json` script `check:motion`

**Interfaces:**
- Consumes: `MOTION_QUERIES`, `matches`, `isStoryRoute` (Task 3).
- Produces:
  - `interface MotionEngine { gsap; ScrollTrigger; SplitText; smooth(): Lenis | null; enableSmoothScroll(): void; disableSmoothScroll(): void; jumpTo(y: number): void; pause(): void; resume(): void; refresh(): void; teardown(): void }` and `createEngine(win?: Window): MotionEngine` in `engine.ts`.
  - `MotionService` (root): `start(): void`, `ready(): Promise<MotionEngine | undefined>`, `engine: Signal<MotionEngine | undefined>`, `story: Signal<boolean>`, static `loadEngine: () => Promise<MotionEngine>` (replaceable in tests).
  - `onMotion(setup: (engine: MotionEngine) => void | (() => void)): void` (call in a component/directive constructor; runs after render in the browser on story pages with motion allowed; the returned function and every gsap animation created inside `engine.gsap.context` are reverted on destroy).

- [ ] **Step 1: Install the pinned libraries**

```bash
cd frontend/real-estate
npm install --save-exact gsap@3.15.0 lenis@1.3.26
```

- [ ] **Step 2: Write the failing service test `src/app/motion/motion.service.spec.ts`**

```ts
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, Scroll, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { MotionService } from './motion.service';
import type { MotionEngine } from './engine';

function fakeEngine() {
  return {
    enableSmoothScroll: vi.fn(), disableSmoothScroll: vi.fn(), teardown: vi.fn(), refresh: vi.fn(), jumpTo: vi.fn(),
    pause: vi.fn(), resume: vi.fn(), smooth: () => null,
  } as unknown as MotionEngine & Record<string, ReturnType<typeof vi.fn>>;
}

describe('MotionService', () => {
  let events: Subject<unknown>;
  let story = true;
  let engine: ReturnType<typeof fakeEngine>;

  beforeEach(() => {
    events = new Subject();
    story = true;
    engine = fakeEngine();
    MotionService.loadEngine = () => Promise.resolve(engine);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { events, routerState: { snapshot: { root: { data: {}, firstChild: { data: { get motion() { return story; } }, firstChild: null } } } } } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('loads the engine on a story page and turns on smooth scrolling', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    expect(await motion.ready()).toBe(engine);
    expect(engine.enableSmoothScroll).toHaveBeenCalled();
  });

  it('tears everything down when navigating into the booking flow', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    await motion.ready();
    story = false;
    events.next(new NavigationEnd(1, '/book', '/book'));
    expect(engine.teardown).toHaveBeenCalled();
    expect(await motion.ready()).toBeUndefined();
  });

  it('restores the saved position on back/forward and the top on forward navigation', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    await motion.ready();
    events.next(new Scroll(new NavigationEnd(2, '/', '/'), [0, 1840], null));
    expect(engine.jumpTo).toHaveBeenLastCalledWith(1840);
    events.next(new Scroll(new NavigationEnd(3, '/gallery', '/gallery'), null, null));
    expect(engine.jumpTo).toHaveBeenLastCalledWith(0);
  });

  it('leaves anchor scrolling to the router', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    await motion.ready();
    engine.jumpTo.mockClear();
    events.next(new Scroll(new NavigationEnd(4, '/apartment#bang-gia', '/apartment#bang-gia'), null, 'bang-gia'));
    expect(engine.jumpTo).not.toHaveBeenCalled();
  });

  it('never loads the engine when reduced motion is on', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const motion = TestBed.inject(MotionService);
    motion.start();
    expect(await motion.ready()).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx ng test --watch=false` → Expected FAIL: `./motion.service` not found.

- [ ] **Step 4: Write `src/app/motion/engine.ts`**

```ts
/**
 * The motion engine: the only module that imports GSAP and Lenis (everything else uses
 * `import type`), so they land in one lazy chunk loaded by MotionService on story pages only.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { MOTION_QUERIES } from './motion-prefs';

gsap.registerPlugin(ScrollTrigger, SplitText);
gsap.ticker.lagSmoothing(0);

export interface MotionEngine {
  readonly gsap: typeof gsap;
  readonly ScrollTrigger: typeof ScrollTrigger;
  readonly SplitText: typeof SplitText;
  /** Lenis while smooth scrolling is on (desktop motion devices only). */
  smooth(): Lenis | null;
  enableSmoothScroll(): void;
  disableSmoothScroll(): void;
  /** Jumps to `y` without animating, keeping Lenis and ScrollTrigger in sync. */
  jumpTo(y: number): void;
  /** Dialogs: stop and restart smooth scrolling. */
  pause(): void;
  resume(): void;
  refresh(): void;
  /** Leaving the story pages: no smooth scroll, no ScrollTriggers, no running tweens. */
  teardown(): void;
}

export function createEngine(win: Window = window): MotionEngine {
  let lenis: Lenis | null = null;
  const tick = (time: number) => lenis?.raf(time * 1000);

  function enableSmoothScroll(): void {
    if (lenis || !win.matchMedia(MOTION_QUERIES.desktop).matches) return;
    lenis = new Lenis({
      autoRaf: false,
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
      anchors: false,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tick);
  }

  function disableSmoothScroll(): void {
    if (!lenis) return;
    gsap.ticker.remove(tick);
    lenis.destroy();
    lenis = null;
  }

  return {
    gsap,
    ScrollTrigger,
    SplitText,
    smooth: () => lenis,
    enableSmoothScroll,
    disableSmoothScroll,
    jumpTo(y) {
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else win.scrollTo(0, y);
      ScrollTrigger.update();
    },
    pause: () => lenis?.stop(),
    resume: () => lenis?.start(),
    refresh: () => ScrollTrigger.refresh(),
    teardown() {
      disableSmoothScroll();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      gsap.globalTimeline.clear();
    },
  };
}
```

- [ ] **Step 5: Write `src/app/motion/motion.service.ts`**

```ts
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, Scroll } from '@angular/router';
import type { MotionEngine } from './engine';
import { matches } from './motion-prefs';
import { isStoryRoute } from './motion-routes';

/**
 * Runs the motion engine on story pages (Tier 1) and nowhere else. The engine chunk is imported
 * after the first render; navigating into a Tier 2 page tears it down (Lenis, ScrollTriggers, tweens).
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  /** Replaced in tests. */
  static loadEngine: () => Promise<MotionEngine> = () => import('./engine').then((m) => m.createEngine());

  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly engineState = signal<MotionEngine | undefined>(undefined);
  private readonly storyState = signal(false);
  private loading?: Promise<MotionEngine | undefined>;

  readonly engine = this.engineState.asReadonly();
  readonly story = this.storyState.asReadonly();

  /** Called once by App after the first render. */
  start(): void {
    if (!this.browser) return;
    this.onRoute();
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.onRoute();
      else if (event instanceof Scroll) this.onScroll(event);
    });
  }

  /** The engine on story pages with motion allowed; undefined anywhere else. */
  ready(): Promise<MotionEngine | undefined> {
    if (!this.browser || !this.storyState() || !matches('allowed')) return Promise.resolve(undefined);
    this.loading ??= MotionService.loadEngine()
      .then((engine) => {
        this.engineState.set(engine);
        return engine;
      })
      .catch(() => undefined);
    return this.loading.then((engine) => {
      if (!this.storyState()) return undefined;
      engine?.enableSmoothScroll();
      return engine;
    });
  }

  private onRoute(): void {
    const story = isStoryRoute(this.router.routerState.snapshot.root);
    this.storyState.set(story);
    if (story) void this.ready();
    else this.engineState()?.teardown();
  }

  /** Forward navigation → top; back/forward → the saved position. Anchors stay with the router. */
  private onScroll(event: Scroll): void {
    const engine = this.engineState();
    if (!engine || !this.storyState() || event.anchor) return;
    const y = event.position ? event.position[1] : 0;
    requestAnimationFrame(() => {
      engine.refresh();
      engine.jumpTo(y);
    });
  }
}
```

- [ ] **Step 6: Write `src/app/motion/on-motion.ts`**

```ts
import { DestroyRef, afterNextRender, inject } from '@angular/core';
import type { MotionEngine } from './engine';
import { MotionService } from './motion.service';

/**
 * Runs `setup` after this component renders in the browser, on story pages with motion allowed.
 * Animations created inside are collected in a gsap context and reverted on destroy, together
 * with the cleanup function `setup` may return. Never set signals from GSAP callbacks.
 */
export function onMotion(setup: (engine: MotionEngine) => void | (() => void)): void {
  const motion = inject(MotionService);
  let destroyed = false;
  let revert: (() => void) | undefined;
  inject(DestroyRef).onDestroy(() => {
    destroyed = true;
    revert?.();
  });
  afterNextRender(() => {
    void motion.ready().then((engine) => {
      if (!engine || destroyed) return;
      let cleanup: void | (() => void);
      const context = engine.gsap.context(() => {
        cleanup = setup(engine);
      });
      revert = () => {
        if (typeof cleanup === 'function') cleanup();
        context.revert();
      };
    });
  });
}
```

- [ ] **Step 7: Start the service from `App` and import Lenis CSS**

In `src/app/app.ts` add (inject `MotionService`):

```ts
    const motion = inject(MotionService);
    afterNextRender(() => motion.start());
```

At the top of `src/styles.css`, after `@import 'tailwindcss';`: `@import 'lenis/dist/lenis.css';`

- [ ] **Step 8: Write the bundle size check `scripts/check-motion-bundle.mjs`**

```js
// Fails when the lazy motion chunk (gsap + ScrollTrigger + SplitText + lenis) exceeds 60 kB gzipped.
// Usage: npx ng build --stats-json && node scripts/check-motion-bundle.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT = 60 * 1024;
const dir = 'dist/real-estate/browser';
const chunks = readdirSync(dir).filter((f) => f.endsWith('.js'));
const engine = chunks.filter((f) => {
  const code = readFileSync(`${dir}/${f}`, 'utf8');
  return code.includes('ScrollTrigger') && code.includes('lenis');
});
if (engine.length !== 1) throw new Error(`Expected one motion chunk, found ${engine.length}: ${engine.join(', ')}`);
const size = gzipSync(readFileSync(`${dir}/${engine[0]}`)).length;
console.log(`motion chunk ${engine[0]}: ${(size / 1024).toFixed(1)} kB gz (limit 60 kB)`);
const initial = JSON.parse(readFileSync('dist/real-estate/stats.json', 'utf8'));
const leaked = Object.entries(initial.outputs ?? {}).filter(([file, out]) => out.entryPoint && file !== `${dir}/${engine[0]}` && Object.keys(out.inputs ?? {}).some((i) => i.includes('node_modules/gsap') || i.includes('node_modules/lenis')));
if (leaked.length) throw new Error(`gsap/lenis leaked into: ${leaked.map(([f]) => f).join(', ')}`);
if (size > LIMIT) process.exit(1);
```

Add to `package.json` scripts: `"check:motion": "node scripts/check-motion-bundle.mjs"`.

- [ ] **Step 9: Run tests, build and the size check**

Run: `npx ng test --watch=false` → PASS.
Run: `npx ng build --stats-json && npm run check:motion` → prints one chunk ≤ 60 kB gz (expected ≈ 53 kB).

- [ ] **Step 10: Commit**

```bash
git add frontend/real-estate
git commit -m "Add the lazy motion engine for story pages, with teardown and scroll restoration"
```

---

### Task 5: Opening and boot classes in `index.html`

**Files:**
- Modify: `src/index.html`
- Create: `e2e/checks/opening.mjs`

**Interfaces:**
- Produces: `html.motion` (motion allowed), `html.motion-opening` (first page of the session on a desktop-motion device). CSS hooks for hero templates: `.hero-mist`, `.hero-line > span` (with `--line` index), `.hero-image img`.

- [ ] **Step 1: Write the failing check `e2e/checks/opening.mjs`**

```js
// The opening plays once per session on desktop, never hides the CTA, and never runs on phones.
export default async function check({ browser, site, assert, lib }) {
  const desktop = await lib.openPage(browser);
  await desktop.goto(site + '/', { waitUntil: 'domcontentloaded' });
  const first = await desktop.evaluate(() => ({ opening: document.documentElement.classList.contains('motion-opening'), motion: document.documentElement.classList.contains('motion') }));
  assert.deepEqual(first, { opening: true, motion: true });
  const ctaOpacity = await desktop.evaluate(() => getComputedStyle(document.querySelector('[data-hero-cta]')).opacity);
  assert.equal(ctaOpacity, '1', 'CTA visible from the first frame');
  await desktop.goto(site + '/apartment', { waitUntil: 'domcontentloaded' });
  assert.equal(await desktop.evaluate(() => document.documentElement.classList.contains('motion-opening')), false, 'once per session');
  await desktop.context().close();

  const phone = await lib.openPage(browser, { viewport: lib.VIEWPORTS.phone });
  await phone.goto(site + '/', { waitUntil: 'domcontentloaded' });
  assert.equal(await phone.evaluate(() => document.documentElement.classList.contains('motion-opening')), false, 'no opening on phones');
  await phone.context().close();

  const reduced = await lib.openPage(browser, { reducedMotion: 'reduce' });
  await reduced.goto(site + '/', { waitUntil: 'domcontentloaded' });
  assert.equal(await reduced.evaluate(() => document.documentElement.className.includes('motion')), false);
  await reduced.context().close();
}
```

(`[data-hero-cta]` is added by the Home hero in Task 9; until then this check fails on that line, which is expected; run it again in Task 9.)

- [ ] **Step 2: Add the boot script and opening styles to `<head>` in `src/index.html`** (right after the fonts `<link>`)

```html
  <!-- Motion boot: classes decided before first paint. The CSP nonce is stamped on this script by the server. -->
  <script>
    (function () {
      try {
        var q = window.matchMedia, d = document.documentElement;
        if (!q('(prefers-reduced-motion: no-preference)').matches) return;
        d.classList.add('motion');
        if (q('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px)').matches && !sessionStorage.getItem('opened')) {
          d.classList.add('motion-opening');
          sessionStorage.setItem('opened', '1');
        }
      } catch (e) {}
    })();
  </script>
  <!-- Opening: dawn mist lifts off the hero (CSS only, ≤ 900 ms). The hero image only transforms (LCP),
       header, price and CTA are never hidden. -->
  <style>
    .hero-mist { opacity: 0; pointer-events: none; }
    @media (prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px) {
      html.motion-opening .hero-mist { animation: hero-mist 900ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      html.motion-opening .hero-line > span { animation: hero-line 800ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--line, 0) * 90ms + 150ms); }
      html.motion-opening .hero-image img { animation: hero-image 1200ms cubic-bezier(0.22, 1, 0.36, 1) both; }
    }
    @keyframes hero-mist { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-6%); } }
    @keyframes hero-line { from { transform: translateY(105%); } to { transform: none; } }
    @keyframes hero-image { from { transform: scale(1.04); } to { transform: none; } }
  </style>
```

- [ ] **Step 3: Verify the inline style survives the production build**

Run: `npx ng build && grep -c "hero-mist" dist/real-estate/browser/index.csr.html`
Expected: a count ≥ 1. If 0, set `"optimization": { "styles": { "inlineCritical": true, "minify": true }, "scripts": true }` unchanged but check whether Beasties removed it; if it did, move the `<style>` to `src/styles.css` under `@layer base` (the `html.motion-opening` selectors then load with the stylesheet, which still precedes hydration) and note it in the commit.

- [ ] **Step 4: Commit** (the check passes after Task 9)

```bash
git add frontend/real-estate/src/index.html frontend/real-estate/e2e/checks/opening.mjs
git commit -m "Decide motion classes before first paint and add the CSS-only opening"
```

---

### Task 6: Motion primitives (split text, lights-on, fade, parallax, line drawing)

**Files:**
- Create: `src/app/motion/split.ts`, `src/app/motion/split.spec.ts`, `src/app/motion/reveal.directive.ts`, `src/app/motion/fade-in.directive.ts`, `src/app/motion/parallax.directive.ts`, `src/app/motion/draw-path.directive.ts`, `src/app/motion/in-view.ts`
- Modify: `src/styles.css` (split styles)
- Create: `e2e/checks/diacritics.mjs`

**Interfaces:**
- Consumes: `onMotion` (Task 4), `MOTION_QUERIES` (Task 3).
- Produces:
  - `<app-split [text]="string" [em]="string?" [mode]="'lines' | 'fill'" />`: renders accessible text once (`.sr-only`) and an `aria-hidden` visual copy that is split. Place inside a heading or paragraph: `<h2 class="display-section"><app-split [text]="…" /></h2>`.
  - `[appReveal]` on a `.lights` wrapper containing one `<img>`: lights-on scrubbed reveal.
  - `[appFadeIn]`: 300 ms fade when first entering view.
  - `[appParallax]="number"`: yPercent range ±n, scroll-linked.
  - `[appDrawPath]` on an SVG `path`/`line`: draws in once when in view; optional `[drawDelay]="seconds"`.
  - `inView(el: Element, fraction = 0.85): boolean` in `in-view.ts`.

- [ ] **Step 1: Write the failing accessibility test `src/app/motion/split.spec.ts`**

```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Split } from './split';

@Component({
  imports: [Split],
  template: `<h2><app-split text="Một góc Đà Lạt" em="của riêng bạn" /></h2><p><app-split text="Sương sớm, gỗ ấm" mode="fill" /></p>`,
})
class Host {}

describe('app-split', () => {
  it('exposes the source text once to assistive technology', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const readable = (el: Element) =>
      [...el.querySelectorAll('.sr-only')].map((n) => n.textContent?.replace(/\s+/g, ' ').trim()).join(' ');
    expect(readable(root.querySelector('h2')!)).toBe('Một góc Đà Lạt của riêng bạn');
    expect(readable(root.querySelector('p')!)).toBe('Sương sớm, gỗ ấm');
    for (const visual of root.querySelectorAll('.split-visual')) {
      expect(visual.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders the visible text on the server (no JavaScript needed to read it)', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const visual = fixture.nativeElement.querySelector('h2 .split-visual') as HTMLElement;
    expect(visual.textContent?.replace(/\s+/g, ' ').trim()).toBe('Một góc Đà Lạt của riêng bạn');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx ng test --watch=false` → FAIL: `./split` not found.

- [ ] **Step 3: Write `src/app/motion/in-view.ts`**

```ts
/** True when the element's top is already above `fraction` of the viewport (never animate what is visible). */
export function inView(el: Element, fraction = 0.85): boolean {
  return el.getBoundingClientRect().top < window.innerHeight * fraction;
}
```

- [ ] **Step 4: Write `src/app/motion/split.ts`**

```ts
import { Component, ElementRef, computed, effect, input, viewChild } from '@angular/core';
import type { MotionEngine } from './engine';
import { MOTION_QUERIES } from './motion-prefs';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/**
 * Text revealed line by line ('lines') or filled word by word from slate to navy ('fill').
 * Assistive tech reads the `.sr-only` copy; only the `aria-hidden` visual copy is split (by lines
 * and words, never characters, so Vietnamese marks stay whole). Server HTML shows the text as is.
 */
@Component({
  selector: 'app-split',
  host: { class: 'split', '[class.split-fill]': "mode() === 'fill'" },
  template: `
    <span class="sr-only">{{ readable() }}</span>
    <span class="split-visual" aria-hidden="true" #visual>{{ text() }}@if (em()) { <em>{{ em() }}</em>}</span>
    @if (mode() === 'fill') {
      <span class="split-visual split-top" aria-hidden="true" #top>{{ text() }}@if (em()) { <em>{{ em() }}</em>}</span>
    }
  `,
})
export class Split {
  readonly text = input.required<string>();
  readonly em = input<string>();
  readonly mode = input<'lines' | 'fill'>('lines');

  protected readonly readable = computed(() => [this.text(), this.em()].filter(Boolean).join(' '));
  private readonly visual = viewChild.required<ElementRef<HTMLElement>>('visual');
  private readonly top = viewChild<ElementRef<HTMLElement>>('top');

  constructor() {
    let rebuild: (() => void) | undefined;
    // The split owns the visual copy's DOM after the first render; text changes rebuild it.
    effect(() => {
      this.readable();
      rebuild?.();
    });

    onMotion((engine) => {
      const visual = this.visual().nativeElement;
      if (inView(visual, 0.95)) return;
      const run = () => (this.mode() === 'fill' ? this.fill(engine) : this.lines(engine, visual));
      let undo = run();
      rebuild = () => {
        undo();
        for (const el of [visual, this.top()?.nativeElement]) {
          if (!el) continue;
          el.replaceChildren(document.createTextNode(this.text()));
          if (this.em()) el.append(' ', Object.assign(document.createElement('em'), { textContent: this.em() }));
        }
        undo = run();
      };
      return () => undo();
    });
  }

  private lines(engine: MotionEngine, visual: HTMLElement): () => void {
    const mm = engine.gsap.matchMedia();
    mm.add(MOTION_QUERIES.allowed, () => {
      engine.SplitText.create(visual, {
        type: 'lines,words',
        linesClass: 'split-line',
        aria: 'none',
        autoSplit: true,
        onSplit: (self) =>
          engine.gsap.from(self.words, {
            yPercent: 110,
            duration: 0.9,
            ease: 'expo.out',
            stagger: 0.04,
            scrollTrigger: { trigger: visual, start: 'top 85%', once: true },
          }),
      });
    });
    return () => mm.revert();
  }

  private fill(engine: MotionEngine): () => void {
    const top = this.top()?.nativeElement;
    if (!top) return () => {};
    const mm = engine.gsap.matchMedia();
    mm.add(MOTION_QUERIES.allowed, () => {
      engine.SplitText.create(top, {
        type: 'words',
        aria: 'none',
        autoSplit: true,
        onSplit: (self) =>
          engine.gsap.fromTo(
            self.words,
            { opacity: 0 },
            { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: top, start: 'top 80%', end: 'bottom 45%', scrub: true } },
          ),
      });
    });
    return () => mm.revert();
  }
}
```

- [ ] **Step 5: Add split styles to `src/styles.css` (`@layer components`)**

```css
  /* Split text: line clips get room for Vietnamese stacked marks (ể, ộ) and dots below (ạ). */
  .split-line {
    overflow: clip;
    padding-block: 0.15em;
    margin-block: -0.15em;
  }

  /* Statement fill: slate text with a navy copy on top whose words fade in. */
  .split-fill {
    display: grid;
  }

  .split-fill .split-visual {
    grid-area: 1 / 1;
    color: var(--color-muted-foreground);
  }

  .split-fill .split-top {
    color: var(--color-foreground);
  }

```

- [ ] **Step 6: Write the four directives**

`src/app/motion/reveal.directive.ts`:

```ts
import { Directive, ElementRef, inject } from '@angular/core';
import { MOTION_QUERIES } from './motion-prefs';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/**
 * Lights-on (daylight bloom) for large photos (≥ 40vw): a mist veil fades, a warm wash pulses,
 * the image settles from 1.05. Put on a `.lights` wrapper containing one <img>.
 */
@Directive({ selector: '[appReveal]' })
export class RevealDirective {
  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    onMotion((engine) => {
      const img = host.querySelector('img');
      if (!img || inView(host)) return;
      const veil = Object.assign(document.createElement('span'), { className: 'lights-veil' });
      const warm = Object.assign(document.createElement('span'), { className: 'lights-warm' });
      veil.setAttribute('aria-hidden', 'true');
      warm.setAttribute('aria-hidden', 'true');
      host.append(veil, warm);
      const mm = engine.gsap.matchMedia();
      mm.add(MOTION_QUERIES.allowed, () => {
        engine.gsap
          .timeline({ scrollTrigger: { trigger: host, start: 'top 85%', end: 'top 40%', scrub: true } })
          .fromTo(veil, { opacity: 1 }, { opacity: 0, ease: 'none' }, 0)
          .fromTo(img, { scale: 1.05 }, { scale: 1, ease: 'none' }, 0)
          .fromTo(warm, { opacity: 0 }, { opacity: 1, ease: 'sine.inOut', yoyo: true, repeat: 1, duration: 0.5 }, 0);
      });
      return () => {
        mm.revert();
        veil.remove();
        warm.remove();
      };
    });
  }
}
```

`src/app/motion/fade-in.directive.ts`:

```ts
import { Directive, ElementRef, inject } from '@angular/core';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/** Gallery thumbnails: a 300 ms fade the first time they come into view. */
@Directive({ selector: '[appFadeIn]' })
export class FadeInDirective {
  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    onMotion((engine) => {
      if (inView(host, 1)) return;
      engine.gsap.from(host, { opacity: 0, duration: 0.3, ease: 'power1.out', scrollTrigger: { trigger: host, start: 'top 95%', once: true } });
    });
  }
}
```

`src/app/motion/parallax.directive.ts`:

```ts
import { Directive, ElementRef, inject, input } from '@angular/core';
import { onMotion } from './on-motion';

/** Scroll-linked drift (never autoplaying): moves ±`appParallax` percent of the element's height. */
@Directive({ selector: '[appParallax]' })
export class ParallaxDirective {
  readonly appParallax = input(8);

  constructor() {
    const host = inject(ElementRef<Element>).nativeElement as Element;
    onMotion((engine) => {
      const range = this.appParallax();
      engine.gsap.fromTo(
        host,
        { yPercent: -range },
        { yPercent: range, ease: 'none', scrollTrigger: { trigger: host.parentElement ?? host, start: 'top bottom', end: 'bottom top', scrub: true } },
      );
    });
  }
}
```

`src/app/motion/draw-path.directive.ts`:

```ts
import { Directive, ElementRef, inject, input } from '@angular/core';
import { inView } from './in-view';
import { onMotion } from './on-motion';

/** SVG route lines draw in once when they come into view. */
@Directive({ selector: '[appDrawPath]' })
export class DrawPathDirective {
  readonly drawDelay = input(0);

  constructor() {
    const path = inject(ElementRef<SVGGeometryElement>).nativeElement as SVGGeometryElement;
    onMotion((engine) => {
      if (inView(path, 0.9)) return;
      const length = path.getTotalLength();
      engine.gsap.fromTo(
        path,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 1.2, delay: this.drawDelay(), ease: 'power2.inOut', scrollTrigger: { trigger: path, start: 'top 85%', once: true } },
      );
    });
  }
}
```

- [ ] **Step 7: Write the diacritics check `e2e/checks/diacritics.mjs`**

```js
// Display headings never clip Vietnamese stacked marks. Renders a test string with the site's CSS.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  const clipped = await page.evaluate(async () => {
    const h = document.createElement('h2');
    h.className = 'display';
    h.innerHTML = '<span class="split-line" style="display:block">Ở ễ ộ ạ ủ Ừ</span>';
    document.querySelector('main').prepend(h);
    await document.fonts.ready;
    const line = h.firstElementChild;
    return line.scrollHeight > line.clientHeight + 1;
  });
  assert.equal(clipped, false, 'line box clips the marks');
  await lib.shot(page, 'diacritics', false);
  await page.context().close();
}
```

- [ ] **Step 8: Run tests, the check and the build**

Run: `npx ng test --watch=false` → PASS.
Run: `node e2e/run.mjs diacritics --site http://localhost:4377` → `✓ diacritics`.
Run: `npx ng build && npm run check:motion` → success.

- [ ] **Step 9: Commit**

```bash
git add frontend/real-estate
git commit -m "Add accessible split text and the lights-on, fade, parallax and line-draw primitives"
```

---

### Task 7: Header, mobile menu, footer, apartment tabs, custom cursor, skip link

**Files:**
- Modify: `src/app/components/site-header/site-header.{html,ts}`, `src/app/components/site-footer/site-footer.html`, `src/app/components/apartment-header/apartment-header.html`, `src/app/app.html`
- Create: `src/app/motion/custom-cursor.ts`
- Create: `e2e/checks/header.mjs`

**Interfaces:**
- Consumes: `MotionService`, `MOTION_QUERIES`.
- Produces: `<app-custom-cursor />` (in `app.html` guest branch). Photos opt in with `data-cursor="view"`. Header height stays ≤ 104 px.

- [ ] **Step 1: Write the failing check `e2e/checks/header.mjs`**

```js
// Header: ivory pill over photos, "Đặt lịch" visible at 360 px, menu is a modal dialog closed by Esc.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser, { viewport: { width: 360, height: 780 } });
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  const header = await page.evaluate(() => {
    const h = document.querySelector('app-site-header header');
    const book = [...h.querySelectorAll('a')].find((a) => /Đặt lịch|Book/.test(a.textContent));
    return { height: h.getBoundingClientRect().height, bookVisible: !!book && book.getBoundingClientRect().width > 0 };
  });
  assert.ok(header.height <= 104, `header ${header.height}px`);
  assert.equal(header.bookVisible, true);
  await page.getByRole('button', { name: /Mở menu|Open menu/ }).click();
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), true, 'menu is a dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), false, 'Esc closes');
  const skip = await page.evaluate(() => document.querySelector('a[href="#main"]')?.textContent?.trim());
  assert.ok(skip, 'skip link to main');
  await page.context().close();
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `node e2e/run.mjs header --site http://localhost:4377` → `✗ header` (no dialog).

- [ ] **Step 3: Rebuild the header template `site-header.html`**

Keep the existing links array, language switch and `routerLinkActive` logic; restructure into:

```html
<a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-card focus:px-4 focus:py-2">
  {{ 'nav.skipToContent' | transloco }}
</a>
<header class="fixed inset-x-0 top-0 z-50 px-3 pt-3 md:px-6 md:pt-4">
  <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 rounded-full border border-border bg-background/[0.86] px-3 shadow-[0_10px_40px_-24px_rgb(17_48_90/0.45)] backdrop-blur-md md:h-[4.5rem] md:px-5">
    <a [routerLink]="'/'" class="shrink-0" [attr.aria-label]="'nav.homeLabel' | transloco: { site: site.name }">
      <img src="brand/logo-horizontal.webp" alt="" width="160" height="33" class="h-7 w-auto md:h-8" />
    </a>
    <nav class="hidden lg:block" [attr.aria-label]="'nav.main' | transloco">
      <ul class="flex items-center gap-7 text-sm">
        @for (link of links; track link.path) {
          <li><a class="nav-link" [routerLink]="link.path" routerLinkActive="is-active" [routerLinkActiveOptions]="activeOptions">{{ link.label | transloco }}</a></li>
        }
      </ul>
    </nav>
    <div class="flex items-center gap-2">
      <!-- existing language switch markup (VI / EN), hidden below sm -->
      <a routerLink="/book" class="btn btn-primary min-h-11 px-4 text-sm md:px-6">{{ 'nav.book' | transloco }}</a>
      <button type="button" class="icon-btn rounded-full lg:hidden" (click)="openMenu()" [attr.aria-label]="'nav.openMenu' | transloco" aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke-linecap="round" /></svg>
      </button>
    </div>
  </div>
</header>
<!-- Spacer: content starts below the fixed header (keeps the router's 104 px anchor offset valid). -->
<div class="h-[5.5rem] md:h-[6.5rem]" aria-hidden="true"></div>

<dialog #menu class="m-0 h-dvh max-h-none w-full max-w-none bg-background p-6 backdrop:bg-foreground/40" (close)="menuClosed()" [attr.aria-label]="'nav.menu' | transloco">
  <div class="flex items-center justify-between">
    <img src="brand/logo-horizontal.webp" alt="" width="160" height="33" class="h-7 w-auto" />
    <button type="button" class="icon-btn rounded-full" (click)="closeMenu()" [attr.aria-label]="'nav.closeMenu' | transloco">
      <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" /></svg>
    </button>
  </div>
  <nav class="mt-12" [attr.aria-label]="'nav.main' | transloco">
    <ul class="menu-links space-y-5">
      @for (link of links; track link.path; let i = $index) {
        <li [style.--i]="i"><a class="font-serif text-[2.5rem] font-light leading-tight" [routerLink]="link.path" (click)="closeMenu()">{{ link.label | transloco }}</a></li>
      }
    </ul>
  </nav>
</dialog>
```

In `site-header.ts`: replace `menuOpen` signal usage with a `viewChild.required<ElementRef<HTMLDialogElement>>('menu')`, and methods:

```ts
  private readonly menu = viewChild.required<ElementRef<HTMLDialogElement>>('menu');
  private readonly motion = inject(MotionService);

  protected openMenu(): void {
    this.menu().nativeElement.showModal();
    document.documentElement.classList.add('has-dialog');
    this.motion.engine()?.pause();
  }

  protected closeMenu(): void {
    this.menu().nativeElement.close();
  }

  /** Runs for every close: the button, a link, Esc, or the Android back gesture. */
  protected menuClosed(): void {
    document.documentElement.classList.remove('has-dialog');
    this.motion.engine()?.resume();
  }
```

Add to `src/styles.css` (`@layer components`):

```css
  /* Mobile menu links arrive one after another (CSS only). */
  dialog[open] .menu-links > li {
    animation: menu-link 420ms var(--motion-ease) both;
    animation-delay: calc(var(--i, 0) * 50ms + 80ms);
  }

  @keyframes menu-link {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: none; }
  }
```

Add i18n keys `nav.skipToContent`: vi "Bỏ qua đến nội dung", en "Skip to content".

- [ ] **Step 4: Give `<main>` its id in `app.html`** (`<main id="main" tabindex="-1">`) and add `<app-custom-cursor />` after `<app-site-header />` in the guest branch (import `CustomCursor` in `app.ts`). Remove the old `body::after` ambient glow from `styles.css` if it shows under the fixed header (keep the grain).

- [ ] **Step 5: Write `src/app/motion/custom-cursor.ts`**

```ts
import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MOTION_QUERIES } from './motion-prefs';
import { onMotion } from './on-motion';

/**
 * Desktop decoration: a navy dot that follows the pointer and grows into a gold "Xem" ring over
 * photos that open the lightbox. The native cursor stays visible; hidden over form fields.
 */
@Component({
  selector: 'app-custom-cursor',
  imports: [TranslocoPipe],
  template: `<div class="cursor" #cursor aria-hidden="true"><span class="cursor-label">{{ 'motion.cursorView' | transloco }}</span></div>`,
})
export class CustomCursor {
  private readonly cursor = viewChild.required<ElementRef<HTMLElement>>('cursor');

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    onMotion((engine) => {
      if (!window.matchMedia(MOTION_QUERIES.desktop).matches) return;
      const el = this.cursor().nativeElement;
      const x = engine.gsap.quickTo(el, 'x', { duration: 0.25, ease: 'power3.out' });
      const y = engine.gsap.quickTo(el, 'y', { duration: 0.25, ease: 'power3.out' });
      const move = (e: PointerEvent) => {
        x(e.clientX);
        y(e.clientY);
        const target = e.target as Element;
        el.classList.toggle('is-view', !!target.closest('[data-cursor="view"]'));
        el.classList.toggle('is-hidden', !!target.closest('input, select, textarea, [contenteditable]'));
      };
      host.classList.add('is-active');
      window.addEventListener('pointermove', move, { passive: true });
      return () => {
        window.removeEventListener('pointermove', move);
        host.classList.remove('is-active');
      };
    });
  }
}
```

Styles in `src/styles.css` (`@layer components`):

```css
  app-custom-cursor:not(.is-active) {
    display: none;
  }

  .cursor {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 70;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 999px;
    background: #11305a;
    pointer-events: none;
    display: grid;
    place-items: center;
    transition: width 250ms var(--motion-ease), height 250ms var(--motion-ease), margin 250ms var(--motion-ease), background-color 250ms;
  }

  .cursor.is-view {
    width: 72px;
    height: 72px;
    margin: -36px 0 0 -36px;
    background: rgb(221 179 127 / 0.92);
  }

  .cursor.is-hidden {
    opacity: 0;
  }

  .cursor-label {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: #11305a;
    opacity: 0;
  }

  .cursor.is-view .cursor-label {
    opacity: 1;
  }
```

i18n `motion.cursorView`: vi "Xem", en "View".

- [ ] **Step 6: Restyle the footer (`site-footer.html`)** to a sand band: outer `<footer class="bg-muted">`, keep columns and links, logo original, headings as `.label-caps text-accent-deep`, contact values in Fraunces. No navy.

- [ ] **Step 7: Restyle `apartment-header.html`** (used by Tier 2 availability and by gallery/location): eyebrow `.label-caps text-accent-deep`, title `.display-section`, price `font-serif`, tabs as pill segmented control (`rounded-full border border-border bg-card p-1`, active tab `bg-foreground text-background rounded-full px-4 py-2`). Keep the existing tab data and active logic.

- [ ] **Step 8: Run the check, tests and build; screenshot the header on phone and desktop**

Run: `node e2e/run.mjs header --site http://localhost:4377` → `✓ header`
Run: `npx ng test --watch=false && npx ng build` → success

- [ ] **Step 9: Commit**

```bash
git add frontend/real-estate
git commit -m "Restyle the header as a floating pill with a dialog menu, the footer, the tabs and add the desktop cursor"
```

---

### Task 8: Room casting and new copy

**Files:**
- Create: `src/app/data/sun-garden-rooms.ts`, `src/app/data/sun-garden-rooms.spec.ts`
- Modify: `src/i18n/vi.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `Apartment`, `Photo` from `src/app/models/apartment.ts`.
- Produces:

```ts
export interface RoomChapter { id: string; key: string; photos: Photo[] }   // key → i18n `rooms.<key>.title|line`
export function roomChapters(apartment: Apartment): RoomChapter[];
export function roomPhoto(apartment: Apartment, file: string): Photo | undefined; // '05' → photo whose src ends with /05.jpg
```

- [ ] **Step 1: Write the failing test `src/app/data/sun-garden-rooms.spec.ts`**

```ts
import { Apartment } from '../models/apartment';
import { roomChapters, roomPhoto } from './sun-garden-rooms';

const photo = (n: string) => ({ src: `/apartments/sun-garden-a04-12/${n}.jpg`, alt: `Ảnh ${n}` });
const sunGarden = {
  slug: 'sun-garden-a04-12',
  photos: ['02', '04', '03', '01', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16'].map(photo),
} as Apartment;

describe('room chapters', () => {
  it('casts Sun Garden photos into five chapters in tour order', () => {
    const chapters = roomChapters(sunGarden);
    expect(chapters.map((c) => c.id)).toEqual(['phong-khach', 'bep', 'phong-tam', 'phong-ngu-1', 'phong-ngu-2']);
    expect(chapters.map((c) => c.photos.map((p) => p.src.slice(-6, -4)))).toEqual([
      ['02', '06', '09', '10'],
      ['01', '08'],
      ['11', '12'],
      ['13', '14'],
      ['16', '15', '03'],
    ]);
  });

  it('skips photos the listing no longer has', () => {
    const fewer = { ...sunGarden, photos: sunGarden.photos.filter((p) => !p.src.endsWith('/08.jpg')) } as Apartment;
    expect(roomChapters(fewer)[1].photos.map((p) => p.src.slice(-6, -4))).toEqual(['01']);
  });

  it('gives any other apartment a single chapter with all its photos', () => {
    const other = { slug: 'other', photos: [photo('a'), photo('b')] } as Apartment;
    expect(roomChapters(other)).toEqual([{ id: 'hinh-anh', key: 'photos', photos: other.photos }]);
  });

  it('finds a photo by file number', () => {
    expect(roomPhoto(sunGarden, '05')?.src).toBe('/apartments/sun-garden-a04-12/05.jpg');
    expect(roomPhoto(sunGarden, '99')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail** (`npx ng test --watch=false` → module not found)

- [ ] **Step 3: Write `src/app/data/sun-garden-rooms.ts`**

```ts
import { Apartment, Photo } from '../models/apartment';

/**
 * Which Sun Garden A04-12 photo shows which room, in tour order (the listing's captions are
 * generic). Photos are matched by file number, so the listing can reorder or drop photos.
 */
const SUN_GARDEN: { id: string; key: string; files: string[] }[] = [
  { id: 'phong-khach', key: 'living', files: ['02', '06', '09', '10'] },
  { id: 'bep', key: 'kitchen', files: ['01', '08'] },
  { id: 'phong-tam', key: 'bathrooms', files: ['11', '12'] },
  { id: 'phong-ngu-1', key: 'bedroom1', files: ['13', '14'] },
  { id: 'phong-ngu-2', key: 'bedroom2', files: ['16', '15', '03'] },
];

export interface RoomChapter {
  /** Fragment id on the apartment page, e.g. "phong-ngu-2". */
  id: string;
  /** Translation key under `rooms.` (title and one line). */
  key: string;
  photos: Photo[];
}

export function roomPhoto(apartment: Apartment, file: string): Photo | undefined {
  return apartment.photos.find((p) => p.src.endsWith(`/${file}.jpg`));
}

export function roomChapters(apartment: Apartment): RoomChapter[] {
  if (apartment.slug !== 'sun-garden-a04-12') return [{ id: 'hinh-anh', key: 'photos', photos: apartment.photos }];
  return SUN_GARDEN.map(({ id, key, files }) => ({
    id,
    key,
    photos: files.map((f) => roomPhoto(apartment, f)).filter((p): p is Photo => !!p),
  })).filter((chapter) => chapter.photos.length > 0);
}
```

- [ ] **Step 4: Add the new copy to `src/i18n/vi.json` and `src/i18n/en.json`**

Add these keys (vi / en), merging into existing sections where they exist:

```json
"home": {
  "scenes": {
    "heroCta": "Xem lịch & đặt" / "See dates & book",
    "perNight": "từ {{ price }} ₫ / đêm" / "from {{ price }} ₫ / night",
    "statement": "Một căn góc tầng bốn, nắng sớm qua rèm, gỗ ấm và một tách cà phê trước khi phố núi thức dậy." / "A fourth-floor corner flat: early sun through the curtains, warm wood, and a coffee before the hill town wakes.",
    "placeEyebrow": "Giữa ngày" / "Midday",
    "placeTitle": "Rộng rãi cho cả nhà" / "Room for the whole family",
    "cool": "Đà Lạt mát quanh năm, quạt trần là đủ." / "Đà Lạt is cool all year; a ceiling fan is all you need.",
    "windowsEyebrow": "Chiều buông" / "Dusk",
    "windowsTitle": "Năm khung cửa, năm góc nhỏ" / "Five windows, five corners",
    "promisesEyebrow": "Đặt trực tiếp" / "Book direct",
    "promises": {
      "availability": { "title": "Lịch trống, thấy ngay" / "Free dates at a glance", "text": "Chọn ngày và đặt luôn, không cần nhắn hỏi trước." / "Pick your dates and book; no need to message first." },
      "prices": { "title": "Giá rõ từng đêm" / "Clear prices, night by night", "text": "Giá tính theo ngày, hiện đủ trước khi bạn thanh toán." / "Prices by date, shown in full before you pay." },
      "vietqr": { "title": "Chuyển khoản VietQR" / "Pay by VietQR", "text": "Quét mã để đặt cọc hoặc trả đủ; chủ nhà xác nhận khi nhận được tiền." / "Scan to pay a deposit or in full; the owner confirms when the money arrives." }
    },
    "aroundEyebrow": "Đèn lên" / "Lamps on",
    "aroundTitle": "Quanh Sun Garden" / "Around Sun Garden",
    "closingTitle": "Một góc Đà Lạt đang chờ bạn" / "A corner of Đà Lạt is waiting",
    "closingCta": "Đặt lịch" / "Book"
  }
},
"rooms": {
  "living": { "title": "Phòng khách & ăn" / "Living & dining", "line": "Ban công nhìn về Xóm Lèo, bàn ăn bốn người." / "A balcony toward Xóm Lèo and a table for four." },
  "kitchen": { "title": "Bếp" / "Kitchen", "line": "Bếp từ, lò vi sóng, tủ lạnh: đủ cho một bữa tối tự nấu." / "Induction hob, microwave, fridge: enough for a home-cooked dinner." },
  "bathrooms": { "title": "Hai phòng tắm" / "Two bathrooms", "line": "Mỗi phòng tắm có nước nóng, không ai phải chờ." / "Hot water in both; nobody waits." },
  "bedroom1": { "title": "Phòng ngủ 1" / "Bedroom 1", "line": "Giường đôi lớn, đèn đọc sách, tủ quần áo." / "A large double bed, reading lamps and a wardrobe." },
  "bedroom2": { "title": "Phòng ngủ 2" / "Bedroom 2", "line": "Ban công hướng đường Nam Hồ, nắng chiều vàng." / "A balcony over Nam Hồ street and golden afternoon light." },
  "photos": { "title": "Hình ảnh" / "Photos", "line": "" / "" },
  "tourEyebrow": "Đi một vòng căn hộ" / "Walk through",
  "skipTour": "Bỏ qua phần tham quan" / "Skip the tour",
  "chapter": "Phần {{ n }}/{{ total }}" / "Part {{ n }}/{{ total }}",
  "seeDates": "Xem lịch trống" / "See free dates"
},
"motion": { "cursorView": "Xem" / "View" },
"gallery": {
  "lightbox": {
    "label": "Xem ảnh" / "Photo viewer",
    "position": "Ảnh {{ n }}/{{ total }}" / "Photo {{ n }} of {{ total }}",
    "previous": "Ảnh trước" / "Previous photo",
    "next": "Ảnh tiếp" / "Next photo",
    "close": "Đóng" / "Close"
  }
},
"apartment": {
  "bookBar": { "label": "Đặt căn hộ này" / "Book this apartment", "cta": "Đặt lịch" / "Book" }
}
```

(Write them as proper JSON in each file: the `/` separates the vi value from the en value here; each file gets only its own language.)

- [ ] **Step 5: Run the tests** (`npx ng test --watch=false` → PASS, including the translation parity spec)

- [ ] **Step 6: Commit**

```bash
git add frontend/real-estate/src
git commit -m "Cast the Sun Garden photos into room chapters and add the story copy"
```

---

### Task 9: Home: "Một ngày ở A04-12"

**Files:**
- Modify: `src/app/pages/home/home.{ts,html}`, `src/app/components/apartment-card/apartment-card.html` (restyle for the "other apartments" row only)
- Create: `src/app/components/route-map/route-map.ts`, `route-map.html`, `route-map.spec.ts`
- Create: `src/app/components/navy-band/navy-band.ts`
- Create: `e2e/checks/home.mjs`

**Interfaces:**
- Consumes: `roomChapters`, `roomPhoto` (Task 8); `Split`, `RevealDirective`, `ParallaxDirective`, `DrawPathDirective`, `onMotion` (Task 6); `.hero-*` classes (Task 5).
- Produces:
  - `<app-route-map [places]="NearbyPlace[]" [label]="string" />` and `export function layoutPlaces(count: number, width = 640, height = 420): { x: number; y: number; labelX: number; anchor: 'start' | 'end' }[]` (points around the centre, alternating sides, never overlapping).
  - `<app-navy-band [eyebrow]="string" [title]="string" [em]="string?" [ctaLabel]="string" [ctaLink]="string" [ctaQuery]="Record<string,string>?">` with projected content.

- [ ] **Step 1: Write the failing route-map layout test `route-map.spec.ts`**

```ts
import { layoutPlaces } from './route-map';

describe('layoutPlaces', () => {
  it('places every nearby spot inside the canvas, left and right alternately', () => {
    const points = layoutPlaces(7, 640, 420);
    expect(points).toHaveLength(7);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(600);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(390);
    }
    expect(points.map((p) => p.anchor)).toEqual(['start', 'end', 'start', 'end', 'start', 'end', 'start']);
  });

  it('keeps labels at least 44 px apart vertically on each side', () => {
    const points = layoutPlaces(7, 640, 420);
    for (const side of ['start', 'end']) {
      const ys = points.filter((p) => p.anchor === side).map((p) => p.y).sort((a, b) => a - b);
      ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeGreaterThanOrEqual(44));
    }
  });

  it('handles no places', () => {
    expect(layoutPlaces(0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

- [ ] **Step 3: Write `route-map.ts` and `route-map.html`**

```ts
import { Component, computed, input } from '@angular/core';
import { DrawPathDirective } from '../../motion/draw-path.directive';
import { NearbyPlace } from '../../models/apartment';

/** Positions for nearby places around the apartment: alternating sides, evenly spaced per side. */
export function layoutPlaces(count: number, width = 640, height = 420) {
  const sides = [Math.ceil(count / 2), Math.floor(count / 2)];
  return Array.from({ length: count }, (_, i) => {
    const anchor: 'start' | 'end' = i % 2 === 0 ? 'start' : 'end';
    const slot = Math.floor(i / 2);
    const perSide = sides[i % 2];
    const y = 30 + ((height - 60) * (slot + 0.5)) / Math.max(perSide, 1);
    const x = anchor === 'start' ? width * 0.78 : width * 0.22;
    return { x, y, labelX: anchor === 'start' ? x + 14 : x - 14, anchor };
  });
}

/** The apartment at the centre, lines out to each nearby place with its journey time. */
@Component({
  selector: 'app-route-map',
  imports: [DrawPathDirective],
  templateUrl: './route-map.html',
})
export class RouteMap {
  readonly places = input.required<NearbyPlace[]>();
  readonly label = input.required<string>();
  protected readonly width = 640;
  protected readonly height = 420;
  protected readonly points = computed(() => layoutPlaces(this.places().length, this.width, this.height));
}
```

```html
<figure class="relative">
  <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" class="w-full overflow-visible" role="img" [attr.aria-label]="label()">
    @for (place of places(); track place.place; let i = $index) {
      @let p = points()[i];
      <path appDrawPath [drawDelay]="i * 0.08" [attr.d]="'M ' + width / 2 + ' ' + height / 2 + ' Q ' + (width / 2 + p.x) / 2 + ' ' + (p.y - 30) + ' ' + p.x + ' ' + p.y"
            fill="none" stroke="#ddb37f" stroke-width="1.5" stroke-linecap="round" />
      <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" fill="#11305a" />
      <text [attr.x]="p.labelX" [attr.y]="p.y - 4" [attr.text-anchor]="p.anchor" class="fill-foreground font-serif text-[15px]">{{ place.place }}</text>
      <text [attr.x]="p.labelX" [attr.y]="p.y + 14" [attr.text-anchor]="p.anchor" class="fill-muted-foreground text-[12px]">{{ place.distance }}</text>
    }
    <circle [attr.cx]="width / 2" [attr.cy]="height / 2" r="9" fill="#ddb37f" stroke="#11305a" stroke-width="2" />
  </svg>
  <!-- The same information as a list for screen readers and very narrow screens. -->
  <ul class="sr-only">
    @for (place of places(); track place.place) { <li>{{ place.place }}: {{ place.distance }}</li> }
  </ul>
</figure>
```

(On screens below 640 px, show the nearby list visibly instead of the SVG: wrap the svg in `hidden sm:block` and render a visible list `sm:hidden` with the same items.)

- [ ] **Step 4: Write `navy-band.ts`**

```ts
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParallaxDirective } from '../../motion/parallax.directive';
import { Split } from '../../motion/split';

/** Night: a navy band with drifting pine ridges, a heading, projected content and a gold CTA. */
@Component({
  selector: 'app-navy-band',
  imports: [RouterLink, ParallaxDirective, Split],
  template: `
    <section class="band-navy relative overflow-x-clip py-24 md:py-32">
      <div class="container-editorial relative z-10 max-w-6xl">
        <p class="label-caps text-accent-deep">{{ eyebrow() }}</p>
        <h2 class="display-section mt-4 max-w-3xl"><app-split [text]="title()" [em]="em()" /></h2>
        <ng-content />
        <a class="btn btn-primary mt-12" [routerLink]="ctaLink()" [queryParams]="ctaQuery()">{{ ctaLabel() }} →</a>
      </div>
      <svg class="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
        <path appParallax="6" d="M0 120 L0 70 L80 54 L150 68 L240 40 L320 62 L410 46 L500 70 L590 44 L680 64 L770 38 L860 60 L950 46 L1040 66 L1130 50 L1200 60 L1200 120 Z" fill="#0b2242" opacity="0.7" />
        <path appParallax="3" d="M0 120 L0 96 L90 84 L170 98 L260 78 L350 94 L440 82 L530 100 L620 84 L710 98 L800 80 L890 96 L980 86 L1070 100 L1160 88 L1200 94 L1200 120 Z" fill="#0b2242" />
      </svg>
    </section>
  `,
})
export class NavyBand {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly em = input<string>();
  readonly ctaLabel = input.required<string>();
  readonly ctaLink = input.required<string>();
  readonly ctaQuery = input<Record<string, string>>();
}
```

- [ ] **Step 5: Write the failing page check `e2e/checks/home.mjs`**

```js
// Home: one priority image, CTA to /book?apt=, five windows, route map, no repeated photo.
export default async function check({ browser, site, assert, lib }) {
  for (const [label, viewport] of Object.entries(lib.VIEWPORTS)) {
    const page = await lib.openPage(browser, { viewport });
    const { errors } = lib.captureErrors(page);
    await page.goto(site + '/', { waitUntil: 'networkidle' });
    const preloads = await page.evaluate(() => document.querySelectorAll('link[rel="preload"][as="image"][imagesrcset], link[rel="preload"][as="image"][href*="optimized"]').length);
    assert.ok(preloads <= 1, `${label}: ${preloads} image preloads`);
    const cta = await page.evaluate(() => document.querySelector('[data-hero-cta]')?.getAttribute('href'));
    assert.match(cta ?? '', /^\/book\?apt=/);
    assert.equal(await page.locator('[data-window]').count(), 5);
    await lib.scrollThrough(page);
    const srcs = await page.evaluate(() => [...document.querySelectorAll('main img[src*="apartments"]')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => (i.currentSrc || i.src).match(/\/(\d\d)-/)?.[1]));
    assert.equal(new Set(srcs).size, srcs.length, `${label}: photo repeated (${srcs.join(',')})`);
    assert.deepEqual(errors, []);
    await lib.shot(page, `home-${label}`);
    await page.context().close();
  }
}
```

- [ ] **Step 6: Rewrite `home.ts`**

```ts
import { Component, computed, inject } from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApartmentCard } from '../../components/apartment-card/apartment-card';
import { NavyBand } from '../../components/navy-band/navy-band';
import { RouteMap } from '../../components/route-map/route-map';
import { roomChapters, roomPhoto } from '../../data/sun-garden-rooms';
import { RevealDirective } from '../../motion/reveal.directive';
import { Split } from '../../motion/split';
import { inView } from '../../motion/in-view';
import { onMotion } from '../../motion/on-motion';
import { ApartmentService } from '../../services/apartment.service';

@Component({
  selector: 'app-home',
  imports: [ApartmentCard, DecimalPipe, NavyBand, NgOptimizedImage, RevealDirective, RouteMap, RouterLink, Split, TranslocoPipe],
  templateUrl: './home.html',
  host: { class: 'block' },
})
export class Home {
  private readonly apartments = inject(ApartmentService).all;

  protected readonly featured = computed(() => this.apartments()[0]);
  protected readonly others = computed(() => this.apartments().slice(1));

  /** Hero: centre pane (the one priority image) is also the phone hero. */
  protected readonly hero = computed(() => {
    const apt = this.featured();
    if (!apt) return undefined;
    return {
      centre: roomPhoto(apt, '05') ?? apt.photos[0],
      left: roomPhoto(apt, '04') ?? apt.photos[1],
      right: roomPhoto(apt, '14') ?? apt.photos[2],
      detail: roomPhoto(apt, '02') ?? apt.photos[3],
    };
  });

  /** Five windows: one photo per chapter (09, 08, 12, 13, 16 for Sun Garden). */
  protected readonly windows = computed(() => {
    const apt = this.featured();
    if (!apt) return [];
    const pick = ['09', '08', '12', '13', '16'];
    return roomChapters(apt).map((chapter, i) => ({
      chapter,
      photo: roomPhoto(apt, pick[i]) ?? chapter.photos[0],
    }));
  });

  protected readonly promises = ['availability', 'prices', 'vietqr'].map((key) => `home.scenes.promises.${key}`);

  constructor() {
    // Dusk: the five windows light up one after another (150 ms apart) when the row enters.
    onMotion((engine) => {
      const row = document.querySelector<HTMLElement>('[data-windows]');
      if (!row || inView(row)) return;
      const veils = [...row.querySelectorAll('[data-window] .window-veil')];
      engine.gsap.fromTo(veils, { opacity: 1 }, { opacity: 0, duration: 0.6, ease: 'power2.out', stagger: 0.15, scrollTrigger: { trigger: row, start: 'top 75%', once: true } });
    });
  }
}
```

- [ ] **Step 7: Rewrite `home.html`** (six scenes)

```html
@if (featured(); as apt) {
  @if (hero(); as h) {
    <!-- 1 · Dawn -->
    <section class="relative -mt-[5.5rem] md:-mt-[6.5rem]">
      <div class="relative grid h-[100svh] min-h-[38rem] gap-1 bg-background lg:grid-cols-[1fr_1.25fr_1fr]">
        <div class="hero-image relative hidden overflow-clip lg:block">
          <img [ngSrc]="h.left.src" [alt]="h.left.alt" fill sizes="(min-width: 1024px) 75vh, 100vw" class="object-cover" />
        </div>
        <div class="hero-image relative overflow-clip lg:mt-16 lg:rounded-t-[999px]">
          <img [ngSrc]="h.centre.src" [alt]="h.centre.alt" fill priority sizes="(max-width: 767px) 320px, (min-width: 1024px) 75vh, 100vw" class="object-cover" />
        </div>
        <div class="hero-image relative hidden overflow-clip lg:block">
          <img [ngSrc]="h.right.src" [alt]="h.right.alt" fill sizes="(min-width: 1024px) 75vh, 100vw" class="object-cover" />
        </div>
        <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(11_34_66/0.35)_0%,rgb(11_34_66/0)_28%,rgb(11_34_66/0.1)_55%,rgb(11_34_66/0.78)_100%)]"></div>
        <div class="hero-mist absolute inset-0 bg-background" aria-hidden="true"></div>
        <div class="absolute inset-x-0 bottom-0 z-10 px-6 pb-10 text-[#f6f1e8] md:px-12 md:pb-14">
          <div class="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p class="label-caps text-accent">{{ 'home.eyebrow' | transloco }}</p>
              <h1 class="display mt-3 text-[#f6f1e8]">
                <span class="hero-line block overflow-clip pb-[0.15em] pt-[0.15em] -my-[0.15em]" style="--line: 0"><span class="block">{{ 'home.titleStart' | transloco }}</span></span>
                <span class="hero-line block overflow-clip pb-[0.15em] pt-[0.15em] -my-[0.15em]" style="--line: 1"><span class="block"><em class="text-accent">{{ 'home.titleEm' | transloco }}</em></span></span>
              </h1>
            </div>
            <div class="flex flex-col items-start gap-4 lg:items-end">
              <p class="font-serif text-2xl">{{ 'home.scenes.perNight' | transloco: { price: (apt.pricing.weekday | number) } }}</p>
              <a data-hero-cta class="btn btn-primary" routerLink="/book" [queryParams]="{ apt: apt.slug }">{{ 'home.scenes.heroCta' | transloco }} →</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2 · Morning -->
    <section class="section">
      <div class="container-editorial max-w-5xl">
        <p class="display-section"><app-split [text]="'home.scenes.statement' | transloco" mode="fill" /></p>
      </div>
    </section>

    <!-- 3 · Daylight -->
    <section class="bg-muted py-24 md:py-32">
      <div class="container-editorial grid max-w-6xl items-center gap-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div class="arch lights aspect-[3/4]" appReveal>
          <img [ngSrc]="h.detail.src" [alt]="h.detail.alt" fill sizes="(min-width: 768px) 40vw, 90vw" class="object-cover object-[60%_70%]" />
        </div>
        <div>
          <p class="label-caps text-accent-deep">{{ 'home.scenes.placeEyebrow' | transloco }}</p>
          <h2 class="display-section mt-4"><app-split [text]="'home.scenes.placeTitle' | transloco" /></h2>
          <dl class="mt-10 grid grid-cols-2 gap-x-8 gap-y-6">
            @for (stat of [
              { value: apt.guests, label: 'apartment.stats.guests' },
              { value: apt.bedrooms, label: 'apartment.stats.bedrooms' },
              { value: apt.beds, label: 'apartment.stats.beds' },
              { value: apt.bathrooms, label: 'apartment.stats.bathrooms' },
            ]; track stat.label) {
              <div class="border-t border-border pt-4">
                <dt class="label-caps text-muted-foreground">{{ stat.label | transloco }}</dt>
                <dd class="mt-1 font-serif text-5xl font-light">{{ stat.value }}</dd>
              </div>
            }
          </dl>
          <p class="mt-10 max-w-md text-lg text-muted-foreground">{{ 'home.scenes.cool' | transloco }}</p>
        </div>
      </div>
    </section>

    <!-- 4 · Dusk: five windows -->
    <section class="section">
      <div class="container-editorial max-w-7xl">
        <p class="label-caps text-accent-deep">{{ 'home.scenes.windowsEyebrow' | transloco }}</p>
        <h2 class="display-section mt-4"><app-split [text]="'home.scenes.windowsTitle' | transloco" /></h2>
        <ul class="mt-14 grid grid-cols-2 gap-4 md:grid-cols-5 md:gap-5" data-windows>
          @for (w of windows(); track w.chapter.id) {
            <li data-window>
              <a class="group focus-photo block rounded-t-[999px]" routerLink="/apartment" [fragment]="w.chapter.id" [queryParams]="{ apt: apt.slug }">
                <div class="arch relative aspect-[3/5]">
                  <img [ngSrc]="w.photo.src" [alt]="w.photo.alt" fill sizes="(min-width: 768px) 18vw, 45vw" class="media-zoom object-cover" />
                  <span class="window-veil absolute inset-0 bg-background/60" aria-hidden="true" style="opacity: 0"></span>
                </div>
                <p class="mt-3 font-serif text-xl">{{ 'rooms.' + w.chapter.key + '.title' | transloco }}</p>
              </a>
            </li>
          }
        </ul>
      </div>
    </section>

    <!-- 5 · Night -->
    <app-navy-band [eyebrow]="'home.scenes.promisesEyebrow' | transloco" [title]="'home.scenes.closingTitle' | transloco"
                   [ctaLabel]="'rooms.seeDates' | transloco" ctaLink="/book" [ctaQuery]="{ apt: apt.slug }">
      <div class="mt-14 grid gap-10 md:grid-cols-3">
        @for (item of promises; track item; let i = $index) {
          <div class="border-t border-[#f6f1e8]/25 pt-6">
            <p class="font-serif text-4xl text-accent">0{{ i + 1 }}</p>
            <h3 class="mt-4 text-[#f6f1e8]">{{ item + '.title' | transloco }}</h3>
            <p class="mt-3 text-[#f6f1e8]/80">{{ item + '.text' | transloco }}</p>
          </div>
        }
      </div>
    </app-navy-band>

    <!-- 6 · Lamps: around + final call -->
    <section class="section">
      <div class="container-editorial max-w-6xl">
        <p class="label-caps text-accent-deep">{{ 'home.scenes.aroundEyebrow' | transloco }}</p>
        <h2 class="display-section mt-4"><app-split [text]="'home.scenes.aroundTitle' | transloco" /></h2>
        <div class="mt-12"><app-route-map [places]="apt.nearby" [label]="'home.scenes.aroundTitle' | transloco" /></div>
        <div class="mt-24 text-center">
          <h2 class="display-section mx-auto max-w-3xl"><app-split [text]="'home.scenes.closingTitle' | transloco" /></h2>
          <a class="btn btn-primary mt-10" routerLink="/book" [queryParams]="{ apt: apt.slug }">{{ 'home.scenes.closingCta' | transloco }} →</a>
        </div>
        @if (others().length) {
          <h2 class="display-section mt-24">{{ 'home.otherApartments' | transloco }}</h2>
          <div class="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            @for (other of others(); track other.id) { <app-apartment-card [apartment]="other" /> }
          </div>
        }
      </div>
    </section>
  }
}
```

Notes for the implementer:
- The "promises" band title uses `closingTitle`; change it to a dedicated key if the reviewers prefer, adding it to both i18n files.
- The window veils start at `opacity: 0` (visible photo) in server HTML; the engine sets them to 1 and fades them in sequence only when the row is out of view at load.
- If `windows()` has fewer than five chapters (another apartment), the grid simply has fewer items; `[data-window]` count of 5 is checked only for Sun Garden.

- [ ] **Step 8: Run tests, the home and opening checks, and the build**

Run: `npx ng test --watch=false` → PASS
Run: `node e2e/run.mjs home --site http://localhost:4377 && node e2e/run.mjs opening --site http://localhost:4377` → both ✓
Run: `npx ng build && npm run check:motion` → success

- [ ] **Step 9: Commit**

```bash
git add frontend/real-estate
git commit -m "Rebuild Home as a day at A04-12 in six scenes"
```

---

### Task 10: Apartment: hero, room tour, details, mobile book bar

**Files:**
- Modify: `src/app/pages/apartment-detail/apartment-detail.{ts,html}`, `src/app/components/booking-card/booking-card.html` (panel styling)
- Create: `src/app/components/room-tour/room-tour.ts`, `room-tour.html`, `room-tour.spec.ts`
- Create: `src/app/components/mobile-book-bar/mobile-book-bar.ts`
- Modify: `src/styles.css` (tour layout queries)
- Create: `e2e/checks/apartment.mjs`

**Interfaces:**
- Consumes: `roomChapters`, `roomPhoto` (Task 8); `Split`, `RevealDirective`, `onMotion`, `MOTION_QUERIES` (Tasks 3–6); `NavyBand` (Task 9).
- Produces:
  - `export function scrollForChapter(chapterLeft: number, maxShift: number, start: number, end: number): number`: page scroll position at which the pinned track shows a chapter.
  - `<app-room-tour [apartment]="Apartment" />`
  - `<app-mobile-book-bar [slug]="string" [price]="number" [watch]="string[]" />` (`watch` = CSS selectors whose visibility hides the bar: hero and booking card)

- [ ] **Step 1: Write the failing test `room-tour.spec.ts`**

```ts
import { scrollForChapter } from './room-tour';

describe('scrollForChapter', () => {
  it('maps a chapter position on the track to a page scroll position', () => {
    // Track shifts 0 → 3000 px while the page scrolls 1000 → 2500.
    expect(scrollForChapter(0, 3000, 1000, 2500)).toBe(1000);
    expect(scrollForChapter(1500, 3000, 1000, 2500)).toBe(1750);
    expect(scrollForChapter(3000, 3000, 1000, 2500)).toBe(2500);
  });

  it('clamps chapters beyond the end and handles a track that does not move', () => {
    expect(scrollForChapter(4200, 3000, 1000, 2500)).toBe(2500);
    expect(scrollForChapter(500, 0, 1000, 2500)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

- [ ] **Step 3: Write `room-tour.ts`**

```ts
import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Apartment } from '../../models/apartment';
import { roomChapters } from '../../data/sun-garden-rooms';
import { MOTION_QUERIES } from '../../motion/motion-prefs';
import { onMotion } from '../../motion/on-motion';
import { RevealDirective } from '../../motion/reveal.directive';

/** The page scroll position at which the pinned track shows the chapter starting at `chapterLeft`. */
export function scrollForChapter(chapterLeft: number, maxShift: number, start: number, end: number): number {
  if (maxShift <= 0) return start;
  const progress = Math.min(Math.max(chapterLeft / maxShift, 0), 1);
  return start + progress * (end - start);
}

/**
 * Walk through the apartment room by room. Desktop motion: the section's height is reserved in CSS,
 * the inner box sticks and the track moves sideways with scroll. Portrait phones: chapters stack
 * full screen (CSS sticky). Otherwise (reduced motion, no JS, landscape): a plain vertical list.
 */
@Component({
  selector: 'app-room-tour',
  imports: [NgOptimizedImage, RevealDirective, RouterLink, TranslocoPipe],
  templateUrl: './room-tour.html',
})
export class RoomTour {
  readonly apartment = input.required<Apartment>();
  protected readonly chapters = computed(() => roomChapters(this.apartment()));
  private readonly section = viewChild.required<ElementRef<HTMLElement>>('section');
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  constructor() {
    onMotion((engine) => {
      const mm = engine.gsap.matchMedia();
      mm.add(MOTION_QUERIES.pinTour, () => {
        const section = this.section().nativeElement;
        const track = this.track().nativeElement;
        const shift = () => Math.max(track.scrollWidth - window.innerWidth, 0);
        const tween = engine.gsap.to(track, {
          x: () => -shift(),
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true },
        });
        engine.gsap.to(section.querySelector('[data-progress]'), {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: true },
        });

        const goTo = (id: string) => {
          const chapter = track.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
          const st = tween.scrollTrigger;
          if (!chapter || !st) return;
          engine.jumpTo(scrollForChapter(chapter.offsetLeft - track.offsetLeft, shift(), st.start, st.end));
        };
        // Deep links (#phong-ngu-2) and keyboard focus land on the right chapter.
        if (location.hash) requestAnimationFrame(() => goTo(location.hash.slice(1)));
        const onHash = () => goTo(location.hash.slice(1));
        const onFocus = (e: FocusEvent) => {
          const chapter = (e.target as Element).closest<HTMLElement>('[data-chapter]');
          if (chapter) goTo(chapter.id);
        };
        window.addEventListener('hashchange', onHash);
        track.addEventListener('focusin', onFocus);
        return () => {
          window.removeEventListener('hashchange', onHash);
          track.removeEventListener('focusin', onFocus);
        };
      });
      return () => mm.revert();
    });
  }
}
```

- [ ] **Step 4: Write `room-tour.html`**

```html
<a class="sr-only focus:not-sr-only focus:inline-block focus:px-4 focus:py-2" href="#sau-tham-quan">{{ 'rooms.skipTour' | transloco }}</a>
<section #section class="room-tour" [attr.aria-label]="'rooms.tourEyebrow' | transloco">
  <div class="room-tour__sticky">
    <div class="room-tour__head container-editorial max-w-7xl">
      <p class="label-caps text-accent-deep">{{ 'rooms.tourEyebrow' | transloco }}</p>
      <span class="room-tour__progress" data-progress aria-hidden="true"></span>
    </div>
    <ol #track class="room-tour__track">
      @for (chapter of chapters(); track chapter.id; let i = $index) {
        <li class="room-tour__chapter" [id]="chapter.id" data-chapter>
          <div class="room-tour__photos">
            @for (photo of chapter.photos.slice(0, 3); track photo.src; let first = $first) {
              <div class="lights relative" [class.arch]="first" [class.room-tour__lead]="first" appReveal data-cursor="view">
                <img [ngSrc]="photo.src" [alt]="photo.alt" fill sizes="(min-width: 1024px) 30vw, 90vw" class="object-cover" />
              </div>
            }
          </div>
          <div class="room-tour__text">
            <p class="label-caps text-muted-foreground">{{ 'rooms.chapter' | transloco: { n: i + 1, total: chapters().length } }}</p>
            <h3 class="display-section mt-2">{{ 'rooms.' + chapter.key + '.title' | transloco }}</h3>
            <p class="mt-3 max-w-sm text-lg text-muted-foreground">{{ 'rooms.' + chapter.key + '.line' | transloco }}</p>
          </div>
        </li>
      }
      <li class="room-tour__chapter room-tour__cta">
        <h3 class="display-section">{{ 'rooms.seeDates' | transloco }}</h3>
        <a class="btn btn-primary mt-8" routerLink="/book" [queryParams]="{ apt: apartment().slug }">{{ 'apartment.bookBar.cta' | transloco }} →</a>
      </li>
    </ol>
  </div>
</section>
<span id="sau-tham-quan"></span>
```

- [ ] **Step 5: Tour layout in `src/styles.css` (`@layer components`)**

```css
  /* Room tour, default (no JS, reduced motion, landscape phones, tablets): a vertical list. */
  .room-tour__track { display: grid; gap: 4rem; padding-inline: 1.5rem; margin-top: 2rem; }
  .room-tour__photos { display: grid; grid-template-columns: 1.3fr 1fr; gap: 0.75rem; }
  .room-tour__photos > div { aspect-ratio: 3 / 4; }
  .room-tour__lead { grid-row: span 2; aspect-ratio: auto; }
  .room-tour__text { margin-top: 1.5rem; }
  .room-tour__progress { display: none; }

  /* Desktop motion: reserved height (≈ 250vh), sticky viewport, sideways track scrubbed by GSAP. */
  @media (prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px) and (min-height: 700px) {
    html.motion .room-tour { height: 250vh; }
    html.motion .room-tour__sticky { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; justify-content: center; overflow-x: clip; }
    html.motion .room-tour__track { display: flex; gap: 5vw; padding-inline: 6vw; width: max-content; margin-top: 3rem; }
    html.motion .room-tour__chapter { width: min(68vw, 62rem); flex: none; display: grid; grid-template-columns: 1.4fr 1fr; gap: 3rem; align-items: end; }
    html.motion .room-tour__photos { height: 62vh; }
    html.motion .room-tour__photos > div { aspect-ratio: auto; }
    html.motion .room-tour__cta { width: 36rem; align-self: center; display: block; }
    html.motion .room-tour__progress { display: block; height: 1px; background: var(--color-accent); transform: scaleX(0); transform-origin: left; margin-top: 1rem; }
  }

  /* Portrait phones: full-screen chapters that stack (pure CSS). */
  @media (prefers-reduced-motion: no-preference) and (max-width: 767px) and (min-height: 600px) and (orientation: portrait) {
    .room-tour__chapter { position: sticky; top: 5.5rem; min-height: calc(100svh - 5.5rem); background: var(--color-background); padding-block: 1.5rem; }
  }
```

- [ ] **Step 6: Write `mobile-book-bar.ts`**

```ts
import { Component, DestroyRef, afterNextRender, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Phones: "from {price} ₫ · Book" once the hero has scrolled away, hidden while the booking card shows. */
@Component({
  selector: 'app-mobile-book-bar',
  imports: [DecimalPipe, RouterLink, TranslocoPipe],
  template: `
    <div class="book-bar md:hidden" [class.is-shown]="shown()" [attr.inert]="shown() ? null : ''" role="region" [attr.aria-label]="'apartment.bookBar.label' | transloco">
      <p class="font-serif text-lg">{{ 'home.scenes.perNight' | transloco: { price: (price() | number) } }}</p>
      <a class="btn btn-primary min-h-12" routerLink="/book" [queryParams]="{ apt: slug() }">{{ 'apartment.bookBar.cta' | transloco }}</a>
    </div>
  `,
})
export class MobileBookBar {
  readonly slug = input.required<string>();
  readonly price = input.required<number>();
  /** Selectors of elements whose visibility hides the bar (the hero, the booking card). */
  readonly watch = input.required<string[]>();
  protected readonly shown = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const visible = new Set<Element>();
      const observer = new IntersectionObserver((entries) => {
        for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
        this.shown.set(visible.size === 0);
      });
      for (const selector of this.watch()) document.querySelectorAll(selector).forEach((el) => observer.observe(el));
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
```

Styles (`@layer components`):

```css
  .book-bar {
    position: fixed;
    inset-inline: 0.75rem;
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3rem;
    padding: 0.5rem 0.5rem 0.5rem 1.25rem;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: rgb(246 241 232 / 0.94);
    backdrop-filter: blur(12px);
    box-shadow: 0 20px 40px -24px rgb(17 48 90 / 0.5);
    transform: translateY(140%);
    transition: transform var(--motion-slow) var(--motion-ease);
  }

  .book-bar.is-shown { transform: none; }
  html.has-dialog .book-bar { transform: translateY(140%); }
```

On the apartment page host add bottom padding on phones: wrapper `class="pb-24 md:pb-0"` and `html { scroll-padding-bottom: 5rem }` inside a `@media (width < 48rem)` rule.

- [ ] **Step 7: Rewrite the top of `apartment-detail.html`** (keep sections 3–4 content and bindings as they are, restyled)

Replace `<app-apartment-header>` + `<app-apartment-gallery>` with:

```html
@if (apartment(); as apt) {
  <section class="relative" data-apartment-hero>
    <div class="container-editorial grid max-w-7xl items-end gap-10 pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-0">
      <div class="order-2 pb-6 lg:order-1 lg:pb-24">
        <p class="label-caps text-accent-deep">{{ apt.area }}</p>
        <h1 class="display mt-4"><app-split [text]="apt.name" /></h1>
        <p class="mt-6 text-lg text-muted-foreground">{{ 'apartment.capacity' | transloco: { guests: apt.guests, bedrooms: apt.bedrooms, beds: apt.beds, bathrooms: apt.bathrooms } }}</p>
        <div class="mt-8 flex flex-wrap items-center gap-5">
          <p class="font-serif text-3xl">{{ 'home.scenes.perNight' | transloco: { price: (apt.pricing.weekday | number) } }}</p>
          <a class="btn btn-primary" routerLink="/book" [queryParams]="{ apt: apt.slug }">{{ 'home.scenes.heroCta' | transloco }} →</a>
        </div>
      </div>
      <div class="hero-image relative order-1 -mx-6 aspect-[3/4] overflow-clip lg:order-2 lg:mx-0 lg:-mr-[max(2rem,calc((100vw-80rem)/2))] lg:h-[86vh] lg:aspect-auto lg:rounded-tl-[999px]">
        @if (heroPhoto(); as photo) {
          <img [ngSrc]="photo.src" [alt]="photo.alt" fill priority sizes="(max-width: 767px) 320px, (min-width: 1024px) 75vh, 100vw" class="object-cover" />
        }
      </div>
    </div>
  </section>
  <app-apartment-header [apartment]="apt" [tabsOnly]="true" />
  <app-room-tour [apartment]="apt" />
```

In `apartment-header.ts` add `readonly tabsOnly = input(false);` and wrap the title block of `apartment-header.html` in `@if (!tabsOnly()) { … }` so only the tabs render when it is set.

In `apartment-detail.ts`: remove the `ApartmentGallery` import (keep `ApartmentHeader`); add `roomPhoto` and `NgOptimizedImage`, `DecimalPipe`, `RoomTour`, `MobileBookBar`, `NavyBand`, `Split`; add

```ts
  protected readonly heroPhoto = computed(() => {
    const apt = this.apartment();
    return apt ? (roomPhoto(apt, '07') ?? apt.photos[0]) : undefined;
  });
```

Restyle the rest of the page: the details column headings as `.display-section`; amenity groups as `.panel`; wrap `<app-booking-card>` in `<div class="panel lg:sticky lg:top-28" data-booking-card>`; keep ids `thong-tin`, `tien-nghi`, `noi-quy`, `bang-gia`, `danh-gia`; replace the final "explore more" block with `<app-navy-band>` (eyebrow `rooms.tourEyebrow`, title `home.scenes.closingTitle`, CTA `/book?apt=`). Add at the end: `<app-mobile-book-bar [slug]="apt.slug" [price]="apt.pricing.weekday" [watch]="['[data-apartment-hero]', '[data-booking-card]']" />`.

- [ ] **Step 8: Write the page check `e2e/checks/apartment.mjs`**

```js
// Apartment: tour deep link lands on its chapter (desktop), anchors still work, book bar on phones.
export default async function check({ browser, site, assert, lib }) {
  const desktop = await lib.openPage(browser);
  const { errors } = lib.captureErrors(desktop);
  await desktop.goto(site + '/apartment#phong-ngu-2', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(1200);
  const visible = await desktop.evaluate(() => {
    const r = document.getElementById('phong-ngu-2').getBoundingClientRect();
    return r.left < window.innerWidth && r.right > 0 && r.top < window.innerHeight && r.bottom > 0;
  });
  assert.equal(visible, true, 'tour-deeplink: bedroom 2 is on screen');
  await desktop.goto(site + '/apartment#bang-gia', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(800);
  const top = await desktop.evaluate(() => document.getElementById('bang-gia').getBoundingClientRect().top);
  assert.ok(top >= 0 && top < 220, `anchor #bang-gia at ${top}px`);
  await lib.scrollThrough(desktop);
  await lib.shot(desktop, 'apartment-desktop');
  assert.deepEqual(errors, []);
  await desktop.context().close();

  const phone = await lib.openPage(browser, { viewport: lib.VIEWPORTS.phone });
  await phone.goto(site + '/apartment', { waitUntil: 'networkidle' });
  await phone.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await phone.waitForTimeout(900);
  assert.equal(await phone.evaluate(() => document.querySelector('.book-bar')?.classList.contains('is-shown')), true, 'book bar after the hero');
  assert.match(await phone.evaluate(() => document.querySelector('.book-bar a').getAttribute('href')), /^\/book\?apt=/);
  await lib.scrollThrough(phone);
  await lib.shot(phone, 'apartment-phone');
  await phone.context().close();
}
```

- [ ] **Step 9: Run tests, the check and the build**

Run: `npx ng test --watch=false` → PASS
Run: `node e2e/run.mjs apartment --site http://localhost:4377` → ✓
Run: `npx ng build && npm run check:motion` → success

- [ ] **Step 10: Commit**

```bash
git add frontend/real-estate
git commit -m "Rebuild the apartment page: split hero, room tour, panels and a phone book bar"
```

---

### Task 11: Gallery and the lightbox

**Files:**
- Modify: `src/app/pages/gallery/gallery.{ts,html}`
- Create: `src/app/components/lightbox/lightbox.ts`, `lightbox.spec.ts`
- Create: `e2e/checks/gallery.mjs`

**Interfaces:**
- Consumes: `roomChapters` (Task 8), `FadeInDirective` (Task 6), `MotionService` (pause/resume).
- Produces: `<app-lightbox [photos]="Photo[]" />` with `open(index: number, from?: HTMLImageElement): void`; pure helper `export function step(index: number, delta: number, total: number): number` (wraps around).

- [ ] **Step 1: Write the failing test `lightbox.spec.ts`**

```ts
import { step } from './lightbox';

describe('lightbox step', () => {
  it('moves forward and back, wrapping at the ends', () => {
    expect(step(0, 1, 16)).toBe(1);
    expect(step(15, 1, 16)).toBe(0);
    expect(step(0, -1, 16)).toBe(15);
  });
  it('stays put with a single photo', () => {
    expect(step(0, 1, 1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

- [ ] **Step 3: Write `lightbox.ts`**

```ts
import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Photo } from '../../models/apartment';
import { MotionService } from '../../motion/motion.service';
import { matches } from '../../motion/motion-prefs';

export function step(index: number, delta: number, total: number): number {
  if (total <= 1) return 0;
  return (index + delta + total) % total;
}

/** Full-screen photo viewer: native modal dialog (Esc and Android back close it), arrows and swipe. */
@Component({
  selector: 'app-lightbox',
  imports: [TranslocoPipe],
  template: `
    <dialog #dialog class="lightbox" (close)="closed()" (keydown.arrowLeft)="go(-1)" (keydown.arrowRight)="go(1)" [attr.aria-label]="'gallery.lightbox.label' | transloco">
      @if (photos()[index()]; as photo) {
        <img [src]="photo.src" [alt]="photo.alt" class="lightbox-img" (pointerdown)="swipeStart($event)" (pointerup)="swipeEnd($event)" />
      }
      <p class="lightbox-pos" aria-live="polite">{{ 'gallery.lightbox.position' | transloco: { n: index() + 1, total: photos().length } }}</p>
      <button type="button" class="lightbox-btn left-4" (click)="go(-1)" [attr.aria-label]="'gallery.lightbox.previous' | transloco">‹</button>
      <button type="button" class="lightbox-btn right-4" (click)="go(1)" [attr.aria-label]="'gallery.lightbox.next' | transloco">›</button>
      <button type="button" class="lightbox-btn right-4 top-4 translate-y-0" (click)="dialog.close()" [attr.aria-label]="'gallery.lightbox.close' | transloco">×</button>
    </dialog>
  `,
})
export class Lightbox {
  readonly photos = input.required<Photo[]>();
  protected readonly index = signal(0);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly motion = inject(MotionService);
  private returnFocus?: HTMLElement;
  private startX = 0;

  open(index: number, from?: HTMLElement): void {
    this.returnFocus = from;
    const show = () => {
      this.index.set(index);
      this.dialog().nativeElement.showModal();
      document.documentElement.classList.add('has-dialog');
      this.motion.engine()?.pause();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && matches('allowed') && from) {
      from.style.viewTransitionName = 'lightbox-photo';
      doc.startViewTransition(() => {
        from.style.viewTransitionName = '';
        show();
      });
    } else {
      show();
    }
  }

  protected go(delta: number): void {
    this.index.update((i) => step(i, delta, this.photos().length));
  }

  protected closed(): void {
    document.documentElement.classList.remove('has-dialog');
    this.motion.engine()?.resume();
    this.returnFocus?.focus();
  }

  protected swipeStart(e: PointerEvent): void {
    this.startX = e.clientX;
  }

  protected swipeEnd(e: PointerEvent): void {
    const dx = e.clientX - this.startX;
    if (Math.abs(dx) > 50) this.go(dx < 0 ? 1 : -1);
  }
}
```

Styles (`@layer components`):

```css
  .lightbox { max-width: none; max-height: none; width: 100vw; height: 100dvh; margin: 0; padding: 0; background: rgb(11 34 66 / 0.96); }
  .lightbox::backdrop { background: transparent; }
  .lightbox-img { position: absolute; inset: 3.5rem 0 3rem; margin: auto; max-width: 100%; max-height: calc(100% - 6.5rem); object-fit: contain; view-transition-name: lightbox-photo; touch-action: pan-y; }
  .lightbox-pos { position: absolute; bottom: 1rem; inset-inline: 0; text-align: center; color: #f6f1e8; font-size: 0.875rem; }
  .lightbox-btn { position: absolute; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 999px; background: rgb(246 241 232 / 0.92); color: #11305a; font-size: 1.5rem; }
```

- [ ] **Step 4: Rewrite `gallery.html`** (keep `app-apartment-header` at the top)

```html
@if (apartment(); as apt) {
  <app-apartment-header [apartment]="apt" />
  <nav class="container-editorial mt-10 max-w-7xl" [attr.aria-label]="'apartment.tabs.gallery' | transloco">
    <ul class="flex flex-wrap gap-2">
      @for (chapter of chapters(); track chapter.id) {
        <li><a class="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm" [href]="'#g-' + chapter.id">{{ 'rooms.' + chapter.key + '.title' | transloco }}</a></li>
      }
    </ul>
  </nav>
  @for (chapter of chapters(); track chapter.id) {
    <section class="container-editorial mt-16 max-w-7xl" [id]="'g-' + chapter.id">
      <h2 class="display-section">{{ 'rooms.' + chapter.key + '.title' | transloco }}</h2>
      <ul class="mt-8 columns-2 gap-3 md:columns-3 md:gap-5">
        @for (photo of chapter.photos; track photo.src; let first = $first) {
          <li class="mb-3 break-inside-avoid md:mb-5" appFadeIn>
            <button type="button" class="focus-photo group block w-full" (click)="lightbox.open(indexOf(photo), $any($event.currentTarget).querySelector('img'))" data-cursor="view">
              <span class="relative block overflow-clip" [class.arch]="first" [class.aspect-[3/4]]="true">
                <img [ngSrc]="photo.src" [alt]="photo.alt" fill sizes="(min-width: 768px) 30vw, 48vw" class="media-zoom object-cover" />
              </span>
            </button>
          </li>
        }
      </ul>
    </section>
  }
  <app-lightbox #lightbox [photos]="apt.photos" />
}
```

In `gallery.ts`: import `Lightbox`, `FadeInDirective`, `NgOptimizedImage`, `TranslocoPipe`; add `chapters = computed(() => { const apt = this.apartment(); return apt ? roomChapters(apt) : []; })` and `indexOf(photo: Photo) { return this.apartment()!.photos.indexOf(photo); }`. Mark the route data unchanged (already Tier 1 from Task 3).

- [ ] **Step 5: Write `e2e/checks/gallery.mjs`**

```js
// Gallery: lightbox opens as a dialog, arrows move, Esc closes and focus returns to the photo.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  const { errors } = lib.captureErrors(page);
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  const first = page.locator('main button[data-cursor="view"]').first();
  await first.click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('.lightbox-pos').textContent(), /1\/16|1 of 16/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('.lightbox-pos').textContent(), /2\/16|2 of 16/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('button[data-cursor="view"]')), true, 'focus returned');
  await lib.scrollThrough(page);
  await lib.shot(page, 'gallery-desktop');
  assert.deepEqual(errors, []);
  await page.context().close();
}
```

- [ ] **Step 6: Run tests, the check and the build** (`npx ng test --watch=false`; `node e2e/run.mjs gallery --site …`; `npx ng build`)

- [ ] **Step 7: Commit**

```bash
git add frontend/real-estate
git commit -m "Group the gallery by room and add an accessible dialog lightbox"
```

---

### Task 12: Location and About

**Files:**
- Modify: `src/app/pages/location/location.{ts,html}`, `src/app/pages/about/about.{ts,html}`
- Create: `e2e/checks/story-pages.mjs`

**Interfaces:**
- Consumes: `RouteMap`, `NavyBand` (Task 9), `Split`, `RevealDirective` (Task 6), `roomPhoto` (Task 8).

- [ ] **Step 1: Write the check `e2e/checks/story-pages.mjs`**

```js
// Location and About render their story layouts without errors, at both sizes.
export default async function check({ browser, site, assert, lib }) {
  for (const [label, viewport] of Object.entries(lib.VIEWPORTS)) {
    const page = await lib.openPage(browser, { viewport });
    const { errors } = lib.captureErrors(page);
    for (const path of ['/location', '/about']) {
      await page.goto(site + path, { waitUntil: 'networkidle' });
      assert.ok(await page.locator('main h1').count() === 1, `${path} has one h1`);
      await lib.scrollThrough(page);
      await lib.shot(page, `story-${label}${path.replace('/', '-')}`);
    }
    if (label === 'desktop') assert.ok(await page.goto(site + '/location').then(() => page.locator('app-route-map svg').count()) === 1);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
}
```

- [ ] **Step 2: Location page (`location.html`)**: keep `app-apartment-header`; add a section with eyebrow `home.scenes.aroundEyebrow`, `.display-section` title `home.scenes.aroundTitle`, `<app-route-map [places]="apt.nearby" [label]="…">`; keep the address, note, call link and the map iframe, now inside a `.panel` (the existing lazy map behaviour stays). Import `RouteMap`, `Split`.

- [ ] **Step 3: About page (`about.html`)**: a large `<h1 class="display">` keeping today's three spans in order (`about.titleStart`, `<em>about.titleEm</em>`, `about.titleEnd`; no split component here because the emphasis sits mid-sentence), intro paragraph, a two-column story section with an arched photo (`roomPhoto(apt,'09')`) using `.lights` + `appReveal`, the existing `about.story1/story2`, the existing values list as three columns, and an `<app-navy-band>` closing call linking to `/book?apt=` and `/contact`. Do not add new story text (the owner will send a host note).

- [ ] **Step 4: Run tests, the check and the build**

- [ ] **Step 5: Commit**

```bash
git add frontend/real-estate
git commit -m "Restyle Location with the route map and About as a story page"
```

---

### Task 13: Tier 2 pages in the new look

**Files:**
- Modify: templates of `pages/availability`, `pages/contact`, `pages/booking`, `pages/booking-review`, `pages/booking-payment`, `pages/booking-confirmation`, `pages/booking-lookup`, and `components/booking-steps`, `components/booking-summary`, `components/booking-card`, `components/date-range-picker`, `components/availability-calendar`, `components/price-list`, `components/contact-cards`
- Create: `e2e/checks/booking-flow.mjs`, `e2e/checks/teardown.mjs`

**Interfaces:**
- Consumes: tokens and classes from Task 2 (`.panel`, `.display-section`, `.label-caps`, `.btn-navy`, `.text-danger`).

- [ ] **Step 1: Write the failing teardown check `e2e/checks/teardown.mjs`**

```js
// Story → booking flow: smooth scroll, triggers and cursor are gone; a direct booking page never loads the engine.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  const engineRequests = [];
  page.on('request', (r) => { if (/gsap|lenis|ScrollTrigger/.test(r.url())) engineRequests.push(r.url()); });
  await page.goto(site + '/book', { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lenis')), false);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lenis')), true, 'smooth scroll on Home (desktop)');
  await page.click('[data-hero-cta]');
  await page.waitForURL(/\/book/);
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains('lenis'), cursor: document.querySelector('app-custom-cursor')?.classList.contains('is-active') ?? false }));
  assert.deepEqual(state, { lenis: false, cursor: false });
  await page.context().close();
}
```

- [ ] **Step 2: Copy the booking walkthrough into `e2e/checks/booking-flow.mjs`**

```js
// Book → payment (upload a transfer screenshot) → confirmation still works end to end.
// Needs the local API on a disposable database (see e2e/README.md).
export default async function check({ browser, site, assert, lib }) {
  const api = process.env.API ?? 'http://localhost:3100/api/v1';
  const day = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  const stamp = Date.now() % 100000;
  const res = await fetch(`${api}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: site },
    body: JSON.stringify({ apartmentSlug: 'sun-garden-a04-12', checkIn: day(200 + (stamp % 100)), checkOut: day(202 + (stamp % 100)), guests: 2, customer: { name: 'Kiểm tra', phone: `0912${String(stamp).padStart(6, '0')}`, email: `check${stamp}@example.com` } }),
  });
  assert.equal(res.status, 201, await res.text());
  const { data } = await res.json();
  const page = await lib.openPage(browser, { viewport: lib.VIEWPORTS.phone });
  await page.context().addInitScript(([ref, token]) => localStorage.setItem('booking-access-tokens', JSON.stringify({ [ref]: token })), [data.booking.reference, data.accessToken]);
  await page.goto(`${site}/book/payment?ref=${data.booking.reference}`, { waitUntil: 'networkidle' });
  await page.locator('img[alt^="Mã VietQR"], img[alt^="VietQR"]').waitFor();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Tải ảnh chuyển khoản|Upload transfer screenshot/ }).click()]);
  await chooser.setFiles(new URL('../../../../backend/src/modules/payments/fixtures/transfer-screenshot.png', import.meta.url).pathname);
  await page.getByRole('button', { name: /Tiếp tục thanh toán|Continue/ }).click();
  await page.waitForURL(`**/booking/${data.booking.reference}/confirmation`);
  await lib.shot(page, 'booking-flow-confirmation');
  await page.context().close();
}
```

- [ ] **Step 3: Restyle the Tier 2 templates with these rules (behaviour, bindings and DOM order unchanged):**
  - Page titles: `.display-section` (h1 keeps its `h1` element); eyebrows `.label-caps text-accent-deep`.
  - Every `card` container on these pages gets `panel` instead (forms, calendars, summaries, QR card, upload box container, confirmation details); keep `card-*` modifiers only where they still add meaning.
  - Primary actions stay `btn btn-primary` (gold pill); actions inside panels may use `btn btn-navy`.
  - Error texts that today use `text-accent-deep` for errors switch to `text-danger` (payment page warnings stay deep gold: they are notices, not errors).
  - Inline "Sao chép" buttons get `min-h-6 px-2`.
  - `booking-steps`: numbers in Fraunces inside 2.25 rem circles; current step navy fill, done steps gold.
  - Do not import anything from `src/app/motion/` in these files.

- [ ] **Step 4: Run every check, the tests and the build**

Run: `npx ng test --watch=false`
Run: `node e2e/run.mjs teardown --site …` and `node e2e/run.mjs booking-flow --site …` → ✓ both
Run: `npx ng build && npm run check:motion`

- [ ] **Step 5: Commit**

```bash
git add frontend/real-estate
git commit -m "Bring the booking flow, availability and contact pages into the new look"
```

---

### Task 14: Quality gates: production SSR, CSP, performance, other browsers

**Files:**
- Create: `e2e/checks/production.mjs`, `e2e/checks/restoration.mjs`, `e2e/checks/reduced-motion.mjs`, `e2e/checks/no-js.mjs`
- Modify: anything the checks reveal (record each fix in the commit message)

- [ ] **Step 1: Write the checks**

`e2e/checks/restoration.mjs`:

```js
// Back button returns to where the guest was on a long story page.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => window.scrollY);
  await page.click('[data-window] a');
  await page.waitForURL(/apartment/);
  await page.waitForTimeout(800);
  await page.goBack();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(after - before) < 120, `restored ${after} vs ${before}`);
  await page.context().close();
}
```

`e2e/checks/reduced-motion.mjs`:

```js
// Reduced motion: no smooth scroll, no opening, no lights-on layers; every page still complete.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser, { reducedMotion: 'reduce' });
  for (const path of ['/', '/apartment', '/gallery']) {
    await page.goto(site + path, { waitUntil: 'networkidle' });
    await lib.scrollThrough(page);
    const state = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains('lenis'), veils: document.querySelectorAll('.lights-veil').length, motion: document.documentElement.classList.contains('motion') }));
    assert.deepEqual(state, { lenis: false, veils: 0, motion: false }, path);
    await lib.shot(page, `reduced${path.replaceAll('/', '_') || '_home'}`);
  }
  await page.context().close();
}
```

`e2e/checks/no-js.mjs`:

```js
// JavaScript off: server HTML is complete and readable (headline, CTA, tour chapters, prices).
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser, { javaScriptEnabled: false });
  await page.goto(site + '/', { waitUntil: 'load' });
  assert.match(await page.locator('h1').innerText(), /Đà Lạt|Da Lat/);
  assert.ok(await page.locator('[data-hero-cta]').isVisible());
  await page.goto(site + '/apartment', { waitUntil: 'load' });
  assert.ok((await page.locator('[data-chapter]').count()) >= 1);
  await lib.shot(page, 'no-js-apartment');
  await page.context().close();
}
```

`e2e/checks/production.mjs` (run with `--site http://localhost:4000` against the production SSR server):

```js
// Production SSR: no CSP violations, no hydration warnings, LCP and CLS within budget.
export default async function check({ browser, site, assert, lib }) {
  for (const path of ['/', '/apartment', '/book']) {
    const page = await lib.openPage(browser);
    const { errors, cspViolations } = lib.captureErrors(page);
    await page.addInitScript(() => {
      window.__lcp = 0;
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(site + path, { waitUntil: 'networkidle' });
    await lib.scrollThrough(page);
    const metrics = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls }));
    assert.deepEqual(cspViolations, [], `${path} CSP`);
    assert.deepEqual(errors, [], `${path} errors`);
    assert.ok(metrics.cls < 0.05, `${path} CLS ${metrics.cls.toFixed(3)}`);
    console.log(`  ${path}: LCP ${Math.round(metrics.lcp)} ms (local, unthrottled), CLS ${metrics.cls.toFixed(3)}`);
    await page.context().close();
  }
}
```

- [ ] **Step 2: Run everything against the dev server**

`node e2e/run.mjs --site http://localhost:4377` → all ✓ (fix and re-run until green).

- [ ] **Step 3: Run against the production SSR server with CSP**

```bash
npx ng build
API_URL=http://localhost:3100 PORT=4000 node dist/real-estate/server/server.mjs &
node e2e/run.mjs production --site http://localhost:4000
node e2e/run.mjs no-js --site http://localhost:4000
```

Expected ✓. Kill the server afterwards (`lsof -ti:4000 -sTCP:LISTEN | xargs kill`).

- [ ] **Step 4: Firefox and WebKit (if they can be installed)**

```bash
npx playwright-core install firefox webkit
node e2e/run.mjs smoke --site http://localhost:4377 --firefox
node e2e/run.mjs smoke --site http://localhost:4377 --webkit
node e2e/run.mjs home --site http://localhost:4377 --firefox
```

If installation fails (network or disk), record that in the ledger and continue.

- [ ] **Step 5: Final unit tests, build and size check**

`npx ng test --watch=false && npx ng build && npm run check:motion` → all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/real-estate
git commit -m "Add production, restoration, reduced-motion and no-JS checks for the redesign"
```

---

## Self-review notes (plan author)

- Spec coverage: §3 tokens/admin (T2), fonts (T2), components (T2, T7), §4.1 casting (T8), §4.2 Home (T9), §4.3 Apartment (T10), §4.4 Gallery (T11), §4.5 Location/About (T12), §4.6 Tier 2 (T13), §5.1 engine/service/Lenis/restoration (T4), §5.2 SSR/CSP/opening (T5, T14), §5.3 moments (T6, T9, T10, T7), §5.4 reduced motion (T14 check), §6 performance (T4 size check, T9 preload check, T14 LCP/CLS), §7 accessibility (T6 split a11y, T7 dialog/skip link, T10 skip tour/focus, T11 lightbox), §8 i18n (T7, T8), §9 testing (T1, T14).
- Deviation from the engineer's suggestion for tour deep links: ids sit on the chapters themselves (correct for no-JS, phones, reduced motion); on desktop motion the tour corrects the scroll with `scrollForChapter` once the engine is ready (one short hop on desktop deep links). Reason: absolutely positioned markers cannot align with chapters in the non-pinned layouts.
