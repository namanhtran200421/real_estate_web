import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

describe('retention job startup', () => {
  it('purges retained personal data on startup without waiting six hours', () => {
    const script = `
      import assert from 'node:assert/strict';
      const { jobs } = await import('./src/jobs/index.ts');
      const { pool } = await import('./src/db/pool.ts');
      const { startJobs, stopJobs } = await import('./src/jobs/scheduler.ts');
      const queries = [];
      let released = 0;
      pool.connect = async () => ({
        query: async (sql) => {
          queries.push(sql);
          return { rows: [{ locked: true }] };
        },
        release: () => { released++; },
      });
      const ran = [];
      const purges = jobs.filter((job) => job.name.startsWith('purge-') && job.name !== 'purge-admin-sessions');
      startJobs(purges.map((job) => ({ ...job, run: async () => { ran.push(job.name); } })));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await stopJobs();
      assert.deepEqual(ran.sort(), ['purge-emails', 'purge-guest-identities', 'purge-screenshots']);
      assert.equal(released, 3);
      assert.equal(queries.filter((sql) => sql === 'BEGIN').length, 3);
      assert.equal(queries.filter((sql) => sql.includes('pg_try_advisory_xact_lock')).length, 3);
      assert.equal(queries.filter((sql) => sql === 'COMMIT').length, 3);
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SITE_URL: 'http://localhost:4200',
        DATABASE_URL: 'postgresql://localhost:5432/booking',
        BOOKING_TOKEN_SECRET: 'x'.repeat(32),
        EMAIL_FROM: 'Booking <booking@example.com>',
        OWNER_EMAIL: 'owner@example.com',
        BANK_BIN: '970436',
        BANK_NAME: 'Example Bank',
        BANK_ACCOUNT_NUMBER: '123456789',
        BANK_ACCOUNT_NAME: 'OWNER NAME',
      },
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr || String(result.error ?? result.signal));
  });
});
