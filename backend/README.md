# Real Estate API

Backend for the apartment booking site: apartments, availability, pricing, bookings, payment by
bank transfer (VietQR) confirmed by the owner, refunds, owner administration, contact form and
email notifications.

Node 22 · Express 5 · PostgreSQL 13+ (Neon) · TypeScript · zod · Resend (email) · qrcode

---

## Quick start (local)

```bash
cp .env.example .env              # set DATABASE_URL, BOOKING_TOKEN_SECRET and your bank account
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
| `npm run build`             | Compile to `dist/` (tests excluded)                                       |
| `npm start`                 | Run the compiled server (production)                                      |
| `npm test`                  | Unit tests (pricing, booking rules, payment signatures)                  |
| `npm run typecheck`         | Type-check everything, tests included                                     |
| `npm run db:migrate`        | Apply pending migrations with the compiled code (production)             |
| `npm run db:migrate:dev`    | Same, from TypeScript                                                     |
| `npm run admin:create`      | Create an admin account: `-- <email> "<name>"` (`admin:create:prod` after build) |

## Configuration

Every setting is an environment variable; nothing is hard-coded. **`.env.example` documents
each one.** Locally they come from `.env` (git-ignored); in production, set them in the hosting
platform. `src/config/env.ts` validates everything at startup and refuses to start with a list
of every problem. In production it additionally requires an HTTPS `SITE_URL` and a Resend key.

For Neon, use the pooled connection string as `DATABASE_URL` for the running API and set
`DB_SSL=true`. Run migrations with a direct Neon connection string (the host has no `-pooler`
suffix), then restore the pooled URL before starting the API. The project and branch must be
selected in Neon before setting these values. Listing content and source links are recorded in
[`CONTENT_SOURCES.md`](CONTENT_SOURCES.md).

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
pending ──owner confirms the money arrived──▶ confirmed ──check-out passes──▶ completed
   ├──no transfer reported when the hold runs out──▶ expired
   └──owner cancels──▶ cancelled                 confirmed ──owner cancels──▶ cancelled
```

- A new booking **holds its dates for `BOOKING_HOLD_MINUTES`** (default 30) while the guest
  transfers. Once the guest reports the transfer, or anything is paid, the hold has no deadline.
- **Double bookings are blocked by Postgres**: exclusion constraints reject overlapping
  pending/confirmed bookings for the same apartment or the same guest email or phone,
  even under concurrent requests. Adjacent stays are allowed. Duplicate guest requests
  return `409 DUPLICATE_BOOKING` without exposing the existing booking reference.
- A guest can hold at most 3 unpaid bookings at once (by email, phone or IP), so nobody can
  block the calendar.
- Guests have no accounts. Creating a booking returns an **access token** (HMAC of the booking
  id). The site stores it and sends it as `X-Booking-Token`. On another device, the guest looks
  the booking up with its reference plus their email or phone.

### Payments: bank transfer, confirmed by the owner

```
Guest picks deposit / full ──GET /bookings/:ref/transfer──▶ account + VietQR (amount and note pre-filled)
Guest transfers in their bank app, taps "Báo đã chuyển khoản" ──POST /bookings/:ref/transfer──▶ payment `pending`
      dates held (no deadline) · owner emailed "check this transfer" · dashboard lists it
Owner checks the bank app ──"Đã nhận tiền"──▶ payment `succeeded`, booking CONFIRMED, guest emailed
                          └─"Chưa nhận được"─▶ payment `failed`, guest emailed, gets a fresh 30-min hold
```

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
on restart. Without `RESEND_API_KEY` (development only), emails are written to the log.

| Recipient | When                                                                  |
| --------- | --------------------------------------------------------------------- |
| Guest     | Transfer report received · booking confirmed by owner · later payment received · transfer not received · booking cancelled · refund |
| Owner     | A guest reported a transfer: check the bank account · contact message |

### Background jobs (`src/jobs`)

| Job                    | Every  | Purpose                                              |
| ---------------------- | ------ | ---------------------------------------------------- |
| send-emails            | 15 s   | Deliver queued emails                                |
| expire-holds           | 1 min  | Release dates of unpaid bookings                     |
| complete-stays         | 15 min | Confirmed stays become completed after check-out     |
| purge-admin-sessions   | 1 h    | Delete expired admin sessions                        |
| purge-emails           | 6 h    | Delete sent emails after 90 days (guests' details)   |

Each run takes a transaction-scoped Postgres advisory lock (safe behind Neon's pooler), so with
several instances only one runs each job. Set `JOBS_ENABLED=false` on instances that should not
run them.

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

**Admin** (`/api/v1/admin/*`, `Authorization: Bearer <token>`): login/logout/password,
dashboard summary (with transfers to check), bookings (list, detail, verify / reject a reported
transfer, record payment, refund, cancel, complete), apartments (create, edit, publish, blocked dates), holidays, promo codes,
contact inbox. Full list: `src/modules/admin/admin.router.ts`.

## Security & DDoS mitigation

| Threat                               | Mitigation                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| Header-based attacks                 | helmet (HSTS, strict CSP, nosniff, frame blocking, no X-Powered-By)                       |
| Other websites calling the API       | CORS allowlist (`SITE_URL` + `CORS_ORIGINS`)                                            |
| One client flooding the API          | Per-IP limit on all `/api` requests (`RATE_LIMIT_MAX`), 429 + `Retry-After`              |
| Bots and botnets (many IPs)          | Cloudflare Turnstile CAPTCHA on booking, lookup, contact and admin login (`TURNSTILE_SECRET_KEY`); fails closed |
| Floods that saturate the process     | Load shedding: 503 + `Retry-After` while the event loop lags over `OVERLOAD_LAG_MS`      |
| Floods that reach the database       | Public reads served from an in-memory cache with single-flight loading; unknown slugs never query |
| Probe endpoint abuse                 | `/health/ready` reuses one database check for 2 s                                       |
| Booking / form spam                  | CAPTCHA; stricter per-IP limit on anonymous writes; max 3 unpaid holds per guest; contact honeypot |
| Password guessing                    | CAPTCHA; 10 failed logins / 15 min per IP **and** per account; scrypt hashes; constant-time checks; no account enumeration |
| Promo code guessing                  | 30 quotes with a code / 15 min per IP                                                    |
| Booking enumeration                  | CAPTCHA; random references, lookup needs email/phone, 20 lookups / 15 min per IP, 404 on bad token |
| Fake "I have transferred" reports    | Nothing is confirmed until the owner sees the money; one open report per booking        |
| Spoofed client IPs                   | `trust proxy` = exact proxy count (`TRUST_PROXY_HOPS`)                                   |
| Large bodies / slow clients          | 100 kB JSON limit; 10 s headers, 30 s request timeouts                  |
| Slow queries piling up               | Postgres `statement_timeout`, bounded pool, fast fail when saturated; broken connections discarded |
| SQL injection                        | Parameterised queries only; all input validated with zod; length checks in the database too |
| Stored XSS via listing photos        | Photo addresses must be a site path or `https://` (no `javascript:` / `data:`); the website adds a nonce-based CSP |
| Email header injection               | Subjects stripped of control characters; every guest value HTML-escaped in bodies        |
| Leaking internals / stolen DB dump   | Bare 500s (details only in logs); admin session tokens stored as SHA-256 hashes; sent emails purged after 90 days |

In production the API logs a warning at startup when `TURNSTILE_SECRET_KEY`, `TRUST_PROXY_HOPS`
or `INTERNAL_API_KEY` is missing.

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
- [ ] Resend account, sending domain verified (SPF/DKIM) → `RESEND_API_KEY`, `EMAIL_FROM` on that domain, `OWNER_EMAIL`

**Configuration**
- [ ] `NODE_ENV=production`; `SITE_URL` is the real `https://` address (links in emails)
- [ ] Fresh secrets: `BOOKING_TOKEN_SECRET`, `INTERNAL_API_KEY` (same value in the website's environment); `openssl rand -base64 48`
- [ ] `DATABASE_URL` for production, `DB_SSL=true` for managed Postgres; `instances × DB_POOL_MAX` < `max_connections`
- [ ] `TRUST_PROXY_HOPS` = number of trusted proxies in front of the API (defaults to 1 on Render, 0 locally); override if your setup differs
- [ ] Cloudflare Turnstile widget created for the website's domain(s) → `TURNSTILE_SECRET_KEY` here, `TURNSTILE_SITE_KEY` in the website's build; then submit the contact form once to check
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
