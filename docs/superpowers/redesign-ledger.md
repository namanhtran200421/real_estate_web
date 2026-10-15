# Redesign ledger: light-cinematic guest site

Branch: `redesign/light-cinematic` (created from `main` at 479b1b9). **Never push to `main`, never deploy production, never touch the database or the backend.** The owner reviews this branch when they wake up.

## Goal

Re-design the guest-facing website (Angular app in `frontend/real-estate`) into a "UI/UX winner": premium, light but cinematic, with award-style scroll motion, while booking stays fast on mid-range phones. Done means:

1. Every guest page in scope follows the approved spec (`docs/superpowers/specs/2026-10-13-light-cinematic-redesign-design.md`).
2. The four signature moments work on desktop and degrade gracefully on phones and with reduced motion.
3. `npx ng build` (production) and `npx ng test --watch=false` pass; the booking flow still works end to end.
4. The council (creative director, guest-UX/accessibility, Angular/performance) has reviewed the built pages and its blocking findings are fixed.
5. The branch is committed (and pushed as a branch only, for a preview) with a summary for the owner.

## Decisions made with the owner (12–13/10/2026)

- Goal: bookings and showcase equally. Story pages get the show; booking pages stay plain and fast.
- Imagery: only the 16 real interior photos plus hand-drawn Đà Lạt motifs (no stock, no new shoots).
- Scope: all guest pages in two tiers. Tier 1 (full motion): Home, Apartment, Gallery, Location, About. Tier 2 (new look, micro-interactions only, no animation library): Availability, Contact, Book → Review → Payment → Confirmation, Lookup. Owner admin untouched (including its fonts).
- Look: **light but cinematic**, built from the logo's own colours (navy #11305a, gold #ddb37f) on warm ivory #f6f1e8; full-bleed photos, very large Fraunces type, navy bands, arched villa-window frames, paper panels for forms. The owner rejected the dark "pine night" look after seeing it full size, and likes the original logo's contrast.
- Signature motion (all four): lights-on photo reveals (warm daylight bloom), pinned room tour on the apartment page, opening + line-by-line type reveals, smooth scroll + page transitions + custom cursor (desktop).
- Technique: GSAP (ScrollTrigger, SplitText) + Lenis, lazy-loaded only on Tier 1 pages after first paint; transforms/opacity only; split by line/word only (Vietnamese diacritics); View Transitions for page transitions; SSR output fully visible without JS.
- Section 1 (visual system, light) approved by the owner. Section 2 (page structure) was shown; the owner went to sleep and delegated the rest: validate with a council of sub-agents instead of the owner, and run autonomously.

## Process

brainstorming spec → council review of spec → writing-plans → council review of plan → subagent-driven-development (implementer + reviewers per task) → visual verification (screenshots desktop/phone, reduced motion) → council review of the built site → fixes → final verification → commit + push branch → summary.

## Status

- [x] Branch created, baseline green (frontend 18 tests, backend 58 tests)
- [x] Spec written (commit 12495ec)
- [x] Council: spec reviewed and revised (spec v2)
- [x] Plan written (`docs/superpowers/plans/2026-10-13-light-cinematic-redesign.md`, 14 tasks)
- [x] Council: plan reviewed (47 corrections applied, commit 748b075)
- [ ] Implementation (see plan task list)
- [ ] Visual verification
- [ ] Council: built site reviewed, fixes done
- [ ] Final verification, branch pushed, owner summary written

## Log

- 2026-10-13: owner asleep; autonomous mode started.
- 2026-10-13 ~00:20: council round 1 launched on the spec. Creative director reported (findings below). Guest-UX and Angular/perf reviewers stopped on the session usage limit (reset 00:40); relaunched at 01:25.

- 2026-10-13 ~02:00: all three round-1 reviews in; spec rewritten as v2 incorporating every blocking finding.
- 2026-10-13 ~02:40: implementation plan written (14 tasks) and self-reviewed; council plan review launched.
- 2026-10-13 ~03:20: plan review in (5 blocking, ~15 important); all applied. Execution via subagent-driven-development; SDD ledger at .superpowers/sdd/2026-10-13-light-cinematic-redesign/progress.md.
- 2026-10-14: redesign Tasks 1–6 done (motion primitives last). Uncommitted work from another tool (guest identity, asset incidents, migration 014) found in the tree; the owner said it belongs to the redesign, committed as b926a3d.
- 2026-10-14: the owner asked for deposit-first payments, a policy page and a check-out inspection (owner answers in docs/superpowers/specs/2026-10-14-deposit-first-payments-design.md). Built as its own plan (8 tasks, each reviewed; end-to-end 25/25), commits 2b0eccc..688e0c8. The redesign resumes at its Task 7 afterwards; Tier 2 restyle (Task 13) now also covers /policy and the new payment/lookup/admin-free guest states.

## Council round 1: creative director (received)

Blocking: (1) add a story concept "Một ngày ở A04-12" (dawn mist → daylight → warm lamps) to tie the motion together; opening = mist lifting, lights-on veil = ivory mist rgba(246,241,232,.55) not slate; **page stays light** (owner rejected dark), the day is told through motion and copy only. (2) Line masks clip Vietnamese stacked marks: display line-height ≥ 1.05, mask padding-block .15em / margin-block −.15em, screenshot test with Ở/ễ/ộ. (3) Home scene 4 must not reuse the sideways track: "Năm khung cửa" five arched windows lighting up 150 ms apart (phones 2 columns). (4) Deep links into the pinned track: scroll via Lenis to st.start + n/(N−1)·(st.end−st.start); shared-photo morph targets the chapter photo. (5) Drop the false "Kéo" cursor label. (6) Phones: full-screen sticky stacking chapters (position:sticky; top:0; height:100svh), pure CSS.
Suggestions: photo casting (no repeats per page; never 01/11/12 as heroes; phone hero 05; desktop triptych 09·14·04 as one French window with taller arched centre pane); detail crops for small arches; drop count-up (static numbers + line reveal); word fill via opacity .4→1 in navy; lights-on only for photos ≥ 40vw (gallery thumbs 300 ms fade); tour ends on bedroom 2/light, bathrooms folded in, last card = "Xem lịch trống"; calmer promise copy (new home.scenes.promises.* keys), honest "no air-con" as story; page transitions 300 ms, header own view-transition-name, skip when a Tier 2 route is involved; hero image never at opacity 0 (LCP); About needs an owner host note (do not invent one).
Keep: tokens + .guest scoping; Fraunces/Be Vietnam Pro/Plex Mono; arches, ridges, route map; Tier split, lazy chunk, SSR visible, line/word split; panels, phone sticky bar, once-per-session opening.

## Council round 1: guest UX and accessibility (received)

Blocking: (1) opening must not hide booking controls on slow data: CSS keyframes from first paint ≤ 800 ms, header/CTA/price never start at opacity 0, no opening on phones/touch. (2) Lenis/ScrollTrigger/cursor must be destroyed when navigating into a Tier 2 route (test Home→Book→Payment: no `html.lenis`, `ScrollTrigger.getAll().length === 0`); app-select listbox must keep native wheel. (3) Scroll restoration: reset only on forward navigation; on popstate restore via `lenis.scrollTo(pos, {immediate:true})` after `ScrollTrigger.refresh()`; reserve the pin height in SSR CSS (under `html.motion` + desktop media query) so anchors (#thong-tin, #tien-nghi, #noi-quy, #bang-gia, #danh-gia) don't shift (CLS). (4) Pin only on the desktop-motion query plus `min-height: 700px`; focusin inside the track scrolls to that chapter; skip link "Bỏ qua phần tham quan"; cap pinned length ≈ 250vh. (5) SplitText a11y: render `<span class="sr-only">text</span><span aria-hidden="true">text</span>`, split only the hidden copy with `aria: 'none'`, after `document.fonts.ready`; unit-test accessible name. (6) Contrast: deep gold on sand fails → `#7a5426`; keep slate→navy word fill (hidden navy copy fades in; no .4 opacity); `--color-input` `#8f8472` for 3:1 input borders; redefine all tokens under `.guest` (accent-foreground navy, input, ring, accent-muted). (7) Header keeps the ivory pill backing over photos (at least on phones); never hides on scroll; "Đặt lịch" visible at 360 px. (8) Phone stacking chapters only with `min-height:100svh`, `top` = header height, plain stack in landscape or max-height < 600px, `overflow-x: clip` (never `overflow:hidden`) on ancestors.
Suggestions: hero CTA → `/book?apt=`; phone bottom bar → `/book?apt=`, 48 px, `inert` when hidden, hidden while menu/lightbox open, page padding + safe area + `scroll-padding-bottom`; lightbox/menu as native `<dialog>` + `showModal()`, `lenis.stop()` while open, polite "Ảnh 3/16", ≥ 44 px buttons; ridge drift scroll-linked only (no autoplay loop, WCAG 2.2.2); scrubbed scale ≤ 1.05; Vietnamese labels ≥ 12 px, tracking ≤ 0.12em, body weight ≥ 400; two-tone focus ring over photos; payment errors use a red token; "Sao chép" ≥ 24 px; on route change focus the page `h1`.
Keep: Tier split; payment structure, QR white tile, silent timer; native cursor visible; line/word split; SSR visible; reduced-motion parity; DOM order + h3 chapters; skip link; header ≤ 104 px; lightbox plan.

Resolutions where the reviewers disagree: word fill stays slate→navy (UX, contrast) not opacity .4 (CD); opening is CSS-only ≤ 900 ms, desktop-only, mist lifting (CD's image) with header/CTA/price always visible (UX); header keeps the ivory pill over photos (UX), which matches the board the owner approved.

## Council round 1: Angular and performance engineer (received)

Blocking: (a) `.guest` token scoping fails for inherited properties (html font/colour/background resolve at :root) → invert: guest values in `@theme`; admin values (tokens + font-family + colour + background) in one stylesheet on the AdminLayout and AdminLogin hosts (`/admin/login` is outside the layout). (b) Keep Playfair + Source Sans in the index.html fonts URL (only rendered faces download); no admin font injection. (c) Beasties strips `html.motion …` selectors and opacity-0 elements don't count for LCP → opening = pure CSS keyframes in an inline `<style>` in index.html; hero lines as template spans (no SplitText); LCP image only transforms. (d) Every `priority` image preloads → one priority image serving as phone hero and desktop centre pane; side panes lazy and `display:none` on phones. (e) `withViewTransitions({skipInitialTransition:true, onViewTransitionCreated})`, skipping reduced motion, Tier 2 and same-path changes; `view-transition-name` only on the clicked element. (f) No ScrollTrigger `pin`: CSS sticky pin with the section height reserved in CSS, GSAP scrubs only `x`; deep links via absolutely positioned id markers at `top: calc(n/(N−1)*(100% − 100vh))`.
Suggestions: pin `gsap@3.15.0` (Standard no-charge licence, commercial OK, SplitText included) and `lenis@1.3.26` (MIT); measured 53.1 kB gz → enforce ≤ 60 kB via a script over `--stats-json`; only one engine module imports gsap/lenis (others `import type`) or preloading drags gsap into Tier 2; zoneless confirmed: `gsap.matchMedia()` per component + `revert()` on destroy, never set signals in `onUpdate`, SplitText `autoSplit` + `onSplit`; Lenis `autoRaf:false` on gsap.ticker, `lagSmoothing(0)`, `allowNestedScroll:true`, `stopInertiaOnNavigate:true`, `anchors:false`, import lenis.css, destroy on Tier 2; `overflow-x: clip` never `hidden`; `sizes` for portrait panes: desktop `(min-width:1024px) 75vh`, phones `(max-width:767px) 320px`; fonts measured (Fraunces roman 87 kB, italic 105 kB, Be Vietnam Pro 55 kB) → font budget + size-adjusted fallback.
Testing gaps: Playwright once against the production SSR server (CSP on) with a `securitypolicyviolation` listener, JS disabled, Firefox + WebKit, LCP/CLS observers, assert no NG05xx hydration messages.
Sound: utilities follow the vars; inline head script passes CSP (SSR + index.csr.html both stamped); language switch reloads (no SplitText vs Transloco); destination hero exists for view transitions; no hard-coded colours in components; single lazy chunk.

## Deposit-first payments: decisions and owner checklist (14–15/10/2026)

Built from the owner's brief ("Follow this") as its own plan (`docs/superpowers/plans/2026-10-14-deposit-first-payments.md`), commits 2b0eccc..e6e5e7e. Every task passed a spec + quality review, the whole change passed a final review (fix wave + scoped re-review), and an end-to-end browser run on a local database passed 27/27.

Owner decisions: 20% deposit of the rent; rent paid on the site from check-in day (email 08:00); check-out checklist in admin, then Hoàn cọc; publish the main policy column with the numbered check-out list; stays auto-complete 24 h after check-out; children under 14 give name, date of birth and the 12-digit personal ID number only; keep the holiday premium inside weekly/monthly packages; the uncommitted guest-identity work belongs to this branch.

Rulings made without the owner (each reversible):
- Migration 015 sets Sun Garden's deposit to 20% (it was seeded at 30%); still editable in admin.
- Hoàn cọc needs the stay checked out, the rent paid, the inspection saved, no open incident and no damage still owed; it refunds exactly what is held, never more, and the inspection is locked afterwards.
- A deposit-first booking takes the deposit first (recording rent first is refused), a deposit above what is due is refused, and a payment purpose that does not fit the booking is refused — so a guest is never asked twice and rent is never refunded as deposit.
- Guests agree to the house rules on every transfer report; the agreement is stored with the rules' version.
- The policy page shows the apartment's real deposit percentage; the page intro sentence was written by us (owner to check).
- Identity documents of bookings that expire or are cancelled are deleted within 3 days (kept again if a late payment revives the booking).
- One pay button per page; the lookup card shows the deposit separately from the rent.

Before merging to main (owner):
1. Apply migrations 014 and 015 to Neon (direct host). The current main backend keeps working on the migrated schema.
2. Set `GUEST_IDENTITY_ENCRYPTION_KEY` (32+ random characters; keep an offline copy — losing it makes stored identities unreadable) and `GUEST_IDENTITY_RETENTION_DAYS` (35) on Render; the API refuses to start without them.
3. Push in a quiet hour so the API and the site switch together; afterwards check "Chờ tiền về" and the transfers to check, and record by hand any guest who could not report from an old tab.
4. Review: the policy page intro sentence; policy item 3 (up to 6 guests with a surcharge) versus the booking form, which still stops at 4 with no surcharge.
