import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canReview } from './review.rules.js';

describe('guest review eligibility', () => {
  it('allows a completed stay after checkout', () => {
    assert.equal(canReview('completed', '2026-09-27', '2026-09-28'), true);
  });

  it('rejects bookings that have not completed or have future checkout', () => {
    for (const status of ['pending', 'confirmed', 'cancelled', 'expired'] as const) {
      assert.equal(canReview(status, '2026-09-27', '2026-09-28'), false);
    }
    assert.equal(canReview('completed', '2026-09-29', '2026-09-28'), false);
  });
});
