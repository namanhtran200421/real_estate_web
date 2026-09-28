/**
 * Requires a solved CAPTCHA (Cloudflare Turnstile) in `X-Captcha-Token` on the public forms bots
 * abuse: bookings (calendar squatting), booking lookup (enumeration), contact (spam) and admin
 * login (password guessing). Rate limits slow one IP down; a CAPTCHA also stops botnets.
 *
 * Inactive until TURNSTILE_SECRET_KEY is set, so local development needs no Cloudflare account.
 * If Cloudflare cannot be reached the request is refused (fail closed) with a retryable 503.
 */
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { captchaHostnameAllowed, verifyCaptcha } from '../lib/captcha.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { configuredOrigins } from './security.js';

/** Turnstile tokens are at most 2048 characters. */
const MAX_TOKEN_LENGTH = 2_048;

/** Error codes that mean our configuration is wrong, not the visitor. */
const CONFIGURATION_ERRORS = new Set(['missing-input-secret', 'invalid-input-secret']);

export async function requireCaptcha(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = env.captchaSecret;
  if (!secret) {
    next();
    return;
  }

  const token = req.get('X-Captcha-Token');
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new HttpError(400, 'CAPTCHA_REQUIRED', 'Vui lòng xác nhận bạn không phải là robot.');
  }

  let result;
  try {
    result = await verifyCaptcha(secret, token, req.ip);
  } catch (error) {
    logger.error('CAPTCHA verification unavailable', { requestId: res.locals.requestId, error });
    throw new HttpError(503, 'CAPTCHA_UNAVAILABLE', 'Chưa kiểm tra được xác minh chống robot, vui lòng thử lại sau ít phút.');
  }

  if (!result.success || !captchaHostnameAllowed(result.hostname, [...configuredOrigins])) {
    const misconfigured = result.errorCodes.some((code) => CONFIGURATION_ERRORS.has(code));
    const log = misconfigured ? logger.error : logger.warn;
    log('CAPTCHA rejected', { requestId: res.locals.requestId, errorCodes: result.errorCodes, hostname: result.hostname });
    throw new HttpError(400, 'CAPTCHA_FAILED', 'Xác minh chống robot không hợp lệ hoặc đã hết hạn, vui lòng thử lại.');
  }
  next();
}
