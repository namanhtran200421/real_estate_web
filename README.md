# real_estate_web

VN Booking Hub apartment rental website, now featuring Sun Garden A04-12 in Đà Lạt, with online booking and bank transfer (VietQR) confirmed by the owner. Property details, prices and photos come from the owner's [Drive folder](https://drive.google.com/drive/folders/1YmiLD-E5K4H6I3xs4IRzN7nRHOgV6Y74); [content sources](backend/CONTENT_SOURCES.md) records the mapping.

| Part                                            | What                                                           |
| ----------------------------------------------- | -------------------------------------------------------------- |
| [`backend/`](backend/README.md)                 | REST API: pricing, bookings, bank-transfer payments, admin, emails (Node, Express, Neon Postgres) |
| [`frontend/real-estate/`](frontend/real-estate/README.md) | Website and owner admin area (Angular, SSR)          |

Local setup: follow the quick start in `backend/README.md`, then `frontend/real-estate/README.md`.
Before launch: the go-live checklist at the end of `backend/README.md`.
