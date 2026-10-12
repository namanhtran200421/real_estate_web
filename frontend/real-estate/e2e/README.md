# Browser checks

Run against a running site (the checks do not start servers).

```bash
# 1. API on a disposable local database (never the Neon URL in backend/.env)
cd backend
PORT=3100 DATABASE_URL=postgresql://localhost/real_estate_test DB_SSL=false TURNSTILE_SECRET_KEY= RESEND_API_KEY= \
  SITE_URL=http://localhost:4377 CORS_ORIGINS=http://localhost:4377,http://localhost:4000 npm run dev
# 2. Site pointed at it (regenerate environment.ts afterwards with `node scripts/write-env.mjs`)
cd frontend/real-estate
API_URL=http://localhost:3100 TURNSTILE_SITE_KEY= node scripts/write-env.mjs && npx ng serve --port 4377
# 3. Checks
node e2e/run.mjs --site http://localhost:4377            # all
node e2e/run.mjs smoke --site http://localhost:4377      # one
node e2e/run.mjs smoke --site http://localhost:4377 --firefox   # needs `npx playwright-core install firefox`
```

Screenshots land in `e2e/output/` (git-ignored). Production SSR with CSP: `npm run build`, then
`API_URL=http://localhost:3100 node dist/real-estate/server/server.mjs` (port 4000) and `--site http://localhost:4000`.
