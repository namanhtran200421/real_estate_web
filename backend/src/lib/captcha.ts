/**
 * Cloudflare Turnstile CAPTCHA verification
 * (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
 *
 * The widget on the website produces a single-use token, valid for 5 minutes. The server checks
 * it with Cloudflare before accepting the form, so every protected request costs a bot one
 * solved challenge, however many IP addresses it rotates through.
 */
import { postJson } from './http-client.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5_000;

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

export interface CaptchaResult {
  success: boolean;
  /** Cloudflare's reasons, e.g. "timeout-or-duplicate", "invalid-input-secret". */
  errorCodes: string[];
}

/** @throws UpstreamError when Cloudflare cannot be reached */
export async function verifyCaptcha(secret: string, token: string, ip: string | undefined): Promise<CaptchaResult> {
  const result = await postJson<SiteverifyResponse>(
    SITEVERIFY_URL,
    { secret, response: token, remoteip: ip },
    { timeoutMs: TIMEOUT_MS },
  );
  return { success: result.success === true, errorCodes: result['error-codes'] ?? [] };
}
