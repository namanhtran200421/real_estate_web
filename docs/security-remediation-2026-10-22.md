# Security remediation — 22 October 2026

Reviewed the 20-page `output/vn-booking-hub-security-audit-2026-10-21.pdf` with four roles: principal engineer, independent auditor, backend patch engineer, and validation engineer. These changes are local and have not been deployed. The original PDF remains the record of the initial audit.

## Changes

| Report item | Local change | Validation |
| --- | --- | --- |
| F-01 / F-02 | Align Angular runtime, SSR, compiler and CLI packages at 22.2.3. | Lockfile and installed dependency tree agree; production build passes. |
| F-03 | Replace cached CSP nonces with SHA-256 hashes of completed executable inline scripts. Parse HTML using an explicit production `parse5` dependency, normalize script text as browsers do, skip inert data and strip legacy nonce attributes. Keep the same-site and Turnstile script allowlists and block script attributes. | Parser regressions pass; local production responses have matching hashes, with public and private cache policies preserved. This renderer transform assumes untrusted values were escaped upstream; it is not a sanitizer. |
| R-01 | Move static cache and hardening headers into Vercel's advanced routes before the filesystem handler, with `continue: true`. Restrict immutable caching to fingerprinted bundles/fonts; use a week for photos and unversioned fonts. | Contract tests cover representative static, private, map and JSON paths. Actual CDN behavior requires deployment verification. |
| B-01 | Count pending unpaid reported transfers with NULL hold deadlines toward the existing three-hold limit. Serialize count-and-insert transactions using email, phone and canonical IP advisory locks. | Synthetic service tests plus five checks against temporary PostgreSQL 16.14 pass. Shared-identity concurrent transactions see counts 2 then 3 and refuse the fourth hold. |
| B-02 | Share deposit refund gates between generic and dedicated actions. Require full deposit receipt for explicit confirmation. Preserve cancelled/expired refund exceptions and legacy rent behavior; lock inspection edits after a completed stay's partial manual deposit refund. | Positive and negative synthetic financial workflow tests pass. No real payments or refunds were recorded. |
| B-03 | Apply NFKC normalization before password policy screening while retaining the existing raw input limit accepted at login. | Unicode normalization, common-password and input-bound regressions pass. |
| B-04 | Increase scrypt to N=32768, r=8, p=3. Verify legacy hashes and upgrade them after successful login using compare-and-swap so a concurrent password change cannot be overwritten. | Legacy/new verification and rehash race tests pass. Five local verification samples average 113.4 ms on Node 24.16.0; this is not a deployment capacity benchmark. |
| A-01 | Add a focused security harness and a pinned, read-only GitHub Actions workflow that runs the checks and both builds with synthetic build settings. | 32 tests pass: 26 backend and 6 frontend. No unmocked database, network or notification I/O is allowed in the backend harness. |
| A-02 | Schedule the existing dependency audit every day at 21:17 UTC. | Workflow reviewed; backend and frontend full dependency audits report zero known vulnerabilities at this run. Scheduled execution and notification delivery have not been observed yet. |

The Angular build package still pinned Vite 8.3.0 after the Angular upgrade. A scoped `@angular/build` override selects Vite 8.3.5, clearing the remaining development dependency advisories. Production and development builds pass; the isolated development server serves `/`, `/@vite/client` and `/main.js` successfully. Review this override when upgrading Angular's build package. See the [upstream Vite release](https://github.com/vitejs/vite/releases/tag/v8.3.5).

## Evidence and reproduction

Install both projects' locked dependencies first. From the repository root:

```sh
npm run typecheck --prefix backend
npm run typecheck:security --prefix backend
npm run test:security --prefix backend
npm run build --prefix backend
npm run build --prefix frontend/real-estate
npm audit --audit-level=high --prefix backend
npm audit --audit-level=high --prefix frontend/real-estate
```

CI supplies a synthetic public `API_URL` and `PUBLIC_SITE_URL` for the frontend build. No real secrets are required by the regression harness.

Additional evidence is in ignored `output/security-remediation-2026-10-22/`:

- `postgres-validation.json`: actual repository lock/count SQL against a minimal synthetic table in a private Unix-socket PostgreSQL cluster. The cluster was stopped and removed. Full booking schema constraints and the entire booking service were not exercised in this database run.
- `ssr-smoke.json`: 13 GET-only checks on the optimized production build. Eleven HTML routes have matching script hashes and correct public/private cache policy; both explicit index artifact URLs redirect with `no-store`.
- `dev-server-smoke.json`: Angular/Vite compatibility check on temporary port 4401 using Node 22.23.3. The temporary process was stopped.
- `browser-smoke.json`: browser observations for homepage rendering, language navigation, direct booking form initialization and owner login rendering.

The first browser preview used port 4400, which the existing local API CORS configuration correctly refused. A separate temporary source copy was built with a preview-only API address. A local proxy then forwarded only public GET endpoints to the already running local API and allowed only the preview origin. Direct booking-page loading succeeded with that configuration. No project environment file, existing CORS policy or running development server was changed. No forms were submitted. Turnstile script insertion was observed, but full widget completion and production hostname behavior remain release checks.

## Remaining decisions and release checks

- **B-05:** choose the owner's MFA factor, recovery process and which actions require fresh authentication. No speculative authentication or recovery mechanism was introduced.
- **B-06 / A-03:** approve the booking, contact and identity data inventory, retention periods, deletion exceptions, processor list and localized notice before implementing deletion or making privacy promises. Existing screenshot retention behavior remains governed by ADR-0002.
- Preserve ADR-0001: a reported transfer keeps its hold until the owner answers. An aging queue, review SLA and aggregate held-night budget are separate product decisions; the existing per-booking 90-night limit remains in place.
- After deployment, verify the dependency versions actually running, private pages' `no-store`, matching public HTML/CSP on cache hits, and real Vercel static cache headers and repeat-load behavior.
- Verify Turnstile rendering on its registered hostname without CSP errors, using the actual deployment settings. Do not infer full CAPTCHA success from an allowlisted origin or a local test key.
- Benchmark concurrent password verification and login load on the actual backend instance before claiming capacity. Local timings are descriptive only.
- Exercise full booking/payment/refund flows in an isolated deployment with synthetic data, and configure the security workflow as a required release check. Local tests do not establish branch protection or production workflow completion.

Existing ADRs remain unchanged. No deployment, commit, production data mutation or notification send was performed. Concurrent frontend and design edits outside the security-owned files were preserved.

## 23 October follow-up: B-07 and R-02

The final check found a race between password changes and login session creation (B-07), plus missing ignore rules for environment-specific secret files (R-02). Both are now fixed in the local source. Login and password changes lock the same account row and compare the locked password hash with the credential snapshot verified before the transaction. Session creation and login metadata commit together; password replacement, other-session revocation and the security notification outbox also commit together. A stale credential snapshot is rejected, including a concurrent password change.

The root `.gitignore` now ignores `.env` and `.env.*` throughout the repository, with explicit exceptions for example, sample and template names. No existing secret files needed to be removed from Git.

Eight isolated PostgreSQL lifecycle checks passed, covering both race orderings, stale concurrent password changes, rollback and legacy hash upgrades. All 87 focused security tests pass, including 16 new authentication lifecycle regressions; source/harness typechecks and the backend build also pass. New regressions are in `backend/security/auth-lifecycle.test.ts`; evidence is in ignored `output/security-fix-2026-10-23/`. The original final-check PDF records the pre-fix findings; this follow-up supersedes its B-07/R-02 status for the reviewed local source. Production verification remains pending the owner's release.
