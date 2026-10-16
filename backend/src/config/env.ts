/**
 * Application configuration.
 *
 * Every setting comes from environment variables (loaded from `.env` in development,
 * injected by the platform in production). Values are parsed and validated once at
 * startup; if anything is missing or malformed the process exits immediately with a
 * list of every problem, instead of failing later at request time.
 *
 * The rest of the codebase imports `env` from here and never reads `process.env` directly.
 * This file is the full list of variables, with their defaults and limits.
 */
import dotenv from 'dotenv';

// Real environment variables take precedence over `.env`, so the file is a local fallback only.
dotenv.config({ quiet: true });

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

const problems: string[] = [];

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') return undefined;
  return value;
}

function requiredString(name: string): string {
  const value = read(name);
  if (value === undefined) {
    problems.push(`${name} is required`);
    return '';
  }
  return value;
}

function string(name: string, fallback: string): string {
  return read(name) ?? fallback;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = read(name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
    return fallback;
  }
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = read(name);
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  problems.push(`${name} must be "true" or "false" (got "${raw}")`);
  return fallback;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = read(name);
  if (raw === undefined) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;

  problems.push(`${name} must be one of ${allowed.join(', ')} (got "${raw}")`);
  return fallback;
}

/** Comma-separated list; empty entries are dropped. */
function list(name: string): string[] {
  const raw = read(name);
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Browser origins, normalized to scheme + host (+ optional port). */
function origins(name: string, requireHttps: boolean): string[] {
  const values = list(name);
  const normalized = new Set<string>();

  for (const value of values) {
    if (!URL.canParse(value)) {
      problems.push(`${name} contains an invalid URL ("${value}")`);
      continue;
    }

    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      problems.push(`${name} origins must use http:// or https:// (got "${value}")`);
      continue;
    }
    if (requireHttps && parsed.protocol !== 'https:') {
      problems.push(`${name} origins must use https:// in production (got "${value}")`);
      continue;
    }
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      problems.push(`${name} entries must be origins without credentials, paths, queries or fragments (got "${value}")`);
      continue;
    }
    normalized.add(parsed.origin);
  }

  return [...normalized];
}

/** A required absolute URL, without trailing slash. HTTPS is enforced in production. */
function url(name: string, requireHttps: boolean): string {
  const value = requiredString(name).replace(/\/+$/, '');
  if (value === '') return value;
  if (!URL.canParse(value)) {
    problems.push(`${name} must be a valid URL`);
  } else if (requireHttps && new URL(value).protocol !== 'https:') {
    problems.push(`${name} must use https:// in production`);
  }
  return value;
}

/** A public HTTP(S) origin, without credentials, path, query or fragment. */
function origin(name: string, requireHttps: boolean): string {
  const value = url(name, requireHttps);
  if (value === '' || !URL.canParse(value)) return value;

  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    problems.push(`${name} must be an origin without credentials, path, query or fragment`);
  }
  return parsed.origin;
}

function timezone(name: string, fallback: string): string {
  const value = string(name, fallback);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
  } catch {
    problems.push(`${name} must be an IANA time zone such as Asia/Ho_Chi_Minh (got "${value}")`);
  }
  return value;
}

function secret(name: string, minLength: number): string {
  const value = requiredString(name);
  if (value !== '' && value.length < minLength) problems.push(`${name} must be at least ${minLength} characters`);
  return value;
}

function optionalSecret(name: string, minLength: number): string | undefined {
  const value = read(name);
  if (value !== undefined && value.length < minLength) problems.push(`${name} must be at least ${minLength} characters`);
  return value;
}

function bankBin(name: string): string {
  const value = requiredString(name);
  if (value !== '' && !/^\d{6}$/.test(value)) problems.push(`${name} must be the bank's 6-digit NAPAS BIN (e.g. 970436)`);
  return value;
}

function accountNumber(name: string): string {
  const value = requiredString(name);
  if (value !== '' && !/^[0-9A-Za-z]{4,19}$/.test(value)) problems.push(`${name} must be 4–19 letters or digits`);
  return value;
}

const nodeEnv = oneOf('NODE_ENV', NODE_ENVS, 'development');
const isProduction = nodeEnv === 'production';

const resendApiKey = read('RESEND_API_KEY');
const captchaSecret = read('TURNSTILE_SECRET_KEY');
const dbSsl = boolean('DB_SSL', false);
const jobsEnabled = boolean('JOBS_ENABLED', true);
const trustProxyConfigured = read('TRUST_PROXY_HOPS') !== undefined;
const trustProxyHops = integer('TRUST_PROXY_HOPS', process.env.RENDER === 'true' ? 3 : 0, 0, 10);
const guestIdentityEncryptionKey = optionalSecret('GUEST_IDENTITY_ENCRYPTION_KEY', 32);
const guestIdentityRetentionConfigured = read('GUEST_IDENTITY_RETENTION_DAYS') !== undefined;
const turnstileTestSecrets = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

export const env = Object.freeze({
  nodeEnv,
  isProduction,
  port: integer('PORT', 3000, 1, 65_535),
  logLevel: oneOf('LOG_LEVEL', LOG_LEVELS, 'info'),

  /** Brand name used in emails and payment descriptions. */
  siteName: string('SITE_NAME', 'VN Booking Hub'),
  /** Public base URL of the website; links in emails point here. */
  siteUrl: origin('SITE_URL', isProduction),
  /** The business's time zone. Defines "today", night dates and the database session zone. */
  timezone: timezone('BUSINESS_TIMEZONE', 'Asia/Ho_Chi_Minh'),

  /**
   * Number of reverse proxies (load balancer, CDN) in front of the app. Express uses it to
   * find the real client IP in `X-Forwarded-For`, which the rate limiter keys on.
   * 0 = the app is exposed directly. Setting it higher than reality lets clients spoof their IP.
   */
  // Render injects RENDER=true. Its requests pass Cloudflare (Render's edge), a load balancer and
  // a local proxy: 3 hops, measured in October 2026 (real IP seen, forged X-Forwarded-For ignored).
  // Keep local/direct-host traffic at 0 unless an explicit proxy count is configured.
  trustProxyHops,

  /** Browser origins allowed to call the API. Empty = only SITE_URL. */
  corsOrigins: origins('CORS_ORIGINS', isProduction),

  /**
   * Shared secret the website's server sends as `X-Internal-Key` when it renders pages, so its
   * requests are not rate limited as if they came from one very busy visitor. Optional.
   */
  internalApiKey: optionalSecret('INTERNAL_API_KEY', 32),

  /** Run background jobs (email sending, payment reconciliation, hold expiry) in this process. */
  jobsEnabled,

  /**
   * Cloudflare Turnstile secret. When set, public forms (booking, lookup, contact, admin login)
   * must carry a solved CAPTCHA in `X-Captcha-Token`. The website needs the matching site key.
   */
  captchaSecret,

  /**
   * Load shedding: while the event loop lags more than this many milliseconds, API requests get
   * 503 + Retry-After instead of queueing up and timing out. 0 disables it.
   */
  overloadLagMs: integer('OVERLOAD_LAG_MS', 300, 0, 10_000),

  db: Object.freeze({
    url: url('DATABASE_URL', false),
    /** Maximum open connections per app instance. Keep instances × poolMax below the DB's max_connections. */
    poolMax: integer('DB_POOL_MAX', 10, 1, 100),
    /** Queries running longer than this are cancelled by Postgres, so slow queries cannot pile up. */
    statementTimeoutMs: integer('DB_STATEMENT_TIMEOUT_MS', 5_000, 100, 300_000),
    /** Enable TLS for managed databases (Neon, RDS, Supabase, …). */
    ssl: dbSsl,
  }),

  rateLimit: Object.freeze({
    windowMs: integer('RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000),
    /** Requests of any method, per client IP, per window. */
    max: integer('RATE_LIMIT_MAX', 120, 1, 100_000),
    /** Additional cap on state-changing requests (POST/PUT/PATCH/DELETE), per client IP, per window. */
    writeMax: integer('RATE_LIMIT_WRITE_MAX', 10, 1, 100_000),
  }),

  booking: Object.freeze({
    /**
     * How long an unpaid booking holds its dates while the guest transfers and sends the
     * screenshot. Once reported, the dates stay held until the owner verifies or rejects.
     */
    holdMinutes: integer('BOOKING_HOLD_MINUTES', 180, 10, 24 * 60),
    /** Signs the per-booking access tokens guests use to view and pay their booking. */
    tokenSecret: secret('BOOKING_TOKEN_SECRET', 32),
    /** A leaked guest access token stops opening its booking after this many days. */
    accessTokenDays: integer('BOOKING_ACCESS_TOKEN_DAYS', 30, 1, 365),
    /** AES-256-GCM key material for temporary-stay identity documents. */
    identityEncryptionKey:
      guestIdentityEncryptionKey ?? 'development-only-guest-identity-key-change-before-production',
    /** Delete encrypted identity documents this many days after the scheduled check-out. */
    identityRetentionDays: integer('GUEST_IDENTITY_RETENTION_DAYS', 35, 1, 365),
  }),

  admin: Object.freeze({
    /** Longest an admin login lasts, however active. */
    sessionHours: integer('ADMIN_SESSION_HOURS', 12, 1, 24 * 30),
    /** An admin login ends after this long without any request (a phone left signed in). */
    idleMinutes: integer('ADMIN_IDLE_MINUTES', 120, 5, 24 * 60),
  }),

  email: Object.freeze({
    /** Resend API key. Without it (development only) emails are written to the log instead. */
    resendApiKey,
    /** Sender, e.g. "VN Booking Hub <datphong@example.com>"; the domain must be verified in Resend. */
    from: requiredString('EMAIL_FROM'),
    /** Where new-booking, payment and contact-form alerts go. */
    ownerAddress: requiredString('OWNER_EMAIL'),
  }),

  /**
   * The account guests transfer to. The site shows a VietQR code with the amount and booking
   * reference filled in; the owner confirms each transfer in the admin area.
   */
  bank: Object.freeze({
    /** NAPAS bank identification number, e.g. 970436 = Vietcombank. */
    bin: bankBin('BANK_BIN'),
    /** Shown to guests, e.g. "Vietcombank". */
    name: requiredString('BANK_NAME'),
    accountNumber: accountNumber('BANK_ACCOUNT_NUMBER'),
    /** Account holder as printed by the bank, e.g. "DO HOANG HAI". */
    accountName: requiredString('BANK_ACCOUNT_NAME'),
  }),
});

if (isProduction) {
  if (!resendApiKey) problems.push('RESEND_API_KEY is required in production');
  if (!captchaSecret) problems.push('TURNSTILE_SECRET_KEY is required in production');
  if (captchaSecret && turnstileTestSecrets.has(captchaSecret)) {
    problems.push('TURNSTILE_SECRET_KEY is a Cloudflare test key; use a real widget secret in production');
  }
  if (!dbSsl) problems.push('DB_SSL must be true in production');
  if (!trustProxyConfigured) problems.push('TRUST_PROXY_HOPS must be set explicitly in production');
  if (!jobsEnabled) problems.push('JOBS_ENABLED must be true in production so retention and delivery jobs run');
  if (!guestIdentityEncryptionKey) problems.push('GUEST_IDENTITY_ENCRYPTION_KEY is required in production');
  if (!guestIdentityRetentionConfigured) problems.push('GUEST_IDENTITY_RETENTION_DAYS is required in production');
}

if (problems.length > 0) {
  // The logger depends on this module, so report configuration errors directly.
  console.error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
