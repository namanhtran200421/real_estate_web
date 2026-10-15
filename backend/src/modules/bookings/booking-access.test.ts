import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { env } from '../../config/env.js';
import { accessTokenFor, assertAccess } from './booking-access.js';

describe('guest booking access tokens', () => {
  const issuedAt = Date.parse('2026-10-16T00:00:00Z');

  it('issues a fresh token each time and accepts it only for its booking', () => {
    const first = accessTokenFor('booking-a', issuedAt);
    const second = accessTokenFor('booking-a', issuedAt);

    assert.notEqual(first, second);
    assert.doesNotThrow(() => assertAccess('booking-a', first, issuedAt));
    assert.throws(() => assertAccess('booking-b', first, issuedAt), {
      status: 404,
    });
  });

  it('expires at the configured boundary and rejects old deterministic and malformed tokens', () => {
    const token = accessTokenFor('booking-a', issuedAt);
    const expiry = issuedAt + env.booking.accessTokenDays * 24 * 60 * 60 * 1_000;

    assert.doesNotThrow(() => assertAccess('booking-a', token, expiry - 1_000));
    assert.throws(() => assertAccess('booking-a', token, expiry), {
      status: 404,
    });
    assert.throws(() => assertAccess('booking-a', 'legacy-deterministic-token', issuedAt), { status: 404 });
    assert.throws(() => assertAccess('booking-a', 'v1.zzzzzzzzzz.bad.signature', issuedAt), { status: 404 });
  });
});
