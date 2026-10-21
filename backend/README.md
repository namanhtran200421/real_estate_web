# Real Estate API

Backend for the apartment booking site: apartments, availability, pricing, bookings, payment by
bank transfer (VietQR) confirmed by the owner, refunds, owner administration, contact form and
email notifications.

Node 22 · Express 5 · PostgreSQL 13+ (Neon) · TypeScript · zod · Resend (email) · qrcode

---

## Quick start (local)

```bash
# create .env (git-ignored): at least DATABASE_URL, BOOKING_TOKEN_SECRET and your bank account (see Configuration)
npm install
npm run db:migrate:dev            # create/update tables and load Sun Garden A04-12
npm run admin:create -- haihoangdo14112004@gmail.com "Chủ nhà"   # prints a generated password once
npm run dev                       # http://localhost:3000
```

Then start the website (`frontend/real-estate`, `npm start`) and open http://localhost:4200.
The admin area is at http://localhost:4200/admin.


## Scripts

| Script                      | What it does                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`               | Run from TypeScript with auto-reload                                      |
| `npm run build`             | Compile to `dist/`                                                       |
| `npm start`                 | Run the compiled server (production)                                      |
| `npm run typecheck`         | Type-check the backend                                                   |
| `npm run db:migrate`        | Apply pending migrations with the compiled code (production)             |
| `npm run db:migrate:dev`    | Same, from TypeScript                                                     |
| `npm run admin:create`      | Create an admin account: `-- <email> "<name>"` (`admin:create:prod` after build) |

## Configuration

Every setting is an environment variable; nothing is hard-coded. **`src/config/env.ts` lists
each one** with its default and limits. Locally they come from `.env` (git-ignored); in
production, set them in the hosting platform. `src/config/env.ts` validates everything at startup and refuses to start with a list
of every problem. In production it additionally requires an origin-only HTTPS `SITE_URL`, an
explicit trusted-proxy count, TLS for Postgres, a real Turnstile secret and a Resend key.

For Neon, use the pooled connection string as `DATABASE_URL` for the running API and set
`DB_SSL=true`. Run migrations with a direct Neon connection string (the host has no `-pooler`
suffix), then restore the pooled URL before starting the API. The project and branch must be
selected in Neon before setting these values. Listing content and source links are recorded in
[`CONTENT_SOURCES.md`](CONTENT_SOURCES.md).

If a local network resets the PostgreSQL connection on port 5432 (`ECONNRESET`), set
`DB_TRANSPORT=websocket` in `backend/.env` and restart the API. This uses Neon's encrypted
WebSocket connection on port 443 with the same database and credentials, including transaction
support. The default, `DB_TRANSPORT=tcp`, keeps the standard `pg` connection.

## Architecture

```
src/
├── server.ts            Entry: DB check, HTTP server + timeouts, background jobs, graceful shutdown
├── app.ts               Middleware order, routes, error handling
├── routes.ts            /api/v1 route table
├── config/env.ts        Typed, validated configuration
├── db/                  Pool + transactions, migration runner
├── jobs/                In-process scheduler (DB-locked, safe with many instances) and job list
├── lib/                 Logger, HttpError, validation (zod), dates, crypto, outbound HTTP, cache, CAPTCHA check
├── middleware/          Request logging, security (helmet, CORS, rate limits, load shedding), CAPTCHA, errors
├── scripts/             create-admin
└── modules/
    ├── apartments/      Public catalogue + availability; admin content, prices, blocked dates
    ├── pricing/         Pure pricing engine (unit-tested)
    ├── bookings/        Quotes, bookings, holds, guest access, admin actions, dashboard
    ├── payments/        Bank transfers (VietQR codes), owner verification, manual payments, refunds
    ├── promo-codes/     Discount codes
    ├── holidays/        Holiday dates (holiday rate)
    ├── contact/         Contact form + owner inbox
    ├── notifications/   Email outbox, templates (Vietnamese), Resend client
    ├── admin-auth/      Owner login, sessions, password hashing
    ├── admin/           /api/v1/admin route table (everything behind login)
    └── health/          Liveness / readiness probes
migrations/              Versioned SQL (never edit an applied file; add a new one)
```

### Layers

Each module is split into layers that only call the layer below:

| Layer          | File                        | Responsibility                                                   |
| -------------- | --------------------------- | ---------------------------------------------------------------- |
| **Router**     | `*.router.ts`               | URL + method → controller                                        |
| **Controller** | `*.controller.ts`           | Validate input (zod), call the service, respond `{ data }`       |
| **Service**    | `*.service.ts`              | Business rules and transactions; throws `HttpError`              |
| **Repository** | `*.repository.ts`           | SQL only; rows ↔ domain objects                                  |
| Rules / types  | `*.rules.ts`, `*.types.ts`  | Pure logic (unit-tested) and shared shapes                       |

Errors are thrown, never answered in controllers: Express 5 forwards them to
`middleware/error-handler.ts`, which returns `{ error: { code, message, details? } }`.
`message` is Vietnamese and safe to show to users; `code` is stable for programs.

## How it works

### Pricing (`modules/pricing/pricing.ts`)

1. Each night is priced by date: **holiday** rate on dates in the holidays table, **weekend**
   rate Friday–Sunday nights, **weekday** rate Monday–Thursday.
2. **Long-stay discount**: best tier the stay qualifies for, on non-holiday nights only.
3. **Weekly / monthly price**: stays of 7+ nights may be priced as whole months (30 nights) and
   weeks (7) plus remaining nights. The guest gets the cheaper of 2 and 3, never both.
4. **Promo code**: percentage or fixed amount off what remains; single-use by default.
5. **Deposit** = total × apartment deposit % (default 30), rounded to 1,000 ₫.

Prices are computed only on the server and frozen on the booking, so later price edits never
change existing bookings.

### Booking lifecycle

```
pending ──owner sees the money arrive──▶ confirmed ──check-out passes──▶ completed
   ├──unpaid when the hold runs out──▶ expired ──money seen late, dates still free──▶ confirmed
   └──owner cancels──▶ cancelled                 confirmed ──owner cancels──▶ cancelled
```

- A new booking **holds its dates for `BOOKING_HOLD_MINUTES`** (default 180) while the guest
  transfers and the owner looks for the money. Once anything is paid, the hold has no deadline.
- **Double bookings are blocked by Postgres**: exclusion constraints reject overlapping
  pending/confirmed bookings for the same apartment or the same guest email or phone,
  even under concurrent requests. Adjacent stays are allowed. Duplicate guest requests
  return `409 DUPLICATE_BOOKING` without exposing the existing booking reference.
- A guest can hold at most 3 unpaid bookings at once (by email, phone or IP), so nobody can
  block the calendar.
- Guests have no accounts. Creating a booking returns a fresh, signed **access token** scoped to
  that booking. It expires after `BOOKING_ACCESS_TOKEN_DAYS` (30 by default), and the site keeps it
  only in the current browser tab before sending it as `X-Booking-Token`. On another device, after
  closing the tab, or after expiry, the guest looks the booking up with its reference plus their
  email or phone; a successful CAPTCHA-protected lookup issues a fresh token.
  Deploying this token format invalidates tokens issued by older releases; existing guests regain
  access through that same lookup flow.

### Payments: bank transfer, confirmed by the owner

The guest pays by VietQR, then reports the transfer with a **screenshot** from their bank app
(docs/adr/0001). The site cannot see the bank account, so the screenshot is evidence only: the
owner confirms when the money shows in the bank app.

```
Guest books ──▶ dates held 3 h · guest emailed bank details · owner emailed "watch for RE2611K7Q3M"
Guest picks deposit / full ──GET /bookings/:ref/transfer──▶ account + VietQR (amount and note pre-filled)
Guest transfers, attaches the screenshot, presses "Tiếp tục thanh toán"
      ──POST /bookings/:ref/transfer?option=…  (body: the image)──▶ payment `pending`, hold lifted,
      dates held until the owner answers · owner emailed "check this transfer"
Owner finds the money ──"Đã nhận" on the booking page (screenshot shown beside it)
      ──POST /admin/payments/:id/verify──▶ payment `succeeded`, booking CONFIRMED, guest emailed
   or ──"Chưa nhận được" ──POST /admin/payments/:id/reject──▶ guest emailed, fresh hold to pay or explain
Money without a report (cash, a guest who never pressed the button)
      ──POST /admin/bookings/:ref/payments──▶ payment `succeeded`, booking CONFIRMED, guest emailed
30 min before an unreported hold runs out ──▶ owner reminded once (job `remind-owner`)
Hold runs out ──▶ booking expired, dates released. Money seen later still confirms it while the
      dates are free; otherwise 409 DATES_TAKEN and the owner refunds from the bank app.
```

**Transfer screenshots** (`payments/transfer-screenshot.ts`, table `transfer_screenshots`):
- The website shrinks the image (JPEG, longest side 2,000 px) before upload; the API accepts
  JPEG, PNG or WebP up to 5 MB, reads the type from the bytes (never the header), and stores it
  in Postgres in the same transaction as the report (docs/adr/0002).
- Only the guest (booking token) and the owner (admin sign-in) can fetch it; responses are
  `no-store`. An upload is refused (404) before its body is read unless the token opens the booking.
- Job `purge-screenshots` deletes each one 35 days after upload once the owner has verified or
  rejected the report. The payment and its history stay.
- **Screenshot check** (`lib/image-text.ts`, `showsTransfer`): before the report is saved, OCR
  (Tesseract, on this server, Vietnamese model from `@tesseract.js-data/vie`) reads the image and
  looks for this booking's transfer note, its amount, or two banking words. An image showing none
  gets `422 NOT_A_TRANSFER_SCREENSHOT`, and the website offers "Chọn ảnh khác" or "Vẫn gửi ảnh
  này" (`?sendAnyway=true`), which the owner then sees flagged. It only filters unrelated images;
  it proves nothing. If OCR fails or takes over 15 s, the report goes through unchecked. The OCR
  worker thread (about 100 MB) starts on first use and stops after 10 idle minutes.

- **A booking is only confirmed once its money is confirmed by the owner.** Verifying a transfer,
  or recording money received in person, confirms it and queues one booking-confirmation email;
  confirming without payment is refused. Subsequent payments queue a payment-received email.
- The app does not read the owner's email inbox. A reply to the notification email does not
  change a booking; use the authenticated admin dashboard until inbound email is configured.
- The **VietQR code** is generated per payment (NAPAS 247 standard, `payments/vietqr.ts`, tested
  against the bank-issued code): the guest's banking app fills in the account, the exact amount and
  the **transfer note** = booking reference without dashes (e.g. `RE2611K7Q3M`), so the owner can
  match every transfer to its booking.
- Guests pay the **deposit** or the **full amount**; the balance can be transferred the same way
  later (lookup page) or recorded by the owner as cash / transfer at check-in.
- A guest cannot report a second transfer while one is being checked, so nothing is counted twice.
- **Refunds**: the owner transfers the money back from their bank app and records it; the guest is
  emailed.

### Emails

Written to an **outbox table in the same transaction** as the change they announce, then sent by
the `send-emails` job through Resend with retries (8 attempts, exponential backoff) and
idempotency keys. A slow or failing email service never breaks a booking, and nothing is lost
on restart. Without `RESEND_API_KEY` (development only), a content-free delivery marker is written
to the log; recipient addresses, subjects and bodies are never logged.

| Recipient | When                                                                  |
| --------- | --------------------------------------------------------------------- |
| Guest     | Dates held, with bank details · transfer screenshot received · transfer not received (fresh hold) · booking confirmed by owner · later payment received · booking cancelled · refund |
| Owner     | New booking: watch for this transfer · screenshot sent: check this transfer · hold about to run out, nothing reported · contact message |

### Background jobs (`src/jobs`)

| Job                    | Every  | Purpose                                              |
| ---------------------- | ------ | ---------------------------------------------------- |
| send-emails            | 15 s   | Deliver queued emails                                |
| expire-holds           | 1 min  | Release dates of unpaid bookings                     |
| remind-owner           | 1 min  | Remind the owner once, 30 min before a hold runs out |
| complete-stays         | 15 min | Confirmed stays become completed after check-out     |
| purge-admin-sessions   | 1 h    | Delete expired or idle admin sessions                |
| purge-emails           | 6 h    | Delete sent emails after 90 days (guests' details)   |
| purge-screenshots      | 6 h    | Delete answered transfer screenshots 35 days after upload |

Each run takes a transaction-scoped Postgres advisory lock (safe behind Neon's pooler), so with
several instances only one runs each job. Retention jobs also run once at startup, ensuring a
restart cannot indefinitely postpone deletion. Production requires `JOBS_ENABLED=true`; disabling
all jobs would also disable email delivery, hold expiry and deletion of retained personal data.

### Caching

The published apartments with a year of availability, and each apartment's reviews, are cached
in memory for 30–60 s (`lib/cache.ts`). Concurrent requests share one query, so page renders
and floods cost the database almost nothing. Every successful write through the API (and a job
that changes bookings) clears the cache at once; quotes and bookings always re-check
availability in the database, so a cached calendar can never cause a double booking. Public
responses also carry `Cache-Control: s-maxage=30` for a CDN, and JSON is compressed.

## API

Base path `/api/v1`. Success: `{ "data": … }`. Error: `{ "error": { "code", "message", "details"? } }`.
Every response has an `X-Request-Id` that matches the logs.

**Public**

| Method | Path                                      | Notes                                               |
| ------ | ----------------------------------------- | --------------------------------------------------- |
| GET    | `/apartments`                             | Published apartments with `unavailableDates`        |
| GET    | `/apartments/:slug`                       | One apartment or 404                                |
| GET    | `/apartments/:slug/quote`                 | `?checkIn&checkOut&guests&promoCode`; 409 if taken  |
| GET    | `/apartments/:slug/reviews`               | Public reviews from completed stays                 |
| POST   | `/bookings`                               | Creates a held booking → `{ booking, accessToken }` (CAPTCHA) |
| POST   | `/bookings/lookup`                        | `{ reference, contact }` → `{ booking, accessToken }` (CAPTCHA) |
| GET    | `/bookings/:reference`                    | `X-Booking-Token`                                   |
| GET    | `/bookings/:reference/transfer`           | `?option=deposit|full` → account, amount, note, VietQR |
| POST   | `/bookings/:reference/transfer`           | `{ option }` "I have transferred" → updated booking |
| GET    | `/bookings/:reference/review`             | Guest's review or null; `X-Booking-Token` required  |
| POST   | `/bookings/:reference/review`             | `{ rating, comment }` after checkout; one per booking |
| POST   | `/contact`                                | Contact form (CAPTCHA + honeypot)                   |
| GET    | `/health`, `/health/ready`                | Liveness, readiness (outside `/api`)                |

**Admin** (`/api/v1/admin/*`, `Authorization: Bearer <token>`): login/logout/password, signed-in devices (list, sign out one or all others), dashboard charts (`/stats`),
dashboard summary (with bookings waiting for their money), bookings (list, detail, verify / reject a reported
transfer, record payment, refund, cancel, complete), apartments (create, edit, publish, blocked dates), holidays, promo codes,
contact inbox. Full list: `src/modules/admin/admin.router.ts`.

## Security & DDoS mitigation

| Threat                               | Mitigation                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| Header-based attacks                 | helmet (HSTS, strict CSP, nosniff, frame blocking, no X-Powered-By)                       |
| Other websites calling the API       | Exact CORS allowlist (`SITE_URL` + `CORS_ORIGINS`; no wildcard preview domains)          |
| One client flooding the API          | Per-IP limit on all `/api` requests (`RATE_LIMIT_MAX`), 429 + `Retry-After`              |
| Bots and botnets (many IPs)          | Cloudflare Turnstile CAPTCHA on booking, lookup, contact and admin login (`TURNSTILE_SECRET_KEY`); fails closed |
| Floods that saturate the process     | Load shedding: 503 + `Retry-After` while the event loop lags over `OVERLOAD_LAG_MS`      |
| Floods that reach the database       | Public reads served from an in-memory cache with single-flight loading; unknown slugs never query |
| Probe endpoint abuse                 | `/health/ready` reuses one database check for 2 s                                       |
| Booking / form spam                  | CAPTCHA; stricter per-IP limit on anonymous writes; max 3 unpaid holds per guest; contact honeypot |
| Password guessing                    | CAPTCHA; 10 failed logins / 15 min per IP **and** per account; scrypt hashes; constant-time checks; no account enumeration |
| Promo code guessing                  | 30 quotes with a code / 15 min per IP                                                    |
| Booking enumeration                  | CAPTCHA; random references, lookup needs email/phone, 20 lookups / 15 min per IP, 404 on bad token |
| Leaked guest booking token           | Random, booking-scoped signed tokens expire after `BOOKING_ACCESS_TOKEN_DAYS`; browser cache is tab-scoped |
| Fake "I have transferred" reports    | Nothing is confirmed until the owner sees the money; one open report per booking        |
| Spoofed client IPs                   | `trust proxy` = exact proxy count (`TRUST_PROXY_HOPS`)                                   |
| Large bodies / slow clients          | 100 kB JSON limit (5 MB image on the transfer-screenshot route, read only after the booking token is checked); 10 s headers, 30 s request timeouts |
| Slow queries piling up               | Postgres `statement_timeout`, bounded pool, fast fail when saturated; broken connections discarded |
| SQL injection                        | Parameterised queries only; all input validated with zod; length checks in the database too |
| Stored XSS via listing photos        | Photo addresses must be a site path or `https://` (no `javascript:` / `data:`); the website adds a nonce-based CSP |
| Email header injection               | Subjects stripped of control characters; every guest value HTML-escaped in bodies        |
| Leaking internals / stolen DB dump   | Bare 500s (details only in logs); admin session tokens stored as SHA-256 hashes; sent emails purged after 90 days |
| Stolen or forgotten admin sign-in    | Sessions end after `ADMIN_IDLE_MINUTES` (120) without use and `ADMIN_SESSION_HOURS` (12) in all; the account page lists every signed-in device to sign out; a password change signs out all other devices and emails the admin |
| Weak admin passwords                 | scrypt hashing; new passwords need 12+ characters, not a common password, not the email name, not the current one (`admin-auth/password.ts`, unit-tested) |

Production startup fails closed when Turnstile, database TLS or an explicit `TRUST_PROXY_HOPS`
value is missing. The API logs a warning when `INTERNAL_API_KEY` is missing.

**In front of the app (required in production):** a CDN/WAF with DDoS protection (Cloudflare,
AWS CloudFront + Shield/WAF, …). Only that layer absorbs network floods.

**Several instances:** rate-limit counters live in process memory; add a shared store (e.g.
`rate-limit-redis`) in `middleware/security.ts` so limits apply across instances.

## Deployment

Any Node host works (Railway, Render, Fly.io, a VM, Kubernetes). With Docker:

```bash
docker build -t real-estate-api .
docker run --env-file .env.production real-estate-api node dist/db/migrate.js   # release step
docker run --env-file .env.production -p 3000:3000 real-estate-api
```

Without Docker: `npm ci && npm run build && npm run db:migrate && npm start`.

## Go-live checklist

**Accounts**
- [ ] Bank account for payments: `BANK_BIN`, `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` (scan the generated QR with a banking app once to check the name shown)
- [ ] Resend account, sending domain verified (SPF/DKIM) → `RESEND_API_KEY`, `EMAIL_FROM` on that domain, `OWNER_EMAIL` (comma-separated for several inboxes), optional `EMAIL_REPLY_TO` (a real inbox for guest replies)

**Configuration**
- [ ] `NODE_ENV=production`; `SITE_URL` is the real `https://` origin with no path, query or credentials (links in emails)
- [ ] Fresh secrets: `BOOKING_TOKEN_SECRET`, `INTERNAL_API_KEY` (same value in the website's environment); `openssl rand -base64 48`
- [ ] `DATABASE_URL` for production, `DB_SSL=true` for managed Postgres; `instances × DB_POOL_MAX` < `max_connections`
- [ ] Explicitly set `TRUST_PROXY_HOPS` to the verified number of trusted proxies in front of the API (measured as 3 on Render in October 2026: Cloudflare edge, load balancer, local proxy; use 0 only for a directly reached API). Check after deploying: the request log's `ip` must be your own address, also when you send a forged `X-Forwarded-For`
- [ ] Cloudflare Turnstile widget created for the website's domain(s) → `TURNSTILE_SECRET_KEY` here, `TURNSTILE_SITE_KEY` in the website's build; then submit the contact form once to check

An existing Turnstile widget can be reused after its hostname list includes this website.
The API checks the hostname returned by Cloudflare against its approved website origins, so
tokens solved on another website sharing the widget are refused.
- [ ] No `level: "warn"` startup lines about weak settings in the production logs

**Data**
- [ ] `npm run db:migrate` on the production database (includes the Sun Garden A04-12 listing)
- [ ] `npm run admin:create:prod -- <owner email> "<name>"`, sign in, change the password
- [ ] Confirm guest capacity, check-in/out times and deposit policy in the admin area
- [ ] Add this year's lunar holidays (Tết, Giỗ Tổ Hùng Vương) and extra days off (Ngày lễ)

**Infrastructure**
- [ ] CDN / WAF with DDoS protection in front of the API (e.g. Cloudflare proxy; then count it in `TRUST_PROXY_HOPS`)
- [ ] `npm run db:migrate` includes `009_performance_and_hardening.sql` (indexes and length checks)
- [ ] Health checks: liveness `/health`, readiness `/health/ready`
- [ ] Daily database backups with point-in-time recovery
- [ ] Log collection and an alert on `level: "error"` lines
- [ ] One real booking end to end: small transfer → verify in admin → guest confirmation email
