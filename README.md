# VN Booking Hub

A full-stack apartment booking application for an owner-run property in Đà Lạt. Guests check availability, request a stay, report a bank transfer, and track their booking; the owner manages the apartment and verifies payments.

**Stack:** Angular with server-side rendering · TypeScript · Node.js / Express · PostgreSQL on Neon · VietQR.

## Engineering highlights

- **Booking lifecycle:** availability, price quotes, holds, expiry, and booking lookup.
- **Database integrity:** versioned SQL migrations, including a database constraint to prevent overlapping guest stays.
- **Payment workflow:** separate deposit and rent handling, reported transfers, owner verification, inspections, incidents, and deposit refunds.
- **Owner administration:** authenticated management of bookings, apartment content, pricing, and messages.
- **Server rendering:** public apartment pages render with API data; booking and owner pages render in the browser.
- **Verification:** regression suites cover authentication, security, photo uploads, dashboard queries, and frontend behaviour.

A transfer screenshot can help the owner review a report; it does not confirm that money arrived. The owner verifies the transfer.

## Architecture

```text
Angular website + owner area
  → Express REST API
  → PostgreSQL: apartments, bookings, payments, sessions
```

## Explore the project

| Area | Guide |
| --- | --- |
| Local API setup, configuration, migrations, and operations | [Backend README](backend/README.md) |
| Website setup, SSR, and deployment | [Frontend README](frontend/real-estate/README.md) |
| Booking and payment vocabulary | [Domain context](CONTEXT.md) |
| Design decisions | [Architecture decision records](docs/adr/) |
| Property content provenance | [Content sources](backend/CONTENT_SOURCES.md) |
| Documented security work | [Remediation and verification](docs/security-remediation-2026-10-22.md) |

## Run locally

Use Node.js 22 or newer and your own development PostgreSQL database. Start with the [backend quick start](backend/README.md#quick-start-local), then the [frontend development guide](frontend/real-estate/README.md#development). Configuration is supplied through ignored local environment files.

Migrations initialise the booking schema and property content, so point them at a development database.

## Verify

From `backend/`:

```bash
npm run typecheck
npm run typecheck:security
npm run test:security
```

From `frontend/real-estate/`:

```bash
npm run build
```

See each component's README for configuration and deployment prerequisites. The presence of tests and security documentation is not a claim that the application is certified or free of vulnerabilities.

