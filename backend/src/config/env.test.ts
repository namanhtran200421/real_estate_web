import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const productionEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'production',
  SITE_URL: 'https://booking.example.com',
  DATABASE_URL: 'postgresql://user:password@db.example.com:5432/booking',
  DB_SSL: 'true',
  BOOKING_TOKEN_SECRET: 'booking-token-secret-with-more-than-32-characters',
  GUEST_IDENTITY_ENCRYPTION_KEY: 'identity-key-with-more-than-32-characters',
  GUEST_IDENTITY_RETENTION_DAYS: '35',
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'Booking <booking@example.com>',
  OWNER_EMAIL: 'owner@example.com',
  BANK_BIN: '970436',
  BANK_NAME: 'Example Bank',
  BANK_ACCOUNT_NUMBER: '123456789',
  BANK_ACCOUNT_NAME: 'OWNER NAME',
  TURNSTILE_SECRET_KEY: '0x-real-production-secret',
  CORS_ORIGINS: '',
};

function loadEnvironment(overrides: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['--import', 'tsx', '--eval', "import('./src/config/env.ts')"], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...productionEnvironment, ...overrides },
  });
}

describe('production environment security', () => {
  it('fails closed without CAPTCHA or database TLS', () => {
    const result = loadEnvironment({ TURNSTILE_SECRET_KEY: '', DB_SSL: 'false' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /TURNSTILE_SECRET_KEY is required in production/);
    assert.match(result.stderr, /DB_SSL must be true in production/);
  });

  it('accepts only exact HTTPS browser origins', () => {
    const valid = loadEnvironment({ CORS_ORIGINS: 'https://preview.example.com,https://admin.example.com/' });
    assert.equal(valid.status, 0, valid.stderr);

    const invalid = loadEnvironment({ CORS_ORIGINS: 'https://preview.example.com/path,http://admin.example.com' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /entries must be origins without credentials, paths, queries or fragments/);
    assert.match(invalid.stderr, /origins must use https:\/\/ in production/);
  });

  it('does not allow production to disable retention and delivery jobs', () => {
    const result = loadEnvironment({ JOBS_ENABLED: 'false' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /JOBS_ENABLED must be true in production/);
  });
});
