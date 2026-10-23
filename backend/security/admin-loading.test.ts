/** Probe access for sign-in preparation never grants access to owner data. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:9/synthetic',
  DB_TRANSPORT: 'tcp', DB_SSL: 'false', SITE_URL: 'https://example.invalid', JOBS_ENABLED: 'false',
  BOOKING_TOKEN_SECRET: 'synthetic-booking-token-secret-for-security-tests',
  GUEST_IDENTITY_ENCRYPTION_KEY: 'synthetic-identity-secret-for-security-tests',
  EMAIL_FROM: 'test@example.invalid', OWNER_EMAIL: 'owner@example.invalid', RESEND_API_KEY: '',
  BANK_BIN: '970436', BANK_NAME: 'Synthetic', BANK_ACCOUNT_NUMBER: '0000000000', BANK_ACCOUNT_NAME: 'SYNTHETIC',
  LOG_LEVEL: 'error', CORS_ORIGINS: '', TURNSTILE_SECRET_KEY: '',
});
const { createApp } = await import('../src/app.js');
const { closePool } = await import('../src/db/pool.js');
const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

test('only configured browser origins may read health probes', async () => {
  const allowed = await fetch(`${base}/health`, { headers: { Origin: 'https://example.invalid' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://example.invalid');
  assert.equal(allowed.headers.get('cache-control'), 'no-store');
  const denied = await fetch(`${base}/health`, { headers: { Origin: 'https://other.invalid' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('readiness preflight is allowed without an admin session; owner data still requires one', async () => {
  const probe = await fetch(`${base}/health/ready`, {
    method: 'OPTIONS', headers: { Origin: 'https://example.invalid', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(probe.status, 204);
  assert.equal(probe.headers.get('access-control-allow-origin'), 'https://example.invalid');
  const privateResponse = await fetch(`${base}/api/v1/admin/summary`, { headers: { Origin: 'https://example.invalid' } });
  assert.equal(privateResponse.status, 401);
});
