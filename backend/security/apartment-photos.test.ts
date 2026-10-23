/** Synthetic HTTP regression: no real account, external network or database access. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:9/synthetic',
  DB_TRANSPORT: 'tcp',
  DB_SSL: 'false',
  SITE_URL: 'https://example.invalid',
  JOBS_ENABLED: 'false',
  BOOKING_TOKEN_SECRET: 'synthetic-photo-test-token-secret-123456789',
  EMAIL_FROM: 'test@example.invalid',
  OWNER_EMAIL: 'owner@example.invalid',
  RESEND_API_KEY: '',
  TURNSTILE_SECRET_KEY: '',
  BANK_BIN: '970436',
  BANK_NAME: 'Synthetic',
  BANK_ACCOUNT_NUMBER: '0000000000',
  BANK_ACCOUNT_NAME: 'SYNTHETIC',
});
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { adminAuthService } = await import('../src/modules/admin-auth/admin-auth.service.js');
const { apartmentPhotoRepository } = await import('../src/modules/apartments/apartment-photo.repository.js');
type StoredPhoto = Parameters<typeof apartmentPhotoRepository.save>[1];

test('photo upload requires owner access, verifies bytes, and serves durable immutable image URLs', async () => {
  pool.query = async () => {
    throw new Error('Unmocked database I/O is forbidden');
  };
  adminAuthService.authenticate = async (token) =>
    token === 'synthetic-owner-token'
      ? {
          admin: {
            id: 'owner',
            email: 'owner@example.invalid',
            name: 'Synthetic',
          },
          sessionId: 'session',
        }
      : undefined;
  const stored = new Map<string, StoredPhoto>();
  apartmentPhotoRepository.save = async (id, photo) => {
    stored.set(id, photo);
  };
  apartmentPhotoRepository.find = async (id) => stored.get(id);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const uploadUrl = `${base}/api/v1/admin/apartments/photos`;
  const headers = {
    Authorization: 'Bearer synthetic-owner-token',
    'Content-Type': 'application/octet-stream',
  };
  const photo = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
    'base64',
  );
  try {
    assert.equal((await fetch(uploadUrl, { method: 'POST', body: photo })).status, 401);
    assert.equal(
      (
        await fetch(uploadUrl, {
          method: 'POST',
          headers,
          body: '<svg onload="alert(1)"/>',
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await fetch(uploadUrl, {
          method: 'POST',
          headers,
          body: Buffer.alloc(5 * 1024 * 1024 + 1),
        })
      ).status,
      413,
    );
    const huge = Buffer.from(photo);
    huge.writeUInt32BE(100_000, 16);
    assert.equal((await fetch(uploadUrl, { method: 'POST', headers, body: huge })).status, 422);
    const upload = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body: photo,
    });
    assert.equal(upload.status, 201);
    const { data } = (await upload.json()) as { data: { src: string } };
    assert.match(data.src, /^\/api\/v1\/apartments\/photos\/[a-f0-9]{64}$/);
    const retry = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body: photo,
    });
    assert.deepEqual(await retry.json(), { data });
    assert.equal(stored.size, 1, 'Retries use the same content identity');
    const image = await fetch(`${base}${data.src}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.match(image.headers.get('cache-control')!, /immutable/);
    assert.equal(image.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), photo);
    assert.equal((await fetch(`${base}/api/v1/apartments/photos/not-a-photo`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
  }
});
