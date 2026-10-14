/**
 * Reporting a transfer with its screenshot, through the HTTP API, against a real database.
 *
 * Unlike app code, this file sets `process.env` (the configuration must be in place before
 * env.ts loads, so the app is imported only afterwards) and queries the pool directly (to empty
 * the tables it uses).
 *
 * Runs only with TEST_DATABASE_URL set to a disposable database with every migration applied:
 * it empties the booking tables first. Locally:
 *   createdb real_estate_test
 *   DATABASE_URL=postgresql://localhost/real_estate_test DB_SSL=false npm run db:migrate:dev
 *   TEST_DATABASE_URL=postgresql://localhost/real_estate_test npm test
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

const databaseUrl = process.env.TEST_DATABASE_URL;

// Fixed, test-only configuration: nothing from .env (which may point at a real database) is used.
const TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  DATABASE_URL: databaseUrl ?? '',
  DB_SSL: 'false',
  SITE_URL: 'http://localhost:4200',
  BOOKING_TOKEN_SECRET: 'test-only-booking-token-secret-0123456789',
  GUEST_IDENTITY_ENCRYPTION_KEY: 'test-only-identity-encryption-key-0123456789',
  GUEST_IDENTITY_RETENTION_DAYS: '35',
  TURNSTILE_SECRET_KEY: '',
  RESEND_API_KEY: '',
  EMAIL_FROM: 'VN Booking Hub <test@example.com>',
  OWNER_EMAIL: 'owner@example.com',
  BANK_BIN: '970436',
  BANK_NAME: 'Vietcombank',
  BANK_ACCOUNT_NUMBER: '6969888821',
  BANK_ACCOUNT_NAME: 'DO HOANG HAI',
  RATE_LIMIT_WRITE_MAX: '1000',
  JOBS_ENABLED: 'false',
};

const APARTMENT = 'sun-garden-a04-12';
// A PNG signature followed by bytes no decoder can read: passes the type check, defeats OCR.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

let server: Server;
let api: string;

interface NewBooking {
  reference: string;
  token: string;
  deposit: number;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${api}/api/v1${path}`, init);
}

/** A fresh booking `daysAhead` days from now, as a guest would make it. */
async function book(daysAhead: number): Promise<NewBooking> {
  const checkIn = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + (daysAhead + 2) * 86_400_000).toISOString().slice(0, 10);
  const response = await call('/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apartmentSlug: APARTMENT,
      checkIn,
      checkOut,
      guests: 2,
      customer: { name: 'Hoàng Hải', phone: `09${String(daysAhead).padStart(8, '0')}`, email: `guest${daysAhead}@example.com` },
      guestIdentities: [
        {
          documentType: 'cccd',
          nationality: 'VN',
          fullName: 'Hoàng Hải',
          dateOfBirth: '1990-01-01',
          documentNumber: '001090000001',
          addressOnDocument: 'Hà Nội',
          issueDate: '2021-01-01',
          expiryDate: '2031-01-01',
          stayReason: 'Du lịch',
        },
        {
          documentType: 'cccd',
          nationality: 'VN',
          fullName: 'Nguyễn An',
          dateOfBirth: '1992-02-02',
          documentNumber: '001092000002',
          addressOnDocument: 'Hà Nội',
          issueDate: '2021-01-01',
          expiryDate: '2031-01-01',
          stayReason: 'Du lịch',
        },
      ],
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const { data } = await response.json();
  return { reference: data.booking.reference, token: data.accessToken, deposit: data.booking.paymentOptions.deposit };
}

function report(booking: NewBooking, body: BodyInit, contentType = 'image/png', sendAnyway = false): Promise<Response> {
  let query = 'option=deposit';
  if (sendAnyway) query += '&sendAnyway=true';
  return call(`/bookings/${booking.reference}/transfer?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'X-Booking-Token': booking.token },
    body,
  });
}

describe('reporting a transfer with its screenshot', { skip: !databaseUrl && 'TEST_DATABASE_URL is not set' }, () => {
  before(async () => {
    Object.assign(process.env, TEST_ENV);
    const { pool } = await import('../../db/pool.js');
    await pool.query('TRUNCATE bookings, payments, refunds, booking_events, email_outbox, admin_sessions, admin_users CASCADE');

    const { createApp } = await import('../../app.js');
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    api = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server?.close(resolve));
    const { stopImageTextReader } = await import('../../lib/image-text.js');
    await stopImageTextReader();
    const { closePool } = await import('../../db/pool.js');
    await closePool();
  });

  it('holds the dates for the owner to check once the guest sends the screenshot', async () => {
    const booking = await book(30);

    const response = await report(booking, PNG);

    assert.equal(response.status, 200, await response.clone().text());
    const { data } = await response.json();
    assert.equal(data.pendingTransfer.amount, booking.deposit);
    assert.equal(data.pendingTransfer.hasScreenshot, true);
    assert.equal(data.holdExpiresAt, null, 'the dates stay blocked until the owner answers');
  });

  it('shows the guest the screenshot they sent, and only to them', async () => {
    const booking = await book(40);
    await report(booking, PNG);
    const path = `/bookings/${booking.reference}/transfer/screenshot`;

    const response = await call(path, { headers: { 'X-Booking-Token': booking.token } });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
    assert.equal((await call(path)).status, 404, 'no token, no screenshot');
  });

  it('keeps the screenshot the owner is checking: a second report is refused', async () => {
    const booking = await book(50);
    await report(booking, PNG);

    const again = await report(booking, Buffer.concat([PNG, Buffer.from('another')]));

    assert.equal(again.status, 409);
    assert.equal((await again.json()).error.code, 'TRANSFER_BEING_CHECKED');
  });

  it('refuses a report without a screenshot, or with one too large to be a screenshot', async () => {
    const booking = await book(60);

    const withoutImage = await report(booking, JSON.stringify({ option: 'deposit' }), 'application/json');
    assert.equal(withoutImage.status, 400);
    assert.equal((await withoutImage.json()).error.code, 'SCREENSHOT_REQUIRED');

    const tooLarge = await report(booking, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
    assert.equal(tooLarge.status, 413);

    const withoutToken = await call(`/bookings/${booking.reference}/transfer?option=deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: PNG,
    });
    assert.equal(withoutToken.status, 404, 'only someone who can open the booking may send a screenshot');

    const view = await call(`/bookings/${booking.reference}`, { headers: { 'X-Booking-Token': booking.token } });
    assert.equal((await view.json()).data.pendingTransfer, null, 'nothing was reported');
  });

  it('shows the owner the screenshot beside the transfer to check', async () => {
    const booking = await book(70);
    await report(booking, PNG);
    const owner = { Authorization: `Bearer ${await signInAsOwner()}` };

    const detail = await (await call(`/admin/bookings/${booking.reference}`, { headers: owner })).json();
    const [payment] = detail.data.payments;
    assert.equal(payment.state, 'pending');
    assert.equal(payment.hasScreenshot, true);
    assert.equal(payment.screenshotShowsTransfer, null, 'an image OCR cannot read is stored unchecked');

    const image = await call(`/admin/payments/${payment.id}/screenshot`, { headers: owner });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
    assert.equal((await call(`/admin/payments/${payment.id}/screenshot`)).status, 401, 'signed-in owners only');
  });

  it('warns the guest when the image shows no transfer, and stores nothing', async () => {
    const booking = await book(100);

    const response = await report(booking, await fixture('unrelated-photo.png'));

    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'NOT_A_TRANSFER_SCREENSHOT');
    const view = await call(`/bookings/${booking.reference}`, { headers: { 'X-Booking-Token': booking.token } });
    assert.equal((await view.json()).data.pendingTransfer, null);
  });

  it('lets the guest send it anyway, flagged for the owner', async () => {
    const booking = await book(110);

    const response = await report(booking, await fixture('unrelated-photo.png'), 'image/png', true);

    assert.equal(response.status, 200, await response.clone().text());
    const owner = { Authorization: `Bearer ${await signInAsOwner()}` };
    const [payment] = (await (await call(`/admin/bookings/${booking.reference}`, { headers: owner })).json()).data.payments;
    assert.equal(payment.screenshotShowsTransfer, false);
  });

  it('takes a transfer screenshot without a second look', async () => {
    const booking = await book(120);

    const response = await report(booking, await fixture('transfer-screenshot.png'));

    assert.equal(response.status, 200, await response.clone().text());
    const owner = { Authorization: `Bearer ${await signInAsOwner()}` };
    const [payment] = (await (await call(`/admin/bookings/${booking.reference}`, { headers: owner })).json()).data.payments;
    assert.equal(payment.screenshotShowsTransfer, true);
  });

  it('deletes a checked screenshot 35 days after upload, but never one the owner has yet to check', async () => {
    const owner = { Authorization: `Bearer ${await signInAsOwner()}` };
    const { paymentService } = await import('./payment.service.js');
    const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);
    const screenshotOf = async (booking: NewBooking) => {
      const detail = await (await call(`/admin/bookings/${booking.reference}`, { headers: owner })).json();
      const [payment] = detail.data.payments;
      return { payment, image: await call(`/admin/payments/${payment.id}/screenshot`, { headers: owner }) };
    };

    const checked = await book(80);
    await report(checked, PNG);
    const { payment } = await screenshotOf(checked);
    const verified = await call(`/admin/payments/${payment.id}/verify`, {
      method: 'POST',
      headers: { ...owner, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(verified.status, 204);
    const waiting = await book(90);
    await report(waiting, PNG);

    await paymentService.purgeOldTransferScreenshots(daysFromNow(34));
    assert.equal((await screenshotOf(checked)).image.status, 200, 'kept for 35 days');

    await paymentService.purgeOldTransferScreenshots(daysFromNow(36));
    const purged = await screenshotOf(checked);
    assert.equal(purged.image.status, 404);
    assert.equal(purged.payment.hasScreenshot, false);
    assert.equal(purged.payment.state, 'succeeded', 'the payment itself stays');
    assert.equal((await screenshotOf(waiting)).image.status, 200, 'the owner has yet to check it');
  });
});

let ownerToken: string | undefined;

async function signInAsOwner(): Promise<string> {
  if (ownerToken) return ownerToken;
  const { adminAuthService } = await import('../admin-auth/admin-auth.service.js');
  const password = randomBytes(12).toString('base64url');
  await adminAuthService.createAdmin('owner@example.com', 'Owner', password);
  const response = await call('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  ownerToken = (await response.json()).data.token as string;
  return ownerToken;
}
