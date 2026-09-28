# Website

Angular 22 site with server-side rendering: apartment pages, availability, the booking and
payment flow, booking lookup, contact form, and the owner's admin area (`/admin`).
All data comes from the backend API (`../../backend`).

## Development

```bash
cp .env.example .env     # API_URL=http://localhost:3000 by default
npm install
npm start                # http://localhost:4200 (the API must be running)
```

`npm start`, `npm run build`, `npm run watch` and `npm test` first run
`scripts/write-env.mjs`, which writes `src/environments/environment.ts` from `API_URL`.
That file is generated and git-ignored; run one of these scripts (not `ng …` directly) after a
fresh clone.

## Configuration

| Variable           | When           | Purpose                                                                 |
| ------------------ | -------------- | ----------------------------------------------------------------------- |
| `API_URL`          | Build          | Public URL of the API. Bundled into browser code. Vercel defaults to the Render API; other CI builds require it. |
| `INTERNAL_API_KEY` | Runtime (SSR)  | Same value as the API's; server rendering is then not rate limited per IP. Never sent to browsers. |
| `SERVER_API_URL`   | Runtime (SSR)  | Optional private address the renderer uses to reach the API.            |

## Structure

```
src/app/
├── core/api.ts                API URL, errors, SSR request key
├── models/                    Apartment and booking shapes (mirror the API)
├── services/                  Apartments, bookings, booking-form draft
├── components/                Shared UI, incl. the date-range picker
├── pages/                     Public pages and booking steps
│   ├── booking/               1 · dates on an availability calendar, guests, contact (live price)
│   ├── booking-review/        2 · price breakdown, promo code, creates the booking (holds dates)
│   ├── booking-payment/       3 · deposit or full, VietQR bank transfer, "Tôi đã chuyển khoản"
│   ├── booking-confirmation/  4 · waiting for the owner to confirm the transfer / confirmed
│   └── booking-lookup/        find a booking by reference + email/phone; pay the balance
└── admin/                     Owner area (client-rendered, never indexed)
    ├── pages/                 dashboard, bookings, booking detail, calendar, apartments,
    │                          holidays, promo codes, messages, account
    └── admin-auth.service.ts  sign-in, token, route guard, 401 handling
```

Public pages render on the server with live data; the API responses are embedded in the HTML,
so the browser does not fetch them again. Booking and admin pages render in the browser only.

## Deployment (Vercel)

`vercel.json` runs the SSR server as a function. In the Vercel project settings:

1. The build uses the Render API by default. Set `API_URL` to override it, and optionally set `INTERNAL_API_KEY` at runtime to match the API.
2. **Add your domain to `security.allowedHosts` in `angular.json`** (e.g. `"vnbookinghub.vn"`,
   `"www.vnbookinghub.vn"`). Server rendering rejects requests for hosts not on that list.
3. Set the API's `SITE_URL` to this site's URL (CORS and email links).
