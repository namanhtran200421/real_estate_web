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
let pendingDeposit: NewBooking | undefined;
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
  return { reference: data.booking.reference, token: data.accessToken, deposit: data.booking.paymentOptions.assetSecurity };
}

function report(
  booking: NewBooking,
  body: BodyInit,
  contentType = 'image/png',
  sendAnyway = false,
  acceptPolicy = true,
): Promise<Response> {
  let query = 'option=asset_security';
  if (acceptPolicy) query += '&acceptPolicy=true';
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

    const withoutImage = await report(booking, JSON.stringify({ option: 'asset_security' }), 'application/json');
    assert.equal(withoutImage.status, 400);
    assert.equal((await withoutImage.json()).error.code, 'SCREENSHOT_REQUIRED');

    const tooLarge = await report(booking, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
    assert.equal(tooLarge.status, 413);

    const withoutToken = await call(`/bookings/${booking.reference}/transfer?option=asset_security&acceptPolicy=true`, {
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

  it('refuses a report until the guest accepts the policy, and stores nothing', async () => {
    const booking = await book(130);

    const response = await report(booking, PNG, 'image/png', false, false);

    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'POLICY_NOT_ACCEPTED');
    const view = await call(`/bookings/${booking.reference}`, { headers: { 'X-Booking-Token': booking.token } });
    assert.equal((await view.json()).data.pendingTransfer, null);
    pendingDeposit = booking;

    const explicit = await call(`/bookings/${booking.reference}/transfer?option=asset_security&acceptPolicy=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Booking-Token': booking.token },
      body: PNG,
    });
    assert.equal(explicit.status, 422);
    assert.equal((await explicit.json()).error.code, 'POLICY_NOT_ACCEPTED');
  });

  it('confirms a deposit-first booking when the owner verifies the deposit, and not before', async () => {
    const booking = pendingDeposit!;
    const owner = { Authorization: `Bearer ${await signInAsOwner()}`, 'Content-Type': 'application/json' };

    const manualRent = await call(`/admin/bookings/${booking.reference}/payments`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ method: 'bank_transfer', purpose: 'accommodation', amount: 1_000_000 }),
    });
    assert.equal(manualRent.status, 422);
    assert.equal((await manualRent.json()).error.code, 'DEPOSIT_REQUIRED_FIRST');

    assert.equal((await report(booking, PNG)).status, 200);
    const detail = await (await call(`/admin/bookings/${booking.reference}`, { headers: owner })).json();
    const [payment] = detail.data.payments;
    assert.equal(payment.purpose, 'asset_security');
    const accepted = detail.data.events.find((event: { type: string }) => event.type === 'policy_accepted');
    assert.equal(accepted?.data.version, '2026-10-14');
    assert.equal(accepted?.data.paymentId, payment.id);

    const tooMuch = await call(`/admin/payments/${payment.id}/verify`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ amount: booking.deposit + 1_000 }),
    });
    assert.equal(tooMuch.status, 422);
    assert.equal((await tooMuch.json()).error.code, 'AMOUNT_ABOVE_DEPOSIT');

    const verified = await call(`/admin/payments/${payment.id}/verify`, { method: 'POST', headers: owner, body: '{}' });
    assert.equal(verified.status, 204);
    const view = await (await call(`/bookings/${booking.reference}`, { headers: { 'X-Booking-Token': booking.token } })).json();
    assert.equal(view.data.status, 'confirmed');
    assert.equal(view.data.paymentStatus, 'deposit_paid');
    assert.equal(view.data.depositFirst, true);
    assert.deepEqual(view.data.paymentOptions, { deposit: null, full: null, assetSecurity: null, incident: null });
    assert.equal(view.data.rentDueFrom, view.data.checkIn);
  });

  it('asks for the rent on check-in morning, once', async () => {
    const booking = await book(140);
    const owner = { Authorization: `Bearer ${await signInAsOwner()}`, 'Content-Type': 'application/json' };
    const recorded = await call(`/admin/bookings/${booking.reference}/payments`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ method: 'cash', purpose: 'asset_security', amount: booking.deposit }),
    });
    assert.equal(recorded.status, 201, await recorded.clone().text());
    const { pool } = await import('../../db/pool.js');
    await pool.query(
      `UPDATE bookings
       SET check_in = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1,
           check_out = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1
       WHERE reference = $1`,
      [booking.reference],
    );

    const view = await (await call(`/bookings/${booking.reference}`, { headers: { 'X-Booking-Token': booking.token } })).json();
    assert.equal(view.data.status, 'confirmed');
    assert.equal(view.data.paymentOptions.full, view.data.quote.total);

    const { bookingService } = await import('../bookings/booking.service.js');
    // Check-in was yesterday (not today) so that 08:00 local time has passed whatever time the test runs.
    assert.equal(await bookingService.sendRentRequests(), 1);
    assert.equal(await bookingService.sendRentRequests(), 0);
    const queued = await pool.query(`SELECT count(*)::int AS n FROM email_outbox WHERE subject LIKE $1`, [
      `Thanh toán tiền phòng · ${booking.reference}`,
    ]);
    assert.equal(queued.rows[0].n, 1);
  });
  it('does not ask for rent from legacy bookings, bookings with a report pending, or finished stays', async () => {
    const owner = { Authorization: `Bearer ${await signInAsOwner()}`, 'Content-Type': 'application/json' };
    const { pool } = await import('../../db/pool.js');
    const { bookingService } = await import('../bookings/booking.service.js');
    const confirmed = async (daysAhead: number) => {
      const booking = await book(daysAhead);
      const recorded = await call(`/admin/bookings/${booking.reference}/payments`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ method: 'cash', purpose: 'asset_security', amount: booking.deposit }),
      });
      assert.equal(recorded.status, 201, await recorded.clone().text());
      return booking;
    };
    const move = (reference: string, from: number, to: number) =>
      pool.query(
        `UPDATE bookings
         SET check_in = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $2::int,
             check_out = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $3::int
         WHERE reference = $1`,
        [reference, from, to],
      );

    // Earlier cases left stays around today; free the calendar, and again after each case below.
    const clear = () => pool.query(`UPDATE bookings SET status = 'cancelled' WHERE status IN ('pending', 'confirmed')`);
    await clear();

    const legacy = await confirmed(150);
    await move(legacy.reference, -1, 1);
    await pool.query('UPDATE bookings SET asset_security_amount = 0 WHERE reference = $1', [legacy.reference]);
    assert.equal(await bookingService.sendRentRequests(), 0, 'legacy booking');
    await clear();

    const reported = await confirmed(160);
    await move(reported.reference, -1, 1);
    await pool.query(
      `INSERT INTO payments (booking_id, provider, purpose, amount, state, note)
       SELECT id, 'bank_transfer', 'accommodation', 1000000, 'pending', 'x' FROM bookings WHERE reference = $1`,
      [reported.reference],
    );
    assert.equal(await bookingService.sendRentRequests(), 0, 'report pending');
    await clear();

    const finished = await confirmed(170);
    await move(finished.reference, -3, -1);
    assert.equal(await bookingService.sendRentRequests(), 0, 'check-out passed');
  });

  it('refunds the deposit after check-out, the rent and an inspection, minus what damage took', async () => {
    const owner = { Authorization: `Bearer ${await signInAsOwner()}`, 'Content-Type': 'application/json' };
    const { pool } = await import('../../db/pool.js');
    await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE status IN ('pending', 'confirmed')`);

    const booking = await book(180);
    const admin = (path: string, method: string, body?: unknown) =>
      call(`/admin/bookings/${booking.reference}${path}`, { method, headers: owner, body: body === undefined ? undefined : JSON.stringify(body) });
    const errorCode = async (response: Response, status: number) => {
      assert.equal(response.status, status);
      return (await response.json()).error.code as string;
    };

    // 1. Deposit verified (recorded as received).
    const deposit = await admin('/payments', 'POST', { method: 'bank_transfer', purpose: 'asset_security', amount: booking.deposit });
    assert.equal(deposit.status, 201, await deposit.clone().text());
    // 2. Check-in was yesterday, check-out is tomorrow.
    await pool.query(
      `UPDATE bookings
       SET check_in = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1,
           check_out = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1
       WHERE reference = $1`,
      [booking.reference],
    );
    const total = (await (await admin('', 'GET')).json()).data.quote.total;

    // 3. Not checked out yet.
    assert.equal(await errorCode(await admin('/deposit-refund', 'POST'), 409), 'INVALID_STATUS');
    // 4. Rent recorded, 5. checked out.
    assert.equal((await admin('/payments', 'POST', { method: 'cash', purpose: 'accommodation', amount: total })).status, 201);
    const completed = await admin('/check-out', 'POST');
    assert.equal(completed.status, 200, await completed.clone().text());
    assert.equal((await completed.json()).data.status, 'completed');

    // 6. No inspection yet.
    assert.equal(await errorCode(await admin('/deposit-refund', 'POST'), 409), 'INSPECTION_REQUIRED');
    // 7. Inspection saved.
    const saved = await admin('/inspection', 'PUT', {
      results: [
        { room: 'Bếp', item: 'Tủ lạnh', ok: true, note: null },
        { room: 'Phòng khách', item: 'Đèn', ok: false, note: 'Vỡ chao đèn' },
      ],
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    const savedDetail = (await saved.json()).data;
    assert.equal(savedDetail.inspection.results.length, 2);
    assert.equal(savedDetail.inspection.inspectedBy, 'owner@example.com');
    assert.ok(savedDetail.checklist.length > 0);
    assert.equal(
      savedDetail.events.find((event: { type: string }) => event.type === 'inspection_saved').data.problems,
      1,
    );

    // 8. A 100.000 ₫ incident taken from the deposit, then settled; an open one blocks the refund.
    const incident = await admin('/incidents', 'POST', { description: 'Vỡ chao đèn', amount: 100_000, securityApplied: 100_000 });
    assert.equal(incident.status, 201, await incident.clone().text());
    assert.equal(await errorCode(await admin('/deposit-refund', 'POST'), 409), 'INCIDENT_OPEN');
    const [{ id: incidentId }] = (await (await admin('', 'GET')).json()).data.incidents;
    assert.equal((await admin(`/incidents/${incidentId}`, 'PATCH', { status: 'settled' })).status, 200);

    // 11 (early). The manual refund cannot give back the deposit applied to damage.
    const paymentId = (await (await admin('', 'GET')).json()).data.payments.find(
      (payment: { purpose: string }) => payment.purpose === 'asset_security',
    ).id;
    const tooMuch = await call(`/admin/payments/${paymentId}/refunds`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ amount: booking.deposit, reason: 'Thử hoàn quá' }),
    });
    assert.equal(await errorCode(tooMuch, 422), 'REFUND_TOO_LARGE');

    // 9. The refund equals the deposit minus the damage.
    const refunded = await admin('/deposit-refund', 'POST');
    assert.equal(refunded.status, 200, await refunded.clone().text());
    const detail = (await refunded.json()).data;
    const refundedTotal = detail.payments.flatMap((payment: { refunds: { amount: number }[] }) => payment.refunds)
      .reduce((sum: number, refund: { amount: number }) => sum + refund.amount, 0);
    assert.equal(refundedTotal, booking.deposit - 100_000);
    assert.equal(detail.depositRefundable, 0);
    const emails = await pool.query(`SELECT count(*)::int AS n FROM email_outbox WHERE subject LIKE $1`, [`Hoàn tiền %${booking.reference}`]);
    assert.equal(emails.rows[0].n, 1, 'one refund email with the total');

    // 10. A second click has nothing left to refund.
    assert.equal(await errorCode(await admin('/deposit-refund', 'POST'), 409), 'NOTHING_TO_REFUND');
    // 11. And so does a manual refund above what is held.
    const again = await call(`/admin/payments/${paymentId}/refunds`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ amount: 1_000, reason: 'Thử hoàn thêm' }),
    });
    assert.equal(await errorCode(again, 422), 'REFUND_TOO_LARGE');
  });

  it('keeps the saved checklist when an apartment is saved without one, and clears it with []', async () => {
    const owner = { Authorization: `Bearer ${await signInAsOwner()}`, 'Content-Type': 'application/json' };
    const current = (await (await call(`/admin/apartments/${APARTMENT}`, { headers: owner })).json()).data;
    const { id: _id, inspectionChecklist: _saved, defaultInspectionChecklist: _default, ...editable } = current;
    const save = async (extra: object) => {
      const response = await call(`/admin/apartments/${APARTMENT}`, {
        method: 'PUT',
        headers: owner,
        body: JSON.stringify({ ...editable, ...extra }),
      });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).data;
    };

    const custom = [{ room: 'Bếp', items: ['Tủ lạnh'] }];
    assert.deepEqual((await save({ inspectionChecklist: custom })).inspectionChecklist, custom);
    assert.deepEqual((await save({})).inspectionChecklist, custom, 'omitted: unchanged');
    const cleared = await save({ inspectionChecklist: [] });
    assert.deepEqual(cleared.inspectionChecklist, []);
    assert.ok(cleared.defaultInspectionChecklist.length > 0);
    const published = (await (await call(`/apartments/${APARTMENT}`)).json()).data;
    assert.equal('inspectionChecklist' in published, false, 'never on the public apartment');
  });

  it('guards the inspection and the deposit refund by status, rent, and accepts blank notes', async () => {
    const owner = { Authorization: `Bearer ${await signInAsOwner()}`, 'Content-Type': 'application/json' };
    const { pool } = await import('../../db/pool.js');
    await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE status IN ('pending', 'confirmed')`);
    const results = [
      { room: 'Bếp', item: 'Tủ lạnh', ok: true, note: '' },
      { room: 'Bếp', item: 'Ấm siêu tốc', ok: true, note: '   ' },
      { room: 'Bếp', item: 'Bồn rửa và vòi nước', ok: true },
    ];
    const put = (reference: string, body: unknown = { results }) =>
      call(`/admin/bookings/${reference}/inspection`, { method: 'PUT', headers: owner, body: JSON.stringify(body) });
    const code = async (response: Response, status: number) => {
      assert.equal(response.status, status);
      return (await response.json()).error.code as string;
    };

    // Pending booking: no inspection.
    const pending = await book(190);
    assert.equal(await code(await put(pending.reference), 409), 'INVALID_STATUS');

    // Confirmed but before check-in: no inspection.
    const early = await book(200);
    await call(`/admin/bookings/${early.reference}/payments`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ method: 'cash', purpose: 'asset_security', amount: early.deposit }),
    });
    assert.equal(await code(await put(early.reference), 409), 'INVALID_STATUS');

    // Completed with the rent unpaid: RENT_DUE comes before INSPECTION_REQUIRED.
    await pool.query(
      `UPDATE bookings
       SET check_in = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1,
           check_out = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1
       WHERE reference = $1`,
      [early.reference],
    );
    assert.equal((await call(`/admin/bookings/${early.reference}/check-out`, { method: 'POST', headers: owner })).status, 200);
    const refund = await call(`/admin/bookings/${early.reference}/deposit-refund`, { method: 'POST', headers: owner });
    assert.equal(await code(refund, 409), 'RENT_DUE');

    // Blank and missing notes are stored as null.
    const saved = await put(early.reference);
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.deepEqual(
      (await saved.json()).data.inspection.results.map((result: { note: string | null }) => result.note),
      [null, null, null],
    );

    // Waiving an incident frees its deposit share.
    const incident = await call(`/admin/bookings/${early.reference}/incidents`, {
      method: 'POST',
      headers: owner,
      body: JSON.stringify({ description: 'Vết bẩn', amount: 50_000, securityApplied: 50_000 }),
    });
    assert.equal(incident.status, 201, await incident.clone().text());
    const [{ id }] = (await (await call(`/admin/bookings/${early.reference}`, { headers: owner })).json()).data.incidents;
    const waived = await call(`/admin/bookings/${early.reference}/incidents/${id}`, {
      method: 'PATCH',
      headers: owner,
      body: JSON.stringify({ status: 'waived' }),
    });
    assert.equal(waived.status, 200, await waived.clone().text());
    const row = await pool.query('SELECT status, security_applied FROM booking_asset_incidents WHERE id = $1', [id]);
    assert.deepEqual(row.rows[0], { status: 'waived', security_applied: 0 });
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
