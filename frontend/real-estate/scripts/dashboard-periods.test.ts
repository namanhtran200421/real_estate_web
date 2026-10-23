import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveReport, reportLabel, reportStart, validReportDate } from '../src/app/admin/dashboard-period';

test('report navigation preserves Monday weeks, leap days and month/year boundaries', () => {
  assert.equal(reportStart('week', '2026-11-01'), '2026-10-26');
  assert.equal(reportStart('week', '2027-01-01'), '2026-12-28');
  assert.equal(moveReport('day', '2024-02-28', 1), '2024-02-29');
  assert.equal(moveReport('day', '2024-02-29', 1), '2024-03-01');
  assert.equal(moveReport('month', '2026-01-31', 1), '2026-02-01');
  assert.equal(moveReport('month', '2026-12-31', 1), '2027-01-01');
  assert.equal(moveReport('year', '2024-02-29', -1), '2023-01-01');
  assert.match(reportLabel('week', '2026-12-28'), /28\/12\/2026.*03\/01\/2027/);
});
test('report dates reject impossible dates and unsupported bounds', () => {
  for (const date of [null, '', '2026-02-29', '2026-02-30', '2026-13-01', '1999-12-31', '2101-01-01', '2026-2-1'])
    assert.equal(validReportDate(date), false);
  for (const date of ['2024-02-29', '2000-01-01', '2100-12-31']) assert.equal(validReportDate(date), true);
});
