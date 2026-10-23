/** Calendar boundaries; optional integration runs only against an isolated local database. */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const testDatabase = process.env['DASHBOARD_TEST_DATABASE_URL'];
if (testDatabase) {
  const url = new URL(testDatabase);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/real_estate_reporting_'));
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDatabase ?? 'postgresql://synthetic:synthetic@127.0.0.1:9/synthetic',
  DB_TRANSPORT: 'tcp',
  DB_SSL: 'false',
  SITE_URL: 'https://example.invalid',
  JOBS_ENABLED: 'false',
  BUSINESS_TIMEZONE: 'Asia/Ho_Chi_Minh',
  BOOKING_TOKEN_SECRET: 'synthetic-reporting-test-secret-123456789',
  EMAIL_FROM: 'test@example.invalid',
  OWNER_EMAIL: 'owner@example.invalid',
  RESEND_API_KEY: '',
  TURNSTILE_SECRET_KEY: '',
  BANK_BIN: '970436',
  BANK_NAME: 'Synthetic',
  BANK_ACCOUNT_NUMBER: '0000000000',
  BANK_ACCOUNT_NAME: 'SYNTHETIC',
});
const { pool } = await import('../src/db/pool.js');
const { bookingService } = await import('../src/modules/bookings/booking.service.js');
after(async () => {
  await pool.end();
});

test(
  'Postgres reporting honors Vietnam midnight, refunds, deposits and end-exclusive nights',
  { skip: !testDatabase },
  async () => {
    const apt = (await pool.query<{ id: string }>('SELECT id FROM apartments WHERE is_active LIMIT 1')).rows[0];
    const active = Number(
      (await pool.query<{ count: string }>('SELECT count(*) FROM apartments WHERE is_active')).rows[0].count,
    );
    const db = await pool.connect();
    const bookingId = '00000000-0000-0000-0000-000000000901';
    const paymentId = '00000000-0000-0000-0000-000000000902';
    const depositId = '00000000-0000-0000-0000-000000000903';
    try {
      await db.query('BEGIN');
      await db.query(
        `INSERT INTO bookings (id,reference,apartment_id,check_in,check_out,guests,customer_name,customer_phone,customer_email,deposit_percent,status,subtotal,total_amount,deposit_amount,confirmed_at)
      VALUES ($1,'RE-2610-STATS',$2,'2026-10-25','2026-11-02',1,'SYNTHETIC REPORTING','0900000002','reporting@example.invalid',20,'completed',1000000,1000000,200000,'2026-10-25T17:30:00Z')`,
        [bookingId, apt.id],
      );
      await db.query(
        `INSERT INTO payments (id,booking_id,provider,purpose,amount,state,paid_at) VALUES
      ($2,$1,'bank_transfer','accommodation',1000000,'succeeded','2026-10-25T17:30:00Z'),
      ($3,$1,'bank_transfer','asset_security',500000,'succeeded','2026-10-25T17:30:00Z'),
      (gen_random_uuid(),$1,'bank_transfer','incident',200000,'succeeded','2026-11-01T16:59:00Z'),
      (gen_random_uuid(),$1,'bank_transfer','accommodation',300000,'succeeded','2026-11-01T17:00:00Z'),
      (gen_random_uuid(),$1,'bank_transfer','accommodation',2000000,'failed','2026-10-25T17:30:00Z')`,
        [bookingId, paymentId, depositId],
      );
      await db.query(
        `INSERT INTO refunds (payment_id,amount,reason,state,completed_at) VALUES
      ($1,100000,'Synthetic refund','succeeded','2026-10-26T17:00:00Z'),
      ($2,200000,'Synthetic deposit refund','succeeded','2026-10-26T17:00:00Z')`,
        [paymentId, depositId],
      );
      await db.query('COMMIT');
      const day = await bookingService.dashboardStats('day', '2026-10-26');
      assert.equal(day.selected.revenue, 1000000);
      assert.equal(day.selected.bookings, 1);
      assert.equal(day.selected.nightsBooked, 1);
      assert.equal(day.selected.nightsAvailable, active);
      assert.equal((await bookingService.dashboardStats('day', '2026-10-27')).selected.revenue, -100000);
      const week = (await bookingService.dashboardStats('week', '2026-11-01')).selected;
      assert.equal(week.start, '2026-10-26');
      assert.equal(week.end, '2026-11-02');
      assert.equal(week.revenue, 1100000);
      assert.equal(week.nightsBooked, 7);
      assert.equal(week.nightsAvailable, 7 * active);
      const month = (await bookingService.dashboardStats('month', '2026-10-31')).selected;
      assert.equal(month.revenue, 900000);
      assert.equal(month.nightsBooked, 7);
      const year = (await bookingService.dashboardStats('year', '2026-12-31')).selected;
      assert.equal(year.revenue, 1400000);
      assert.equal(year.nightsBooked, 8);
      const leap = await bookingService.dashboardStats('day', '2024-02-29');
      assert.equal(leap.selected.end, '2024-03-01');
      assert.equal(leap.previous.start, '2024-02-28');
      assert.equal(leap.selected.revenue, 0);
      assert.equal((await bookingService.dashboardStats('month', '2024-02-29')).selected.nightsAvailable, 29 * active);
      assert.equal((await bookingService.dashboardStats('day', '2026-11-02')).selected.nightsBooked, 0);
      await db.query(
        `INSERT INTO apartments SELECT (jsonb_populate_record(null::apartments,
      to_jsonb(a) || jsonb_build_object('id','00000000-0000-0000-0000-000000000904','slug','synthetic-hidden-report','is_active',false))).*
      FROM apartments a WHERE id=$1`,
        [apt.id],
      );
      await db.query("UPDATE bookings SET apartment_id='00000000-0000-0000-0000-000000000904' WHERE id=$1", [
        bookingId,
      ]);
      const hidden = (await bookingService.dashboardStats('day', '2026-10-26')).selected;
      assert.equal(hidden.nightsBooked, 0, 'Hidden apartments are excluded from occupancy numerator and capacity');
      assert.equal(hidden.nightsAvailable, active);
    } finally {
      await db.query('ROLLBACK');
      await db.query('DELETE FROM refunds WHERE payment_id IN (SELECT id FROM payments WHERE booking_id=$1)', [
        bookingId,
      ]);
      await db.query('DELETE FROM payments WHERE booking_id=$1', [bookingId]);
      await db.query('DELETE FROM bookings WHERE id=$1', [bookingId]);
      await db.query("DELETE FROM apartments WHERE id='00000000-0000-0000-0000-000000000904'");
      db.release();
    }
  },
);
