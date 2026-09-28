/**
 * Security middleware: HTTP hardening headers, CORS and rate limiting.
 *
 * This is the application's share of abuse / DDoS protection. It stops a single client
 * from exhausting the API, but it cannot absorb a volumetric attack: that must be handled
 * in front of the app (Cloudflare, AWS Shield/WAF, Vercel firewall, …). See README.md,
 * "Security & DDoS mitigation", for the full picture including server timeouts and limits.
 */
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { rateLimit, type Options } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { safeEqual } from '../lib/crypto.js';
import { HttpError } from '../lib/http-error.js';

/**
 * Sets protective response headers (HSTS, X-Content-Type-Options, a strict
 * Content-Security-Policy, frame blocking, …) and removes `X-Powered-By`.
 * The API only serves JSON, so helmet's strict defaults need no loosening.
 */
export const securityHeaders = helmet();

const configuredOrigins = new Set([
  env.siteUrl,
  ...env.corsOrigins,
  'https://real-estate-web-one-gamma.vercel.app',
  'https://real-estate-web-hobby213123213.vercel.app',
  'https://real-estate-web-git-main-hobby213123213.vercel.app',
]);

// Each production deploy gets a new URL under this project and Vercel team.
const vercelDeploymentOrigin = /^https:\/\/real-estate-[a-z0-9]+-hobby213123213\.vercel\.app$/;

/**
 * Lets only the website's origin(s) call the API from a browser.
 * Server-to-server calls (Angular SSR) send no Origin header and are unaffected.
 */
export const corsPolicy = cors({
  origin: (origin, callback) => {
    const allowed = !origin || configuredOrigins.has(origin) || vercelDeploymentOrigin.test(origin);
    callback(null, allowed);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Booking-Token', 'X-Captcha-Token'],
  exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  // Browsers cache the preflight response, saving one OPTIONS round trip per request.
  maxAge: 600,
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The website's own server renders pages by calling this API, so all of its requests come
 * from a handful of server IPs. It proves itself with `X-Internal-Key` and is exempt from
 * per-IP limits; without INTERNAL_API_KEY configured, nobody is exempt.
 */
function isInternalRequest(req: Request): boolean {
  const key = req.get('X-Internal-Key');
  if (!env.internalApiKey || !key) return false;
  return safeEqual(key, env.internalApiKey);
}

/** Admin requests are authenticated (and audited), so the anonymous write cap does not apply. */
function isAdminRequest(req: Request): boolean {
  return req.path.startsWith('/v1/admin/') && req.path !== '/v1/admin/auth/login';
}

function tooManyRequests(message: string) {
  return { error: { code: 'TOO_MANY_REQUESTS', message } };
}

/**
 * Counters are kept in process memory, which is correct for a single instance. When running
 * several instances, plug in a shared store (e.g. `rate-limit-redis`) so limits are global.
 */
function limiter(options: Partial<Options>) {
  return rateLimit({ standardHeaders: 'draft-8', legacyHeaders: false, ...options });
}

/**
 * Per-IP limit on all API requests. Clients over the limit get 429 with a `Retry-After`
 * header and standard `RateLimit` headers so well-behaved clients can back off.
 */
export const apiRateLimiter = limiter({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  skip: isInternalRequest,
  message: tooManyRequests('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.'),
});

/**
 * Stricter per-IP limit on anonymous state-changing requests (bookings, transfer reports,
 * contact form), which are more expensive and the usual target of spam. Reads skip it.
 */
export const writeRateLimiter = limiter({
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.writeMax,
  skip: (req) => SAFE_METHODS.has(req.method) || isInternalRequest(req) || isAdminRequest(req),
  message: tooManyRequests('Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau ít phút.'),
});

/** Admin login: slows password guessing to 10 failed attempts per IP per 15 minutes. */
export const loginRateLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: tooManyRequests('Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút.'),
});

/**
 * Admin login, per account: stops guessing one account's password from many IPs. Runs after the
 * CAPTCHA, so only attempts with a solved challenge count and strangers cannot cheaply lock the
 * owner out.
 */
export const loginAccountRateLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`,
  message: tooManyRequests('Tài khoản này đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút.'),
});

/** Booking lookup by reference + email/phone: stops enumeration of other guests' bookings. */
export const lookupRateLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: tooManyRequests('Bạn đã tra cứu quá nhiều lần, vui lòng thử lại sau 15 phút.'),
});

/**
 * Quotes that carry a promo code: the answer says whether a code exists, so guessing codes is
 * capped at 30 tries per IP per 15 minutes. Quotes without a code are not affected.
 */
export const promoCodeRateLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 30,
  skip: (req) => !req.query['promoCode'] || isInternalRequest(req),
  message: tooManyRequests('Bạn đã thử quá nhiều mã khuyến mãi, vui lòng thử lại sau 15 phút.'),
});

/** How often the event loop's delay is measured. */
const LAG_SAMPLE_MS = 500;

/**
 * Load shedding. Under a flood the event loop falls behind, every request slows down and they
 * all end up timing out. While the loop's delay stays above OVERLOAD_LAG_MS, API requests are
 * answered 503 + Retry-After at once, which keeps the process responsive and tells clients and
 * load balancers to back off. The delay is a moving average, so one slow tick does not trip it.
 */
function createOverloadGuard(thresholdMs: number) {
  let lagMs = 0;
  if (thresholdMs > 0) {
    let lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      const drift = Math.max(0, now - lastTick - LAG_SAMPLE_MS);
      lastTick = now;
      lagMs = lagMs / 2 + drift / 2;
    }, LAG_SAMPLE_MS).unref();
  }

  return (_req: Request, res: Response, next: NextFunction): void => {
    if (thresholdMs === 0 || lagMs <= thresholdMs) {
      next();
      return;
    }
    res.setHeader('Retry-After', '5');
    next(new HttpError(503, 'OVERLOADED', 'Hệ thống đang quá tải, vui lòng thử lại sau vài giây.'));
  };
}

export const overloadGuard = createOverloadGuard(env.overloadLagMs);
