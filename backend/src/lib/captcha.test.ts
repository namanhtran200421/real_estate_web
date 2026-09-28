import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { captchaHostnameAllowed } from './captcha.js';

describe('captchaHostnameAllowed', () => {
  const origins = ['https://real-estate-web-one-gamma.vercel.app', 'https://booking.example.com'];

  it('accepts a token solved on a configured site', () => {
    assert.equal(captchaHostnameAllowed('real-estate-web-one-gamma.vercel.app', origins), true);
    assert.equal(captchaHostnameAllowed('booking.example.com', origins), true);
  });

  it('rejects a token solved on another site using the same widget', () => {
    assert.equal(captchaHostnameAllowed('other.example.com', origins), false);
    assert.equal(captchaHostnameAllowed('real-estate-web-one-gamma.vercel.app.attacker.test', origins), false);
  });

  it('fails closed when Cloudflare omits the hostname', () => {
    assert.equal(captchaHostnameAllowed(undefined, origins), false);
  });
});
