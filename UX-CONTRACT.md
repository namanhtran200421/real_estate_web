# UX Contract

## Product context

- Audience: Guests booking one owner-operated apartment and the Owner managing stays.
- Primary jobs: quote and reserve a stay, provide legally needed registration details, reconcile distinct money purposes, document damage/loss, and turn over the apartment between stays.
- Target market(s): Vietnam, including foreign visitors.
- Active locales: Vietnamese (`/`) and English (`/en`); Owner administration is Vietnamese.
- Language/content register and native-review policy: calm, direct hospitality language; Vietnamese operational and legal copy requires owner review before production release.
- Timezone/calendar policy: `BUSINESS_TIMEZONE` is authoritative; stay dates are local calendar dates and check-in/out deadlines combine those dates with each apartment's configured local time.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Domain vocabulary and booking lifecycle | `CONTEXT.md` | Domain spec | 2026-10-13 |
| Payment confirmation | `docs/adr/0001-bank-transfer-confirmation.md` | ADR | 2026-10-13 |
| Transfer screenshot retention | `docs/adr/0002-transfer-screenshot-retention.md` | ADR | 2026-10-13 |
| Identity retention and encryption | `backend/src/config/env.ts`, migration 014 | API / data lifecycle | 2026-10-13 |
| Pricing, asset security and incidents | `backend/src/modules/pricing/pricing.ts`, migration 014 | Domain implementation | 2026-10-13 |
| Temporary-stay registration fields | Product brief supplied by the Owner; production copy requires legal review | Product brief | 2026-10-13 |
| Deposit, rent and deposit refund | `docs/adr/0003-a-deposit-confirms-the-booking-rent-is-paid-at-check-in.md`, `backend/src/modules/bookings/booking.rules.ts` | ADR / domain rules | 2026-10-14 |
| House rules (21 items, `/policy`) | Text supplied by the Owner's team ("Nội Quy Lưu Trú dành cho Quý Khách"), published verbatim in `frontend/real-estate/src/i18n/vi.json` → `policy.items`; English is a translation | Owner document | 2026-10-14 |
| Check-out inspection checklist | Drafted from the apartment's amenities (`backend/src/modules/bookings/inspection.ts`), editable per apartment in admin | Domain implementation | 2026-10-14 |

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: existing runtime is canonical and is mirrored in `DESIGN.md`.
- Runtime design-system/token source: `frontend/real-estate/src/styles.css`.
- Mapping/export/adapters: Tailwind utility classes resolve to the runtime CSS variables.
- Token drift gate: strict premium audit plus production build.
- Supported themes: current light theme.
- Design-context owner/review policy: Owner reviews guest-facing Vietnamese copy and operational states.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | `app-select` | `components/select` | authored | keyboard + open popup |
| Date | browser platform | identity forms | native date input | locale + keyboard + E2E |
| Form | page component + Zod API schema | booking/admin controllers | create / edit | validation E2E |
| Toast | inline live status | existing admin patterns | success / error | live-region test |
| CRUD | Owner booking detail | admin booking API | stay on record | full-flow E2E |
| Guest startup loading | `index.html` boot shell + `App` stability event | this contract; global `styles.css` brand tokens | initial guest document only; Vietnamese / English | ready, timeout, no-JS, owner bypass, narrow viewport |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | tokenized | existing token | visible ring | existing token | reduced contrast | label changes, disabled | adjacent alert |
| Input | tokenized | existing token | visible ring | n/a | muted | form remains stable | `aria-invalid` + described inline copy |
| Select | closed | option highlight | trigger ring | open listbox | n/a | n/a | inline copy |
| Textarea | resize none | existing token | visible ring | n/a | muted | form remains stable | inline copy |
| Table/list | readable rows | existing token | link/button focus | n/a | n/a | skeleton/status | retry alert |

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Create booking | Review submit | button disabled, stable label | payment | route transition | inline API error, CAPTCHA reset | page heading | booking service |
| Record payment | Owner confirmation | controls disabled | stay on record | refreshed financial summary | preserved form + inline error | action region | ADR 0001 |
| Add incident | Owner submit | form disabled | stay on record | incident list refresh | preserved values + inline error | incident heading | migration 014 |
| Check out | Owner action | controls disabled | stay on record | actual checkout time appears | inline error | checkout status | migration 014 |
| Purge identities | background job | no UI | n/a | identity section states expired | n/a | n/a | env retention policy |

## Navigation and responsive behavior

- Route document title policy: existing route title configuration remains canonical.
- Route error / 403 page behavior: existing admin authentication and guest lookup flows.
- Breadcrumb/tab/route-state policy: booking steps remain route based; Owner detail returns to the booking list.
- Responsive table strategy: financial and identity information uses stacked definition lists below desktop width.
- Truncation/full-value access: identity values are never placed in URLs, storage, clipboard toasts, or truncated owner data.
- Focus restoration and sticky-obstruction policy: native route focus behavior; sticky side summaries never cover focused controls.

## Overlays and feedback

- Dialog primitive: none added; consequential confirmations use app-owned inline confirmation panels.
- Destructive confirmation levels: cancellation/refund/waive actions state amount, target and consequence before submission.
- Toast placement/duration/deduplication: existing inline live status only.
- Alert/banner scope and persistence: late checkout and same-day arrival warnings stay visible while unresolved.
- Unsaved-changes behavior: identity details intentionally live in memory only and a privacy note explains that refresh requires re-entry.
- Layer/z-index contract: existing select popover contract.

## Async and resilience

- Mutation default: pessimistic for payment, identity, incident and checkout operations.
- Idempotency and duplicate-submit policy: disabled submit while pending; checkout and notification claims are idempotent in the database.
- Auto-save/draft recovery: ordinary booking draft uses session storage; identity document data never uses browser storage.
- Offline/read-stale/write behavior: reads may remain visible; writes fail with inline retry feedback.
- Retry/backoff/timeout behavior: email outbox owns retry; UI allows explicit retry.
- Version conflict and multi-tab behavior: server row locks and fresh detail reloads are authoritative.
- Session expiry/re-authentication: existing admin interceptor behavior.
- Stale-request cancellation/invalidation and pending-state ownership: resource instances own reads; page `busy` signals own writes.
- Dialog/form preservation and retry after mutation failure: form state is retained after server failure.
- Guest startup: a localized indeterminate status outside Angular's hydration tree temporarily makes `app-root` inert and busy while rendering and requests continue underneath. The brand showcase lasts at least three seconds, then dismisses once the application settles and the current page's images and fonts settle (including errors). Below-the-fold page images load eagerly during the showcase. A ready page receives a decorative curtain entrance, with the home photo and text arriving in sequence; interaction is released at its start and the entrance class and loader are removed within 1.6 seconds. Keyboard focus makes animated navigation and booking controls immediately visible. An independent four-second watchdog restores interaction even if bundles or assets stall and skips the entrance when the page is not ready. It does not preload unrelated routes, show a measured percentage or replay on client-side navigation. No JavaScript means no overlay or inert content. Owner routes bypass it. Motion and color derive from the guest theme, with a static reduced-motion indicator and immediate dismissal instead of an entrance when reduced motion is requested.

## Validation

- Schema/validation layer: Angular preflight checks plus Zod API schemas and database constraints.
- Trigger timing: identity errors appear after Continue; server errors remain authoritative.
- Error summary/inline policy: inline at the field and operation region.
- Server error mapping: existing API error translator.
- Sensitive-value handling: identity payloads remain in memory until submission, are encrypted before database persistence, never returned to guest APIs, logged, routed or placed in toast copy.
- `noValidate`, first-invalid focus, duplicate-submit prevention, unsaved changes, and submit recovery: forms use `novalidate`; submit is disabled while pending; values survive errors.

## Permission and clipboard

- Permission UI strategy: identity documents and incident mutation controls are Owner-only; guest APIs expose only transparent incident totals/descriptions.
- Clipboard copy policy: existing visible bank values only; no identity values gain copy controls.
- Disabled-state explanation: nearby helper copy explains business-state restrictions.

## Verification

- Required static commands: backend typecheck/test/build; frontend test/build; strict premium audit.
- Browser/device/locale/theme matrix: desktop and narrow viewport; Vietnamese and English; light theme.
- Accessibility checks: keyboard nationality select, native date inputs, labels, `aria-invalid`, live operation errors.
- Native-language/domain review and target-user evidence: Owner review required for Vietnamese legal and temporary-stay wording.
- Component-state/visual regression coverage: booking identity form, payment purposes, Owner late checkout and incident states.
- Canonical sibling flow used for comparison: existing contact form, payment cards and Owner booking detail.
- Project audit command/result: recorded in implementation handoff.
- CRUD full-flow evidence: create booking → pay accommodation/security → record incident → check out.
- Failure-path evidence: invalid identity fields, duplicate submits, rejected transfer and mutation API error.
