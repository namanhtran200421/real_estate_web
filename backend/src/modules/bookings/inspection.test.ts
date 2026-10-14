import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checklistFor, DEFAULT_INSPECTION_CHECKLIST, depositRefundPlan } from './inspection.js';

describe('checklistFor', () => {
  it('falls back to the default checklist when the apartment has none', () => {
    assert.deepEqual(checklistFor({ inspectionChecklist: [] }), DEFAULT_INSPECTION_CHECKLIST);
  });

  it("returns the apartment's own checklist as is", () => {
    const custom = [{ room: 'Bếp', items: ['Tủ lạnh'] }];
    assert.deepEqual(checklistFor({ inspectionChecklist: custom }), custom);
  });
});

describe('depositRefundPlan', () => {
  it('refunds the largest refundable payment first', () => {
    const plan = depositRefundPlan(
      [
        { id: 'a', refundable: 500_000 },
        { id: 'b', refundable: 600_000 },
      ],
      900_000,
    );
    assert.deepEqual(plan, [
      { paymentId: 'b', amount: 600_000 },
      { paymentId: 'a', amount: 300_000 },
    ]);
  });

  it('plans nothing when nothing is held', () => {
    assert.deepEqual(depositRefundPlan([{ id: 'a', refundable: 500_000 }], 0), []);
  });

  it('never exceeds what a payment can still refund, even when more is held', () => {
    const plan = depositRefundPlan([{ id: 'a', refundable: 500_000 }, { id: 'b', refundable: 0 }], 900_000);
    assert.deepEqual(plan, [{ paymentId: 'a', amount: 500_000 }]);
  });
});
