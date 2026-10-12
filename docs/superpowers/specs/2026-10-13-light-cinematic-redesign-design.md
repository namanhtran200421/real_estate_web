# Light-cinematic redesign of the guest site (v2, after council round 1)

Date: 2026-10-13 · Branch: `redesign/light-cinematic` · App: `frontend/real-estate` (Angular 22 zoneless, SSR + incremental hydration, Tailwind v4, Transloco vi/en)

v1 was reviewed by the council (creative director, guest UX/accessibility, Angular/performance). Their findings and how disagreements were settled are in `docs/superpowers/redesign-ledger.md`. This version incorporates every blocking finding.

## 1. Intent and concept

Make the VN Booking Hub guest site feel like an award-winning hospitality site while a Vietnamese guest on a mid-range phone can check dates and book without friction. It sells one real apartment, Sun Garden A04-12 in Đà Lạt, and must keep working if the owner adds more apartments.

**Concept: "Một ngày ở A04-12" (a day at A04-12).** The story pages read as one Đà Lạt day: dawn mist lifting (opening), clear daylight through the rooms (story scenes), dusk as the windows light up (Home scene 4), a navy night band (promises), and warm lamps at the final call. **The page stays light throughout** (the owner rejected the dark look); the day is told through motion, copy and the navy bands only.

**Success criteria**
- Art direction that holds up with motion off.
- Four choreographed signature moments tied to the concept (§5.3), plus a phone-native moment.
- ~60 fps on a mid-range Android phone; booking flow speed and behaviour unchanged; LCP < 2.5 s (simulated 4G) on Home and Apartment; CLS ≈ 0.
- WCAG 2.2 AA; correct with reduced motion, keyboard only, JavaScript disabled, Firefox and WebKit.
- Vietnamese and English complete (translation key parity test green).

## 2. Scope

| Tier | Pages | Treatment |
| --- | --- | --- |
| 1 · Story | Home, Apartment, Gallery, Location, About | New visual system + motion engine (lazy) |
| 2 · Practical | Availability, Contact, Book, Book review, Payment, Confirmation, Booking lookup | New visual system, panels, CSS micro-interactions only; motion engine never loads, and is torn down when navigating here |
| — | Owner admin (`/admin/**`, including `/admin/login`) | Looks exactly as today |

Out of scope: backend, database, booking logic, pricing, emails.

## 3. Visual system (approved by the owner; contrast fixes from the council)

### 3.1 Tokens and scoping

Guest values become the `@theme` defaults in `src/styles.css`, so `html`'s inherited font, colour and background are the guest ones. **Admin keeps today's look** through one stylesheet `src/app/admin/admin-theme.css` applied to the hosts of `AdminLayout` and `AdminLogin` (both: `/admin/login` is outside the layout). It redefines the old token values and sets the host's `font-family`, `color`, `background-color` and `min-height: 100dvh`, so everything inside the admin inherits today's values.

| Token | Guest value | Role | Contrast |
| --- | --- | --- | --- |
| `--color-background` | `#f6f1e8` ivory | page | — |
| `--color-muted` | `#ece4d6` sand | alternate sections, footer | — |
| `--color-card` | `#fffdf8` paper | panels | — |
| `--color-foreground` | `#11305a` logo navy | headings, primary text | 11.7:1 on ivory |
| `--color-muted-foreground` | `#5d6474` slate | body text | 5.3:1 on ivory |
| `--color-accent` | `#ddb37f` logo gold | buttons, rules | navy on gold 6.3:1 |
| `--color-accent-secondary` | `#e6c194` | button hover | — |
| `--color-accent-foreground` | `#11305a` | text on gold | 6.3:1 |
| `--color-accent-deep` | `#7a5426` deep gold | gold text, labels | 6.0 on ivory, 5.3 on sand |
| `--color-accent-muted` | `rgb(221 179 127 / .14)` | tints | — |
| `--color-border` | `#e3d9c8` | decorative hairlines | — |
| `--color-input` | `#8f8472` | input/control borders | 3.6:1 (1.4.11) |
| `--color-ring` | `#7a5426` | focus ring | — |
| new `--color-navy-deep` | `#0b2242` | band gradients, ridges | ivory on it 14.1:1 |
| new `--color-danger` | `#a3261b` | errors (payment, forms) | ≥ 6:1 on ivory and paper |

`meta[name=theme-color]` → `#f6f1e8`. Navy bands (`.band-navy`) locally swap foreground/background (ivory text, logo-gold accents, gold focus ring). Use `overflow-x: clip`, never `overflow: hidden`, on page-level ancestors (hidden breaks sticky).

### 3.2 Typography

- Display/headings: **Fraunces** (`opsz` 9–144, `wght` 300–400, italic for emphasis; the `SOFT` axis is dropped to save bytes). Display uses `opsz` 144, light 300, line-height **≥ 1.05** (Vietnamese stacked marks ể ộ ủ ạ must never clip).
- Text: **Be Vietnam Pro** 400/500 (body weight ≥ 400). Body 17/1.7 desktop, 16/1.65 phones. Labels: 500, uppercase, **≥ 12 px, tracking ≤ 0.12em** (Vietnamese words keep their gaps).
- Codes: **IBM Plex Mono** (references, transfer notes).
- `index.html` fonts URL: Fraunces + Be Vietnam Pro + Plex Mono **plus** today's Playfair Display + Source Sans 3 (only faces that render download, so guests never fetch the admin fonts). A size-adjusted local fallback (`Georgia` with `size-adjust`/`ascent-override`) for the display face limits swap shift. Font budget: guest first view ≤ 260 kB woff2 total.
- All families ship Vietnamese subsets (verified 12/10/2026).

### 3.3 Logo, imagery, atmosphere

- Original logo on ivory only (header pill, footer). Never on navy or over photos.
- **Photos are portrait (1600×2133)**: triptychs, arched villa-window frames (`border-radius: 999px 999px r r`), tall split layouts, phone full-bleed portraits; crops via `object-position`. No photo appears twice on one page. Photos 01, 11, 12 are never heroes.
- Hand-drawn Đà Lạt motifs as inline SVG (`aria-hidden`): pine-ridge silhouettes (scroll-linked parallax only, never an autoplaying loop) and an ivory mist gradient.
- Faint paper grain on ivory sections (static SVG noise, opacity ≤ 0.04).

### 3.4 Components

- **Header**: floating pill with ivory backing (82% + 12 px blur) **at all times**, including over photos; navy text; gold "Đặt lịch" pill visible down to 360 px; never hides on scroll; height ≤ 104 px (router anchor offset stays 104). Gets `view-transition-name: site-header`.
- **Mobile menu** and **lightbox**: native `<dialog>` with `showModal()` (Android back closes; focus trapped; Esc), `lenis.stop()` while open.
- **Footer**: sand, original logo, existing columns.
- **Buttons**: gold pill (navy text) primary; navy pill on panels; outline pill tertiary; gold-underline text links. Targets ≥ 44 px (≥ 24 px for inline "Sao chép").
- **Focus**: 2 px ring in `--color-ring` with 2 px offset; over photos a two-tone ring (ivory outer, navy inner).
- **Panel** (`.panel`): paper, 1 px border, 16 px radius, soft long navy shadow. Booking card, price list, calendar, forms, payment QR card (QR on a white tile), confirmation details.
- **Phone bottom bar** (Apartment only): "từ {price} ₫ · Đặt lịch" → `/book?apt={slug}`, 48 px, appears once the hero leaves view, hidden (and `inert`) while the booking card is visible or a dialog is open; page gets bottom padding + safe area and `scroll-padding-bottom`.
- **Route change**: focus moves to the page `h1` (`tabindex="-1"`), except on the first load.

## 4. Pages

### 4.1 Photo casting (Sun Garden; other apartments fall back to their own photo list)

`src/app/data/sun-garden-rooms.ts` maps photos to room chapters, in tour order:

| # | Chapter (vi / en) | Photos | Note |
| --- | --- | --- | --- |
| 1 | Phòng khách & ăn / Living & dining | 02, 06, 09, 10 | balcony toward Xóm Lèo |
| 2 | Bếp / Kitchen | 01, 08 | |
| 3 | Hai phòng tắm / Two bathrooms | 11, 12 | shown as a pair |
| 4 | Phòng ngủ 1 / Bedroom 1 | 13, 14 | |
| 5 | Phòng ngủ 2 / Bedroom 2 | 16, 15, 03 | balcony toward Nam Hồ; ends the tour on light |

Heroes: Home = 05 (phone) / triptych 04 · **05** · 14 (desktop, 05 is the one `priority` image); Apartment = 07. Story copy lines per chapter are i18n strings (`rooms.*`).

### 4.2 Home: "Một ngày ở A04-12" in six scenes

1. **Dawn (opening)**. Desktop: full-width triptych read as one French window (4 px ivory window bars; centre pane 05 taller and arched; side panes 04 and 14 lazy, `display:none` on phones). Phone: full-bleed 05. Headline "Một góc Đà Lạt / *của riêng bạn*" as template line spans; price from the API; primary CTA "Xem lịch & đặt" → `/book?apt={slug}`. Opening motion §5.3.3.
2. **Morning (statement)**. A large Fraunces paragraph (listing tagline + i18n line). Words fill from slate to navy as it scrolls through (§5.3.3).
3. **Daylight (the place)**. Arched detail crop of 02 (the table with the magazine) beside static Fraunces facts from the API (guests, bedrooms, beds, bathrooms), revealed line by line; plus the honest line "Đà Lạt mát quanh năm, quạt trần là đủ" (listing: no air-con, ceiling fans). No count-up.
4. **Dusk: "Năm khung cửa" (five windows)**. Five arched windows in a row like a villa front, one per chapter (09, 08, 12, 13, 16); as the row enters, they light up one after another (lights-on, 150 ms apart). Phones: two columns. Each window links to its tour chapter on the Apartment page.
5. **Night (navy band)**. The three promises in calmer copy (new `home.scenes.promises.*` keys), pine ridges drifting with scroll, gold CTA.
6. **Lamps (around + final call)**. SVG route diagram: apartment at the centre, lines to the listing's `nearby[]` places with journey times; lines draw in. Then the closing headline and CTA. If more than one apartment exists, an "Căn hộ khác" row follows.

### 4.3 Apartment: "walk through it"

1. **Hero**. Desktop split: left on ivory (eyebrow, Fraunces title, facts, price, CTA → `/book?apt=`), right a tall photo 07 bleeding to the edge (`priority`). Phone: full-bleed 07 under the header pill, copy below on ivory (no text over the photo on phones). Tabs (Tổng quan · Hình ảnh · Lịch trống · Vị trí) stay.
2. **Room tour** (§5.3.2). Skip link "Bỏ qua phần tham quan" before it. Desktop motion devices: sticky horizontal tour; last card "Xem lịch trống". Phones in portrait with height ≥ 600 px: full-screen stacking chapters (CSS sticky); otherwise a plain vertical stack. Chapter headings are `h3`.
3. **Details** two-column with the booking card on a sticky panel (desktop); anchors (#thong-tin, #tien-nghi, #noi-quy, #bang-gia, #danh-gia) keep working.
4. Location (map panel, loaded near viewport), reviews (honest empty state), explore more, navy closing band.

### 4.4 Gallery

Chapter chips jump to sections; masonry (2 columns phones, 3 desktop); the first photo of each chapter in an arch; thumbnails fade in (300 ms, no lights-on). Tapping opens the lightbox `<dialog>`: grows out of the thumbnail via a View Transition where supported; swipe, arrow keys and ≥ 44 px prev/next buttons; polite live region "Ảnh 3/16"; focus returns to the thumbnail.

### 4.5 Location, About

Location: route diagram full size, nearby list (journey-time order), Google map panel on demand. About: existing about.* copy in the new layout, arched photos, promises, closing call. **No invented host story**; the owner is asked for a three-sentence host note (listed in the owner summary).

### 4.6 Tier 2

New header/footer/type/colours; content on panels; layouts and behaviour unchanged; CSS-only micro-interactions. Payment page: countdown, QR card on white tile, upload box, warnings keep their structure; errors use `--color-danger`.

## 5. Motion

### 5.1 Architecture

- **Engine module** `src/app/motion/engine.ts` is the only file importing `gsap`, `gsap/ScrollTrigger`, `gsap/SplitText` and `lenis` (pinned `gsap@3.15.0`, GreenSock Standard no-charge licence; `lenis@1.3.26`, MIT). Everything else uses `import type`. Measured ≈ 53 kB gz; a build check script over `ng build --stats-json` fails if the engine chunk exceeds 60 kB gz.
- **`MotionService`** (root, browser-only): resolves `reduced` (prefers-reduced-motion), `desktopMotion` (`(hover:hover) and (pointer:fine) and (min-width:1024px)`), and `tier` from route data `{ motion: true }` on Tier 1 routes. On the first Tier 1 page it `import()`s the engine after `afterNextRender`. On navigation into a Tier 2 route it destroys Lenis, kills every ScrollTrigger, reverts every SplitText and removes the cursor.
- **Directives** (no-ops on the server, with reduced motion, or before the engine loads): `appReveal` (lights-on, for photos ≥ 40vw), `appFadeIn` (thumbnails), `appSplitLines` (headings), `appWordFill` (statement), `appParallax` (ridges), `appDrawPath` (route lines). Each component uses `gsap.matchMedia()` and calls `revert()` on destroy. Never set signals inside GSAP `onUpdate` callbacks (zoneless app).
- **Components**: `RoomTour`, `RouteMap`, `CustomCursor`, `MobileBookBar`, `Lightbox`.
- **Lenis** (desktop motion only): `autoRaf:false`, driven by `gsap.ticker`; `gsap.ticker.lagSmoothing(0)`; `allowNestedScroll:true` (the `app-select` listbox scrolls natively); `stopInertiaOnNavigate:true`; `anchors:false`; `lenis.css` imported. `lenis.on('scroll', ScrollTrigger.update)`.
- **Scroll restoration**: forward navigation → top; back/forward (popstate) → after `ScrollTrigger.refresh()`, `lenis.scrollTo(savedPosition, { immediate: true })` (or native when Lenis is off). Anchor scrolling stays the router's (offset 104).
- **Animated properties**: `transform`, `opacity`, SVG `stroke-dashoffset` only. Scrubbed scale ≤ 1.05.

### 5.2 No-JS, hydration and CSP safety

- Server HTML renders the final, visible state of everything.
- The opening is **pure CSS keyframes** in an inline `<style>` in `index.html` (kept verbatim; `reduceInlineStyles` off if needed), gated by `html.motion-opening`, which a tiny inline `<head>` script adds when reduced motion is off, the pointer is fine, the viewport ≥ 1024 px, and it is the first page of the session (`sessionStorage`). Both SSR and `index.csr.html` responses get the CSP nonce stamped on that script.
- Below-the-fold reveals start only after the engine loads, and only for elements not yet in view.
- Motion code runs in `afterNextRender` of hydrated components; deferred blocks animate when they hydrate. No NG05xx hydration warnings allowed.
- SplitText: autoSplit + onSplit, after `document.fonts.ready`; only an `aria-hidden` visual copy is split (`aria: 'none'`), next to an `sr-only` copy with the real text, so screen readers and Chrome Translate read normal text.

### 5.3 Signature moments

1. **Lights on (daylight bloom)**. Photos ≥ 40vw sit under an ivory mist veil `rgba(246,241,232,.55)` and a warm wash (`rgba(221,179,127,0)`). Scrubbed from 85% → 40% of viewport: veil → 0, warm wash 0 → .12 → 0, image scale 1.05 → 1. "Năm khung cửa" plays it as a timed sequence (150 ms apart) once in view.
2. **Room tour**.
   - Desktop motion and viewport height ≥ 700 px: the section's height is reserved in CSS (`html.motion` + media query, ≈ 250vh total), an inner box is `position: sticky; top: 0`, and GSAP scrubs only the track's `x` (scrub 0.6) plus the gold progress line `scaleX`. Deep links: absolutely positioned id markers at `top: calc(n / (N − 1) * (100% − 100vh))`, so native anchors work before the engine loads. Focus entering a chapter scrolls to its marker.
   - Portrait phones with height ≥ 600 px: each chapter is `position: sticky; top: <header height>; min-height: calc(100svh − <header height>)` and the next slides over it (pure CSS). Landscape or shorter screens, and reduced motion: plain stacked chapters.
3. **Opening + type**.
   - Opening (desktop, first page of the session, ≤ 900 ms, CSS only): an ivory mist layer over the hero fades 1 → 0 and drifts up; the LCP image only transforms (scale 1.04 → 1, never opacity 0); headline line spans rise from 105% inside masks (masks have `padding-block: .15em; margin-block: -.15em`). Header, price and CTA are visible from the first frame.
   - Headings with `appSplitLines` reveal line by line (lines → words, never characters).
   - Statement word fill: an `aria-hidden` navy copy layered over the slate text; its words fade 0 → 1 with scroll (slate is already 5.3:1, so no frame drops below AA).
4. **Smooth scroll + transitions + cursor** (desktop motion).
   - Lenis as §5.1.
   - Page transitions: `withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated })`, which skips reduced motion, any route change involving Tier 2, and same-path changes (`#chapter`, `?apt`). 300 ms crossfade; `view-transition-name` set only on the clicked element just before navigating (a photo or window morphs into the destination's chapter photo or hero).
   - Cursor: 10 px navy dot (transform), growing to a 72 px gold ring labelled "Xem" only over photos that open the lightbox; hidden over inputs, on touch and with reduced motion; the native cursor stays visible.
5. **Phone moment**: the stacking full-screen room chapters (5.3.2) and the Home "five windows" lighting up.

### 5.4 Reduced motion and fallbacks

Reduced motion: no opening, Lenis, cursor, reveals, word fill, parallax or sticky stacking; View Transitions skipped. No View Transitions support: normal navigation. Firefox/WebKit: the same GSAP motion.

## 6. Performance

- Tier 2: initial JS within today's budget; no engine request (asserted in browser checks); engine torn down when navigating in.
- Engine chunk ≤ 60 kB gz (script check).
- Exactly one `priority` image per page. `sizes`: desktop portrait panes `(min-width:1024px) 75vh`; phone heroes `(max-width:767px) 320px` (yields ≤ 960w at DPR 3). Widths stay `[400, 640, 960, 1280, 1600]`.
- LCP < 2.5 s (simulated 4G) Home/Apartment; CLS ≈ 0 (room tour height reserved in CSS; fallback font metrics).
- Font budget ≤ 260 kB woff2 on a guest's first view.

## 7. Accessibility

AA contrast per §3.1; visible two-tone focus over photos; skip links (main, room tour); dialogs native; live region for lightbox position; decorative SVG/overlays `aria-hidden`; photos keep listing alt text; labels ≥ 12 px; route-change focus to `h1`; no autoplaying motion (parallax is scroll-linked only).

## 8. Internationalisation

New keys in both `vi.json` and `en.json`: `home.scenes.*` (including calmer promises), `rooms.*`, `motion.*` (skip link, cursor label), `gallery.lightbox.*`, `apartment.bookBar.*`. Parity test stays green.

## 9. Testing and verification

- Unit (Vitest): room casting/chapter mapping and fallback; motion preference resolution; route tier data (Tier 1 vs Tier 2 marked correctly); deep-link marker position helper; the SplitText wrapper keeps the accessible text equal to the source string; route-map layout helper.
- Build: `npx ng build` (no new warnings) + engine chunk size check; `npx ng test --watch=false` green.
- Browser checks (Playwright; Chromium, plus Firefox and WebKit if their browsers can be installed):
  - every Tier 1 and Tier 2 page at 1440×900 and 390×844, motion on and `reducedMotion: 'reduce'`, JavaScript disabled once;
  - against the **production SSR server** (CSP on): a `securitypolicyviolation` listener, no console errors, no NG05xx;
  - LCP/CLS observers on Home and Apartment;
  - Home → Book → Payment: no `html.lenis`, `ScrollTrigger.getAll().length === 0`, no engine request on a direct Tier 2 load;
  - Back-button position restored; anchors land correctly; tour deep links land on the right chapter;
  - Vietnamese diacritics screenshot test (Ở, ễ, ộ, ạ in display type, unclipped);
  - booking flow end to end (book → payment upload → confirmation) as in the existing walkthrough.
- Council review of screenshots and pages before finishing.

## 10. Risks

Portrait photos on wide screens (triptych/split compositions); hydration vs. motion (after-render only, revert on destroy); Lenis vs. sticky/anchors/restoration (rules in §5.1); bundle creep (size check); font weight (budget + fallback metrics); motion engine leaking into Tier 2 (teardown + test).
