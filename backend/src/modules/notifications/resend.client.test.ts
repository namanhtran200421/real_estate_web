import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const testEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  SITE_URL: 'http://localhost:4200',
  DATABASE_URL: 'postgresql://localhost:5432/booking',
  BOOKING_TOKEN_SECRET: 'booking-token-secret-with-more-than-32-characters',
  RESEND_API_KEY: '',
  EMAIL_FROM: 'Booking <booking@example.com>',
  OWNER_EMAIL: 'owner@example.com',
  BANK_BIN: '970436',
  BANK_NAME: 'Example Bank',
  BANK_ACCOUNT_NUMBER: '123456789',
  BANK_ACCOUNT_NAME: 'OWNER NAME',
};

describe('Resend development fallback', () => {
  it('logs a delivery marker without recipient or message content', () => {
    const recipient = 'private-guest@example.com';
    const subject = 'Private booking subject';
    const text = 'Private booking body';
    const html = '<p>Private booking HTML</p>';
    const script = `
      const { sendEmail } = await import('./src/modules/notifications/resend.client.ts');
      await sendEmail(${JSON.stringify({ to: recipient, subject, text, html })}, 'email-outbox-42');
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: testEnvironment,
    });

    assert.equal(result.status, 0, result.stderr);
    const log = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    assert.equal(log['emailId'], 'email-outbox-42');
    for (const sensitive of [recipient, subject, text, html]) {
      assert.equal(result.stdout.includes(sensitive), false, `logged sensitive value: ${sensitive}`);
    }
  });
});
