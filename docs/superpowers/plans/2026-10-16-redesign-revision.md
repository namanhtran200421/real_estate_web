# Redesign revision and review fixes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task.

**Goal:** apply the owner's revisions of 16/10/2026 and fix every Critical, Blocking and Important finding from the final whole-branch review and the three council reviews. Then verify the whole guest site again.

**Spec:** `docs/superpowers/specs/2026-10-16-redesign-revision-design.md`. It amends `docs/superpowers/specs/2026-10-13-light-cinematic-redesign-design.md`; the owner's revisions win where they conflict with a council suggestion.

**Code:** Angular 22 app in `frontend/real-estate` (zoneless, SSR, Transloco vi/en, Tailwind v4 tokens in `src/styles.css`). The motion engine is in `src/app/motion/`, and the e2e checks are in `e2e/checks/` (run with `node e2e/run.mjs <check> --site http://localhost:4377`).

## Global Constraints

- **Local environment:**
  - The local API runs on :3000 and the dev site on :4377. Implementers don't start or stop them.
  - Never read `backend/.env`; it points at the production database. Use only `postgresql://localhost/real_estate_test`.
  - To expire test holds, run `UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE status='pending' AND amount_paid=0 AND hold_expires_at IS NOT NULL AND customer_email LIKE '<your prefix>%@example.com'`.
- **Commands:**
  - Never run `npm test` / `npm run build` in the frontend, because they regenerate `src/environments/environment.ts`. Use `npx ng test --watch=false`, `npx ng build` and `npm run check:motion`.
  - Never commit `environment.ts`. Never use `git stash`. Use explicit `git add` paths.
  - Commit trailer: `Co-Authored-By: <model> <noreply@anthropic.com>`.
- **Stale dev server:** the dev server sometimes serves a stale client after template edits. Touch the file again, or verify on a production build (`npx ng build`, then `API_URL=http://localhost:3000 PORT=4390 node dist/real-estate/server/server.mjs`, and stop it afterwards).
- **Motion and markup rules:**
  - Guest tokens, not hex.
  - Image `sizes` must be vw-only and no larger than the real rendered width.
  - One `priority` image per page.
  - Animate only transform and opacity.
  - Server HTML is complete and visible.
  - Reduced motion and no-JS keep parity.
  - No DOM APIs on the server.
  - Admin (`src/app/admin/**`) looks exactly as before.
- **i18n:** vi and en have identical key sets and no duplicate keys (verify with a script). Don't reword the owner's policy text beyond what a task states.
- **E2E:** never weaken an assertion. Harness artefacts are fixed in the harness, with an explanation.

## Review Focus

1. **Deposit-first money on the confirmation page while the deposit transfer is being checked.** No rent amount is ever labelled "waiting for confirmation".
2. **The carousel:** autoplay must stop under reduced motion, on hover or focus, and while the tab is hidden. The LCP is slide 1 only, and CLS is 0.
3. **The room index and gallery with the text-only kitchen:** nothing breaks when a chapter has no photos.
4. **Back navigation from the lightbox and from story pages:** the page stays scrollable and the position is restored.
5. **Fonts:** the self-hosted subset covers every Vietnamese character used on the site, and the admin's fonts still load.

---

### Task R1: Casting, kitchen text-only, alt text and copy fixes

**Files:**
- `src/app/data/sun-garden-rooms.ts` (+spec)
- `src/i18n/vi.json`, `src/i18n/en.json`
- every template that renders photo `alt`:
  - `room-tour.html`
  - `gallery.html`
  - `lightbox.ts`
  - `home.html`
- `about.html`, `location.html`, `apartment-detail.html` (copy keys only)

**Steps:**

- **Casting:**
  - living: `10, 09, 02, 08` (lead 10, which shows the kitchen corner and front door);
  - kitchen: `[]`, text only;
  - bathrooms: `11, 12`;
  - bedroom 1: `13, 14`;
  - bedroom 2: `16, 15, 03`.
  - `roomChapters` keeps text-only chapters. Add `textOnly: boolean` to `RoomChapter`.
  - `galleryChapters` adds the leftovers chapter (`01, 04, 05, 06, 07`) with id `them-anh` and a new key `rooms.moreViews` (vi "Thêm góc nhìn", en "More views"). Its line is vi "Những góc khác của căn hộ.", en "More corners of the apartment.".
  - Update the unit tests: every photo appears exactly once in `galleryChapters`, and the kitchen is `textOnly`.
- **Alt text:**
  - Add `photoAlt(chapter, index)` returning `"<room title> – ảnh n/m"` (en `"<room title> – photo n of m"`), using the translated title.
  - Use it in the room tour, gallery, lightbox and Home room index instead of the listing's generic alt.
  - Inside links that already carry the room name, use `alt=""`.
- **Copy:**
  - The Apartment closing band gets its own keys:
    - eyebrow vi "Đặt trực tiếp", en "Book direct";
    - title vi "Sẵn sàng cho những ngày ở Đà Lạt?", en "Ready for your days in Đà Lạt?".
  - Location eyebrow: vi "Xung quanh", en "Nearby", replacing `home.scenes.aroundEyebrow`.
  - About closing band: the primary button comes first and the text link after it.
  - English uses "Đà Lạt" consistently, including the hero h1.
  - Policy item 2 (vi and en): replace "Sau khi xác nhận đặt phòng, Quý khách vui lòng đặt cọc" with "Để xác nhận đặt phòng, Quý khách vui lòng đặt cọc" (en: "To confirm your booking, please pay a deposit"). This is the only policy wording change; it goes on the owner's review list.
  - Money keys:
    - `money.totalRent` vi "Tổng tiền phòng" / en "Total rent";
    - `money.today` "Hôm nay: tiền cọc {{amount}} ₫" / "Today: deposit {{amount}} ₫";
    - `money.fromCheckIn` "Từ ngày nhận phòng: tiền phòng {{amount}} ₫" / "From check-in: rent {{amount}} ₫";
    - `money.atCheckOut` "Khi trả phòng: hoàn cọc {{amount}} ₫ (trừ hư hỏng nếu có)" / "At check-out: deposit back {{amount}} ₫ (less any damage)";
    - `booking.moreGuests` "Hơn 4 khách? Liên hệ chủ nhà qua Zalo." / "More than 4 guests? Contact the owner on Zalo.".
- **Tests:** `npx ng test --watch=false` passes, and so does `node e2e/run.mjs gallery`. Update its count (16) and the chips.

### Task R2: Home: carousel hero, room index, warm final call

**Files:**
- `src/app/pages/home/home.{ts,html}`
- new `src/app/components/hero-carousel/hero-carousel.ts` (+spec)
- new `src/app/components/room-index/room-index.ts` (+spec)
- `src/index.html` (opening selectors)
- `src/styles.css`
- `e2e/checks/home.mjs`, `opening.mjs`
- `package.json` / lockfile: add `embla-carousel-autoplay@8.6.0` and `embla-carousel-fade@8.6.0`

**Steps:**

- **Carousel** (spec §Home hero):
  - Slides: 05, 14, 10, 16, 03.
  - Embla with the fade and autoplay plugins, every 6 s.
  - Autoplay stops on hover, on focus within and on `visibilitychange`. It never starts under reduced motion.
  - Prev/next buttons and dot buttons, all ≥ 44 px, labelled "Ảnh n/5". The carousel has region semantics.
  - Slide 1 is `priority`; the other slides are lazy. SSR renders slide 1 only, as a static image. Embla starts in `afterNextRender`, browser only.
  - The fixed copy layer:
    - eyebrow at 100% ivory;
    - headline lines with `whitespace-nowrap` from `md` up (prevents CLS);
    - price and CTA directly under the headline, not in the far corner.
  - The scrim is lighter and warmer: transparent to 50%, then `rgb(11 34 66 / .6)` at the bottom, behind the copy side only, plus a faint `rgb(221 179 127/.08)` wash. Contrast must still reach ≥ 4.5:1 for the eyebrow and price and ≥ 3:1 for the headline over every slide; measure it in the e2e.
  - The opening (mist and line rise) runs on the first slide. The arch is gone: slides are full-bleed rectangles under the header pill.
  - Slow scale 1.04 → 1 per active slide, as a CSS transition, with none under reduced motion.
- **Room index** (spec §Home sticky room index):
  - The component takes `chapters`. The photos are 09 (living), none (kitchen panel), 12 (bathrooms, `object-position: 50% 15%`), 13 and 15.
  - Desktop with motion: the left list and the sticky right frame cross-fade (opacity) as each name crosses the middle of the viewport. Build it with ScrollTrigger inside `onMotion`, and set no signals from GSAP callbacks; use classes or attributes.
  - The active name is navy, with its line revealed. The kitchen shows a sand panel with its line in large Fraunces.
  - Names link to `/apartment#<id>`, and the clicked photo morphs (name set on click only).
  - Phones, reduced motion and no-JS: a stacked list with inline photos.
  - It replaces the five-window section, which is deleted with its CSS.
- **Final call:** add a warm radial gold glow behind the closing headline (CSS, which may bloom with scroll via opacity), and a larger CTA.
- **E2E:** update `home.mjs`:
  - one priority preload;
  - a carousel with 5 slides;
  - autoplay advances within 8 s with motion allowed and does not advance under reduced motion;
  - the index has 5 names;
  - no repeated photo on the page;
  - contrast over the slides.
- **Checks:** `opening.mjs` still passes. `npm run check:motion` passes; Embla is not in the motion chunk, and the size limit still holds.

### Task R3: Apartment: wide hero, tour fixes, details polish

**Files:**
- `apartment-detail.{ts,html}`
- `room-tour.{ts,html}`
- `src/styles.css`
- `booking-card.html`
- `e2e/checks/apartment.mjs`

**Steps:**

- **Hero** (spec §Apartment hero):
  - The title block sits above. On desktop it has two columns: h1 plus capacity on the left, price plus CTA bottom-right.
  - The h1 lines use `whitespace-nowrap` at `lg`, or a fixed line split that cannot rewrap.
  - Below it, a full-width 21:9 photo 07 (4:3 on phones), straight edges, `priority`.
  - `view-transition-name` is set only when arriving from a Home morph (check the router's navigation state/extras or a flag set by Home), not statically.
- **Tabs:** attach them to the hero (`mt-12`), with ≥ 48 px before the tour eyebrow. On phones, add a right-edge fade on the scrolling tabs.
- **Room tour:**
  - The title "Đi một vòng căn hộ" becomes an `h2`.
  - The kitchen chapter renders as text only.
  - Phone stacking:
    - cards get `border-radius: 24px 24px 0 0`, a top shadow, a border and centred content;
    - the photo block is taller (about 58svh);
    - the CTA card is out of the sticky stack (static, normal padding), so the tour leaves no void;
    - stacking applies only when a chapter fits: `min-height: 700px` in the media query (or a container query); otherwise a plain stack.
  - Desktop: shorten the travel so the last chapter and the CTA land fully in view.
  - Bathroom photos use `object-position: 50% 15%`.
  - `sizes`: `(min-width:1024px) 30vw, 50vw`. The lead photo on phones is the full width minus padding, so give it `90vw` only if it really is that wide; measure the rendered width and make `sizes` ≤ the rendered width.
- **Details:**
  - The map placeholder is a sand panel with a small pin icon and the address, not a blank card.
  - Feature chips become plain paper panels, in a layout without an orphan (2 or 5 columns).
  - The booking card link gets a short `aria-label`.
- **E2E:** update `apartment.mjs`:
  - wide hero right edge = viewport;
  - no curve (no `border-radius` on the hero frame);
  - phone tour has no overflow and no void (the gap after the last card < 120 px);
  - deep link still lands;
  - CLS < 0.05 on desktop with a 1 s font delay. Add a font-delay route in the check.

### Task R4: Gallery magazine spreads and lightbox fixes

**Files:**
- `gallery.{ts,html}`
- `lightbox.ts`
- `e2e/checks/gallery.mjs`

**Steps:**

- **Spreads** (spec §Gallery):
  - Each spread has a large photo (~60% width), a caption block (number, room name in `.display-section`, line, photo count) and small photos. Sides alternate.
  - The kitchen is a slim text band.
  - "Thêm góc nhìn" uses the spread layout.
  - Phones: one column.
  - `sizes` matches the rendered widths (large ≈ `60vw` desktop / `100vw` phone; small ≈ `20vw` / `45vw`); verify with an image audit, so fetched-but-unused images = 0.
  - Every photo opens the lightbox, all 16 in order.
- **Lightbox:**
  - Close on `NavigationStart`, browser only.
  - Add a `DestroyRef.onDestroy` that, if it is still open, removes `has-dialog` and resumes the engine.
  - The backdrop is fully opaque (no view-transition ghosting).
  - The close button is ≥ 48 px.
- **E2E:**
  - 16 photos;
  - spreads alternate;
  - the right edge is filled on desktop;
  - lightbox → `page.goBack()` → no `has-dialog`/`lenis-stopped` on the previous page, and a wheel scroll moves it.

### Task R5: Booking money clarity and form accessibility

**Files:**
- `booking-confirmation.html/ts`
- `booking-summary`
- `booking-review`
- `booking-payment`
- `booking.html/ts`
- `guest-identity-form`
- `booking-steps`
- `site-header` (menu links)
- `index.html` or the app shell (`noscript`)
- e2e `booking-flow.mjs`

**Steps:**

- **BLOCKING:** on the confirmation page, for `depositFirst`, the rent block's bottom line reads "Tiền phòng · thanh toán từ {{rentDueFrom}}" with the rent amount. It must never say "Đang chờ chủ nhà xác nhận" next to the rent. While a deposit transfer is pending, the details' payment status reads "Đang kiểm tra chuyển khoản cọc". Add a spec for this.
- **Money summary:**
  - The summary card on Book (once there is a quote), Review, Payment and Confirmation shows the three lines `money.today` / `money.fromCheckIn` / `money.atCheckOut` for deposit-first stays.
  - The large total is labelled `money.totalRent`.
  - The Review refund line gets "sau khi kiểm tra căn hộ".
  - Amounts use `whitespace-nowrap`.
- **Step 1 (phones):** extend the live line under the calendar to "2 đêm · 3.298.000 ₫ · cọc hôm nay 660.000 ₫". Show the `booking.moreGuests` hint under the guest selector.
- **Form errors:**
  - On submit with errors, focus the first invalid control (or the calendar group) and scroll it below the header.
  - Each message is linked with `aria-describedby`.
  - Replace the per-field `role=alert` messages with one polite summary ("Còn n mục cần điền").
- **Focus:**
  - Confirmation focuses its h1 on arrival.
  - The "not a transfer" warning focuses its heading.
  - Review API errors focus the error box.
- **TOO_MANY_PENDING_BOOKINGS:** the error links to `/booking/manage` with a short explanation.
- **Polish:**
  - The countdown's accessible text reads "Giữ chỗ đến 00:37 16/10", in Vietnam time.
  - Placeholder contrast ≥ 4.5:1.
  - The policy link is marked "(mở tab mới)" or with an icon plus sr text.
  - Copy buttons get aria-labels per field.
  - Booking steps get sr-only labels and `aria-current="step"`.
  - "Sửa" for identities goes to the identity section, using a fragment, not a raw hash.
  - The mobile menu adds Gallery, Location and Policy.
  - Small tap targets: the breadcrumb and About's text link are ≥ 44 px tall.
  - Add a `<noscript>` message with the phone and Zalo numbers on the client-only routes.
- **E2E:** `booking-flow.mjs` asserts the confirmation money block after a deposit report: no "chờ chủ nhà xác nhận" next to the rent, and the status reads "Đang kiểm tra". Add a form-error focus check.

### Task R6: Platform: fonts, CLS, header, motion engine fixes, e2e coverage

**Files:**
- `src/index.html`
- `public/fonts/*` (new)
- `src/styles.css`
- `admin-theme.css`
- `site-header`
- `custom-cursor.ts`
- `motion/engine.ts`
- `motion/motion.service.ts`
- `motion/view-transitions.ts`
- `app.ts`
- `app.config.ts` (preloading)
- `status-badge.ts`
- `navy-band.ts`
- `route-map.html`
- `policy.html`
- e2e checks and `e2e/README.md`, `e2e/lib.mjs`

**Steps:**

- **Self-hosted fonts:**
  - Create one woff2 per face, subset to Vietnamese plus basic Latin, `wght` axis only (pin or drop `opsz`).
  - Faces: Fraunces roman and italic, Be Vietnam Pro 300/400/500 (or variable), and IBM Plex Mono 400.
  - Build them with fonttools (`pyftsubset`) in a scratch venv, from the Google Fonts sources. The output goes in `public/fonts/`.
  - `@font-face` with `font-display: swap`. Preload only Fraunces roman and Be Vietnam 400.
  - Remove Google Fonts from the guest HTML. The admin's fonts (Playfair Display, Source Sans 3) must still load for admin: load them only from the admin component styles, or keep a Google Fonts link injected by the admin layout.
  - Font budget ≤ 160 kB on any guest page. Verify every Vietnamese character in `src/i18n/vi.json` is covered (a script over the glyph set).
- **Display fallback:** a separate face `"Fraunces Display Fallback"` with `size-adjust` ≈ 80% (tune it so a display line keeps its line count). Use `local('Georgia'), local('Noto Serif'), local('Times New Roman')`. Display headings use it, and the CLS checks pass on About.
- **Logo:** export a 400 px-wide webp and remove `fetchpriority=high` from its preload.
- **Header:**
  - The pill backing is ≈ 94% ivory, so it stays warm over dark sections.
  - At 320 px and at 200% text, the menu button stays on screen: `min-width:0`, icon-only logo below ~360 px or at large text, px-sized button.
  - Add a check at 320 px and at a root font of 200%.
- **Cursor:** gold inside `.band-navy` (via `data-cursor-tone` or an intersection check on the hovered element). Kill the `quickTo` tweens on cleanup.
- **Motion engine:**
  - Use one engine-level `gsap.matchMedia` (or plain `gsap.context`), so components stop creating leaking media-query listeners. A reduced-motion change triggers `teardown()`.
  - `lenis.resize()` before `scrollTo` in `jumpTo`.
  - Remove `motion-opening` after the first opening's `animationend`, so it never replays.
  - Engine import timeout: 5 s, then drop `html.motion`.
  - `h1` focus after navigation: retry with `afterNextRender` until the h1 exists (max ~1 s).
  - Catch `finished` / `ready` / `updateCallbackDone` in `onViewTransitionCreated` (no "Transition was skipped" console errors). Scope the e2e filter to navigation only.
- **Preloading:**
  - Delay the guest page preloading until idle (`requestIdleCallback`, falling back to a timeout) and skip it on `saveData` or 2g/3g.
  - Preload the active language's translation chunk: `modulepreload`, or inline it in the SSR state.
- **Small fixes:**
  - The status badge is 12 px on guest pages only (a guest variant input).
  - Restore the admin ambient glow inside `admin-theme.css`.
  - Navy band ridges get navy-deep layers, a few pine silhouettes along the crest and a faint gold hairline.
  - The route-map phone list keeps "km" with its number (`whitespace-nowrap`).
  - The policy table of contents is sticky at `top: 7rem` with `max-height` and an active item.
- **E2E coverage:**
  - `teardown`: assert the ScrollTrigger count is 0 (expose it through the `__motionEngine` hook) and continue to Payment.
  - `smoke`: all guest routes, including `/book/review`, `/book/payment`, confirmation, `/booking/manage` and `/policy`. Pages that need a booking reuse booking-flow's setup.
  - `reduced-motion`: phone too.
  - `production`: assert LCP < 2500 ms on desktop.
  - `restoration`: a shorter previous page and a return from Tier 2.
  - `lightbox-back`: lives in R4.
  - Fix `e2e/README.md` to say :3000.
- **Checks:** run the production server checks (`production`, `no-js`) and the full suite.

### Task R7: Final verification (controller)

1. Run the full e2e suite on dev and on the production SSR build.
2. Run the deposit-first end-to-end script.
3. Take screenshots of every page at desktop and phone width, and look at them.
4. Run a throttled phone LCP spot check on Home, Apartment and About (target < 2.5 s).
5. Re-run the council with one reviewer per role, scoped to the revised pages.
