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
- [ ] Spec written
- [ ] Council: spec reviewed and revised
- [ ] Plan written
- [ ] Council: plan reviewed
- [ ] Implementation (see plan task list)
- [ ] Visual verification
- [ ] Council: built site reviewed, fixes done
- [ ] Final verification, branch pushed, owner summary written

## Log

- 2026-10-13: owner asleep; autonomous mode started.
