# Transfer screenshots live in Postgres for 35 days

Transfer screenshots are stored as `bytea` in the main Postgres database (Neon), in their own table beside `payments`, and deleted 35 days after upload unless the report is still waiting for the owner. The API runs on Render, whose disk is wiped on every deploy, so local files were never an option; the real alternative was an object store (Cloudinary or Cloudflare R2).

We chose Postgres for now because it needs no new account or keys, and the screenshot is written in the same transaction as the reported transfer, so neither can exist without the other. The browser shrinks each image before upload (a few hundred KB), and the 35-day limit bounds the total to a few weeks of uploads, which fits comfortably in Neon's storage. The bank statement remains the lasting record of the money, so nothing is lost when a screenshot is deleted.

## Considered options

- **Object store (R2, Cloudinary)**: the right home once uploads grow or screenshots must be kept longer. Moving means copying the table's rows out and serving signed URLs instead of the API streaming bytes.
