# Light-cinematic redesign of the guest site

Date: 2026-10-13 · Branch: `redesign/light-cinematic` · App: `frontend/real-estate` (Angular 22, SSR, Tailwind v4, Transloco vi/en)

## 1. Intent

Make the VN Booking Hub guest site feel like an award-winning hospitality site (Awwwards-style art direction and scroll motion) while a Vietnamese guest on a mid-range phone can still check dates and book without friction. The site sells one real apartment, Sun Garden A04-12 in Đà Lạt, and must keep working if the owner adds more apartments in the admin.

**Success criteria**
- A clear art direction that holds up even with motion off (jurors' first criterion).
- Four choreographed signature moments, not scattered effects (see §5).
- About 60 fps on a mid-range Android phone; the booking flow's speed and behaviour unchanged.
- Correct with `prefers-reduced-motion`, with keyboard only, without JavaScript (server-rendered HTML is complete and visible), and in Firefox (no CSS scroll-timeline there).
- Vietnamese and English copy complete (translation key parity test stays green).

**What the owner said vs. what I assumed.** Owner decisions are listed in `docs/superpowers/redesign-ledger.md`. Assumptions made after the owner went to sleep are marked **(assumed)** and were checked by the council (§11).

## 2. Scope

| Tier | Pages | Treatment |
| --- | --- | --- |
| 1 · Story | Home, Apartment, Gallery, Location, About | New visual system + full motion (GSAP/Lenis loaded lazily) |
| 2 · Practical | Availability, Contact, Book, Book review, Payment, Confirmation, Booking lookup | New visual system, paper panels, CSS micro-interactions only. The motion bundle never loads. |
| — | Owner admin (`/admin/**`) | Untouched, including its fonts and colours |

Out of scope: backend, database, booking logic, pricing, emails, admin.

## 3. Visual system (approved by the owner)

### Tokens

Guest pages redefine the existing Tailwind v4 token names, so every existing utility and component class (`bg-background`, `text-foreground`, `.btn`, `.card`, `.input`…) picks up the new look without per-template edits. Admin keeps today's values.

| Token | Guest value | Role | Contrast |
| --- | --- | --- | --- |
| `--color-background` | `#f6f1e8` ivory | page | — |
| `--color-muted` | `#ece4d6` sand | alternate sections, footer | — |
| `--color-card` | `#fffdf8` paper | panels, cards | — |
| `--color-foreground` | `#11305a` logo navy | headings, primary text | 11.7:1 on ivory |
| `--color-muted-foreground` | `#5d6474` slate | body text | 5.3:1 |
| `--color-accent` | `#ddb37f` logo gold | buttons, rules | navy on gold 6.3:1 |
| `--color-accent-deep` | `#8a612e` deep gold | gold text, labels, focus ring | 4.9:1 |
| `--color-border` | `#e3d9c8` | hairlines | decorative |
| new `--color-navy-deep` | `#0b2242` | navy band gradient, ridges | ivory on it 14.1:1 |

`meta[name=theme-color]` becomes `#f6f1e8`.

**Scoping mechanism.** `App` already knows `inAdmin()`. The guest branch of `app.html` wraps header, main and footer in an element carrying `class="guest"`; `styles.css` redefines the token variables under `.guest`. Tailwind v4 utilities read `var(--color-*)`, so the redefinition cascades. Admin routes render outside `.guest` and keep the `:root` values. Navy bands set `class="band-navy"`, which locally swaps foreground/background tokens (ivory text, gold accents).

### Typography

- Display and headings: **Fraunces** (variable; `opsz` 144 for display, 48 for small headings; `SOFT` 50; weight 300–400). Emphasis: italic in deep gold (on ivory) or logo gold (on navy/photos).
- Text: **Be Vietnam Pro** 300/400/500. Body 17/1.7 on desktop, 16/1.65 on phones. Labels: 500, uppercase, +0.28em tracking.
- Codes (booking references, transfer notes): **IBM Plex Mono** stays.
- All three ship Vietnamese subsets (verified on Google Fonts on 12/10/2026). Instrument Serif, Bodoni Moda, Gloock and DM Serif Display were rejected for lacking Vietnamese.
- Fluid scale: display `clamp(3.5rem, 9vw, 8.25rem)`, section `clamp(2.25rem, 5vw, 4rem)`, sub `1.5rem`.
- Loading: `index.html` loads Fraunces + Be Vietnam Pro + Plex Mono (display=swap). Playfair Display + Source Sans 3 move to the admin: the admin layout injects their stylesheet when it first loads, so admin looks exactly as today.

### Logo, imagery and atmosphere

- The original logo (navy + gold) stays on ivory surfaces; navy bands never carry the logo.
- **Photos are all portrait (1600×2133).** Compositions suit tall photos: desktop hero triptych (three tall photos edge to edge), arched villa-window frames (`border-radius: 999px 999px …`), tall split layouts; phones use single full-bleed portraits. Choose crops with `object-position`.
- Hand-drawn Đà Lạt motifs as inline SVG: two or three pine-ridge silhouettes (parallax layers) and a soft mist gradient at section edges. No stock photos, no video.
- A very faint paper grain on ivory sections (static SVG noise, opacity ≤ 0.04) **(assumed)**.

### Components

- **Header**: floating pill (ivory at 82% opacity + 12 px backdrop blur, navy text, gold "Đặt lịch" pill). Over a hero photo it starts transparent with ivory text, and gains its ivory backing after 80 px of scroll. Keeps the VI/EN switch. Height stays ≤ 104 px so the router's anchor offset still holds.
- **Mobile menu**: full-screen ivory overlay, links in Fraunces 2.5 rem, staggered in (CSS), focus trapped, Esc closes.
- **Footer**: sand background, original logo, the existing columns.
- **Buttons**: gold pill (navy text) primary; navy pill secondary on paper; outline pill (navy 30% border) tertiary; text link with gold underline that draws on hover.
- **Paper panel**: `.panel` = paper background, 1 px border, 16 px radius, long soft navy shadow. Booking card, price list, calendar, forms, payment QR card, confirmation details live on panels.

## 4. Page designs

Room chapters for the 16 photos (fixed mapping in a new `src/app/data/sun-garden-rooms.ts`, used only when the apartment slug is `sun-garden-a04-12`; other apartments get a single "photos" chapter built from their photo list):

| Chapter | Photos |
| --- | --- |
| Phòng khách & ăn (living & dining, balcony door) | 02, 04, 05, 06, 07, 09, 10 |
| Bếp (kitchen) | 01, 08 |
| Phòng ngủ 1 | 13, 14 |
| Phòng ngủ 2 | 16, 15, 03 |
| Hai phòng tắm | 11, 12 |

### Home: "a story in six scenes"

1. **Opening**. Desktop: full-width triptych (living 02 · bedroom 14 · kitchen 01) under a navy gradient; huge headline "Một góc Đà Lạt / *của riêng bạn*" bottom-left; price "từ 1.700.000 ₫/đêm" (from the API) and "Xem lịch trống" bottom-right. Phone: single full-bleed portrait (02) with the same overlay copy. Motion: opening sequence (§5.3).
2. **Statement**. A large Fraunces paragraph (the listing's tagline + a short evocative line from i18n). Words fill from slate to navy as the paragraph scrolls through the viewport.
3. **The place in numbers**. Arched photo (13) beside facts from the API: guests, bedrooms, beds, bathrooms (plus floor/size only if present in the listing text; never hard-coded). Numbers count up once. Lights-on reveal on the photo.
4. **Inside**. Horizontal strip of the five room chapters (one photo each) that moves sideways as you scroll down (desktop; phone: native horizontal scroll-snap). Each card links to the apartment page's tour chapter.
5. **Đặt trực tiếp** navy band: the existing three promises (home.promises.*), pine ridges drifting, gold "Xem lịch trống".
6. **Around Sun Garden + final call**. A hand-drawn SVG route diagram: the apartment in the centre, lines to the nearby places from the listing (`nearby[]`), labels with journey times; lines draw in on scroll. Then a big closing headline and "Đặt lịch". If the owner has more than one apartment, an "Căn hộ khác" row of apartment cards follows.

### Apartment: "walk through it"

1. **Hero**. Desktop: split. Left on ivory: eyebrow (area), Fraunces title, key facts, price, primary CTA. Right: tall photo (05) bleeding to the right edge. Phone: full-bleed portrait with overlay copy. Existing tabs (Tổng quan · Hình ảnh · Lịch trống · Vị trí) stay below.
2. **Room tour**. Desktop and tablet ≥ 768 px: the section pins; vertical scroll moves a horizontal track of chapters (chapter number, room name, one-line description from i18n, 2–3 photos per chapter); a thin gold progress line and chapter counter. Phones and reduced motion: the same chapters stacked vertically with lights-on reveals. Each chapter has an `id` for deep links from Home scene 4.
3. **Details** two-column: left = description, amenities grid (icons stagger in), house rules, check-in/out, price list (panel); right = existing booking card on a panel, `position: sticky` on desktop. **Phones**: a sticky bottom bar "từ 1.700.000 ₫ · Đặt lịch" appears once the hero is out of view and hides when the booking card itself is visible.
4. Location (map panel, loaded near viewport as today), reviews (honest empty state unchanged), "explore more", navy closing band.

### Gallery

Chapter chips (from the room mapping) jump to sections; editorial masonry (two columns on phones, three on desktop) with arched frames for the first photo of each chapter; lights-on reveals. Tapping a photo opens a lightbox that grows out of the thumbnail (View Transition; plain fade where unsupported); swipe and arrow keys navigate; Esc closes; focus returns to the thumbnail.

### Location

The SVG route diagram full size, the nearby list (journey-time order, as today), and the Google map in a panel loaded on demand.

### About

Large-type story (existing about.* copy), arched photos, the three promises, closing call.

### Tier 2 pages

Same header/footer/type/colours; content on panels; existing layouts and behaviour kept. Only CSS transitions (button fills, underline draws, focus rings, panel hover). The payment page's countdown, QR card, upload box and warnings keep their structure; the QR stays on a white tile.

## 5. Motion system

### 5.1 Architecture

- `MotionService` (root, browser-only): decides whether motion runs (`!prefers-reduced-motion`), whether the device is "desktop motion" (`(hover: hover) and (pointer: fine) and (min-width: 1024px)`), and lazily `import()`s a single `motion` chunk containing `gsap`, `gsap/ScrollTrigger`, `gsap/SplitText` and `lenis`. The chunk is requested after the first page's `afterNextRender` and only on Tier 1 routes (route `data: { motion: true }`). Tier 2 routes never import it.
- Directives (standalone, no-ops on the server and when motion is off): `appReveal` (lights-on), `appSplitLines` (heading line reveal), `appWordFill` (statement), `appCountUp`, `appParallax` (ridges, depth), `appDrawPath` (route lines). Each registers with the service and cleans up its ScrollTrigger on destroy.
- Components: `RoomTour`, `RouteMap` (SVG), `CustomCursor`, `HeroOpening` behaviour inside the two hero components, `MobileBookBar`.
- Router: `withViewTransitions()` for page transitions; shared element names (`view-transition-name`) on the clicked apartment/room photo and the destination hero. Lenis scroll position resets on navigation; `ViewportScroller` anchor scrolling goes through Lenis when active.
- Every animation uses `transform` and `opacity` only (and SVG `stroke-dashoffset`). No animated `filter`, `clip-path` on large areas, or layout properties. `will-change` only while a tween runs.

### 5.2 No-JS and hydration safety

- Server HTML renders everything in its final, visible state.
- A tiny inline script in `index.html` `<head>` (it gets the CSP nonce from `stampScriptNonces`) adds `class="motion"` to `<html>` when reduced motion is off, and `motion-opening` when this is the first page of the session (`sessionStorage`). Only CSS under `html.motion` hides the opening's starting states, and a CSS fail-safe (`animation: reveal-failsafe 0s 2.5s forwards`) reveals them if the motion chunk never arrives.
- Below-the-fold reveals are applied by GSAP only once the chunk has loaded, and only to elements not yet in view, so nothing visible ever blinks.
- Motion code runs in `afterNextRender` of hydrated components; deferred (`@defer hydrate`) blocks animate when they hydrate.

### 5.3 The four signature moments

1. **Lights on (warm daylight bloom)**. Each photo sits under two overlays: a cool slate veil (opacity 0.35) and a warm gold wash (opacity 0). As the photo enters (from 85% to 40% of viewport height, scrubbed), the veil fades to 0, the warm wash pulses to 0.12 and back to 0, and the image scales 1.08 → 1. Reduced motion: overlays absent.
2. **Pinned room tour** (§4 Apartment 2). ScrollTrigger pin with scrub 0.6; track translateX; chapter titles use `appSplitLines`; progress line scaleX. Only at ≥ 768 px with desktop or tablet motion; otherwise stacked.
3. **Opening + type reveals**. Opening (≤ 1.2 s, once per session, never blocks interaction): triptych panels rise and settle from 1.12× with staggered 120 ms starts, headline lines rise from 105% in masks, header and CTA fade in last. Later visits show the hero instantly. Headings marked `appSplitLines` reveal line by line (split into lines and, inside lines, words; never characters, so Vietnamese diacritics stay intact); SplitText re-splits on resize.
4. **Smooth scroll + transitions + cursor** (desktop motion only). Lenis (lerp 0.1, wheel only; touch stays native) drives ScrollTrigger via `lenis.on('scroll', ScrollTrigger.update)` and GSAP's ticker. Page transitions: View Transitions with a 450 ms crossfade, and the shared photo morph. Cursor: 10 px navy dot following the pointer (transform), growing into a 72 px gold ring labelled "Xem" over `[data-cursor="view"]` photos and "Kéo" over the room track; hidden over inputs, on touch and with reduced motion. The native cursor stays visible (the custom one is decoration, never the only indicator).

### 5.4 Reduced motion and fallbacks

`prefers-reduced-motion: reduce` → no Lenis, no pinning, no reveals, no cursor, no opening; View Transitions fall back to a 150 ms fade or nothing. Browsers without View Transitions navigate normally. Firefox gets the same GSAP-driven motion (no CSS scroll-timeline dependency).

## 6. Performance budgets

- Tier 2 pages: initial JS within the existing budget (500 kB warning); no motion chunk requested (asserted by a test of route data and by checking the network in the browser check).
- Motion chunk ≤ 60 kB gzipped, requested after first render on Tier 1 only.
- Hero images: `NgOptimizedImage` with `priority` on the first triptych panel / phone hero; `sizes` set so phones fetch 640–960 px and the desktop triptych fetches 640–960 px per panel. Width list stays `[400, 640, 960, 1280, 1600]`.
- Fonts: two families + mono, only the weights used, `display=swap`, preconnect kept.
- CLS 0 from motion (nothing animates layout); LCP target < 2.5 s on simulated 4G for Home and Apartment.

## 7. Accessibility

- Contrast as in §3 (all text ≥ 4.5:1).
- Visible focus (2 px deep-gold ring, 2 px offset) on every interactive element, including on navy bands (gold ring there).
- Skip link to `main`; the pinned tour keeps a natural DOM order, chapter headings are real `h3`s, and keyboard tabbing scrolls focused links into view through Lenis.
- Lightbox: dialog role, focus trap, Esc, labelled prev/next buttons, focus return.
- Decorative SVG motifs and overlays `aria-hidden`; photos keep their listing alt text.

## 8. Internationalisation

All new strings (scene copy, room chapter names and lines, cursor labels, mobile bar, lightbox controls) go into both `src/i18n/vi.json` and `en.json` under new keys (`home.scenes.*`, `rooms.*`, `motion.*`, `gallery.lightbox.*`). The existing parity test enforces matching keys and placeholders.

## 9. Testing and verification

- Unit (Vitest): room chapter mapping (photos → chapters, fallback for other apartments), motion preference resolution (reduced motion, desktop/touch), route data marking Tier 1 vs Tier 2, any pure helpers (e.g. split-safety, nearby-place layout positions for the route map).
- Build: `npx ng build` (production, SSR) with no new warnings; `npx ng test --watch=false` green.
- Browser checks (Playwright against `ng serve` with the local API): every Tier 1 and Tier 2 page at 1440×900 and 390×844, motion on and `reducedMotion: 'reduce'`; scroll through each page taking screenshots; no console errors; booking flow end to end (book → payment upload → confirmation) still passes the existing walkthrough; Tier 2 pages make no request for the motion chunk.
- Council review of screenshots and the running pages before finishing.

## 10. Risks

- **Portrait photos on wide screens**: mitigated by triptych/split compositions; never stretch a single portrait photo across a desktop viewport.
- **Hydration vs. GSAP inline styles**: motion only touches elements after hydration; SplitText reverts on destroy.
- **Lenis vs. sticky/anchors/scroll restoration**: reset on navigation; anchor scrolling routed through Lenis; sticky booking card verified with Lenis on.
- **Bundle creep**: motion chunk measured in the build stats; fail the check above 60 kB gz.

## 11. Council review

Recorded in the ledger once run: findings, decisions, and the spec edits they caused.
