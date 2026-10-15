# Redesign revision: carousel hero, room index, straight apartment hero, magazine gallery

Status: decided with the owner on 16/10/2026, after the owner looked at the built redesign. Branch `redesign/light-cinematic`. This document amends the light-cinematic spec (`2026-10-13-light-cinematic-redesign-design.md`). Where the two differ, this one wins.

## Owner feedback and answers (16/10/2026)

1. "Keep homepage banner a carousel (automatic), use a library." → The Home hero becomes an **automatic carousel built with Embla**, which is already a dependency, plus its autoplay and fade plugins.
2. "The kitchen in the second image is wrong … remove kitchen reference (keep the words + description) since we don't have img for kitchen (we only have 1)."
   - Photo 08, shown as "Bếp", is the living/dining room. Photo 01 is the only kitchen photo.
   - Decision: **the kitchen is text only**. "Bếp" keeps its title and line everywhere, but shows no photo.
   - 08 moves to the living room. 01 stays in the gallery's last chapter of general photos.
3. "For the second screenshot, use a different, unique layout." This is the "Năm khung cửa, năm góc nhỏ" five-window row on Home. Decision: a **sticky room index**.
4. "For the third screenshot, I don't like the curve design on the right." This is the curved Apartment hero. Decision: a **wide cinematic photo** with straight edges, under the title block.
5. "Redesign the gallery also." Decision: **magazine spreads**.

## Photo casting (replaces §4.1 of the base spec for these pages)

Room chapters, in tour order:

| Chapter | Photos |
|---|---|
| Phòng khách & ăn (living) | 02, 06, 09, 10, 08 |
| Bếp (kitchen) | none (text only) |
| Hai phòng tắm (bathrooms) | 11, 12 |
| Phòng ngủ 1 (bedroom 1) | 13, 14 |
| Phòng ngủ 2 (bedroom 2) | 16, 15, 03 |

The gallery's last chapter "Hình ảnh" collects every listing photo no room claims: 01, 04, 05, 07.

`roomChapters` keeps text-only chapters. Where a chapter has no photos:

- the room tour shows its text card, without photos;
- the Home index shows a typographic panel in place of the photo;
- the gallery shows a slim caption band.

No photo repeats on a page.

## Home hero: automatic carousel

- **Library:** Embla (`embla-carousel` 8.6.0, already installed) with `embla-carousel-autoplay@8.6.0` and `embla-carousel-fade@8.6.0`.
- **Slides:** five full-bleed photos, in this order:
  - 05 (living, the opening image)
  - 14 (bedroom 1)
  - 04 (living)
  - 16 (bedroom 2)
  - 06 (living)

  None of these is reused elsewhere on Home. The room index uses 09, 12, 13 and 15, plus the kitchen panel.
- **Content:** the eyebrow, headline, price and CTA stay fixed over the slides on the existing dark shade. Only the photos change.
- **Motion:**
  - Cross-fade every 6 s.
  - Each slide gets a very slow scale from 1.04 to 1.0 while it is shown. This is CSS transform only, and is skipped under reduced motion.
- **Controls:**
  - Previous/next buttons (44 px).
  - Slide dots as buttons labelled "Ảnh n/5".
  - Region semantics: `aria-roledescription="carousel"`, with each slide labelled.
- **Autoplay:**
  - Stops on hover and on keyboard focus inside the carousel.
  - Stops when the tab is hidden and resumes when it is visible again.
  - Does not start at all under `prefers-reduced-motion: reduce`. The controls still work.
- **Performance:**
  - Only slide 1 is `priority` (the LCP image). The other slides are lazy, decode after the first paint, and use vw-only `sizes`.
  - SSR renders slide 1 statically. Embla starts in `afterNextRender`, in the browser only.
  - CLS stays at 0.
- **Opening:** the CSS opening (mist, line rise) now runs on the carousel's first slide, and only on the first page of the session. A final-review fix removes `motion-opening` after the opening runs.
- **Phones:** the same carousel, with swipe.

## Home: sticky room index (replaces the five windows)

- **Section:** keeps its eyebrow "Chiều buông" and title "Năm khung cửa, năm góc nhỏ".
- **Desktop with motion:**
  - A two-column section. The left column lists the five chapters as large numbered lines: "01 Phòng khách & ăn", "02 Bếp", and so on, in Fraunces.
  - The right column is a sticky photo frame, a tall rectangle (not an arch).
  - As each name passes the middle of the viewport, that name turns navy, the others stay slate, and the frame cross-fades to that room's photo using opacity only. The active name shows its one line of description.
  - For "Bếp" the frame shows a sand panel with the kitchen line set large in Fraunces.
  - Each name links to `/apartment#<chapter id>`, and the clicked photo morphs into the Apartment hero, as before.
- **Phones, reduced motion and no JS:** a plain stacked list. Each room shows its name, its line and its photo inline (the kitchen has no photo).
- **Photos:** 09 (living), none for kitchen, 12 (bathrooms), 13 (bedroom 1) and 15 (bedroom 2).

## Apartment hero: wide cinematic photo

- **Title block:** eyebrow, `h1` "Căn hộ Sun Garden A04-12", capacity line, and price + CTA. On desktop it is set in two columns: the title on the left, the price and CTA aligned to the bottom right.
- **Photo:** below the title block, full width (edge to edge), with straight edges and a 21:9 ratio on desktop (4:3 on phones). Photo 07, `priority`.
- **Transition name:** `view-transition-name` is set only when arriving from a Home morph, not statically. This also covers final-review finding 6.

## Gallery: magazine spreads

- **Page head:** the existing apartment-header tabs, then a page title and the room chips (`gallery.chapters` "Các phòng").
- **One spread per chapter:**
  - one large photo, about 60% of the width on desktop;
  - a caption block: number "01", room name in `.display-section` size, the room's line, and a photo count;
  - the chapter's other photos, smaller, set under or beside the caption.
- **Sides:** spreads alternate, with the large photo on the left, then on the right.
- **Kitchen:** a slim text-only band with the number, "Bếp" and its line.
- **Last chapter:** "Hình ảnh" takes the same spread layout.
- **Phones:** one column per spread. The large photo comes first, then the caption, then the small photos in two columns.
- **Every photo opens the lightbox** (all 16 photos in order). Keyboard and focus behaviour stay as today.
- **Fade-in:** thumbnails keep the 300 ms fade. Large photos use lights-on only when they are 40vw or wider, as in the base spec.

## Final-review and council fixes in the same wave

These items come from the final whole-branch review (16/10):

- Lightbox: leaving with Back must clear `has-dialog` and resume the engine. Close on `NavigationStart`, and add a destroy hook.
- Scroll restoration: `lenis.resize()` before `scrollTo`.
- The opening must not replay. Remove `motion-opening` after the first opening.
- E2E coverage:
  - teardown checks the ScrollTrigger count and continues to Payment;
  - smoke covers every guest route;
  - reduced motion is checked on the phone too;
  - production asserts the LCP budget;
  - restoration covers a shorter previous page and a Tier 2 page.
- Minor fixes:
  - an engine import timeout (5 s → drop `html.motion`);
  - the `h1` focus retry;
  - the transition-skip filter scoped to navigations;
  - the e2e README port;
  - a guest-only 12 px status badge;
  - the admin glow restored inside `admin-theme.css`.

Findings from the council (creative director, guest UX/accessibility, Angular/performance) are added to the plan when they arrive.
