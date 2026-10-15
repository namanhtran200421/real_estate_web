import { ageOn, holdCountdown } from './dates';

describe('holdCountdown', () => {
  it('shows the time left on a hold as h:mm:ss', () => {
    expect(holdCountdown(3 * 60 * 60 * 1000)).toBe('3:00:00');
    expect(holdCountdown((2 * 3600 + 59 * 60 + 41) * 1000)).toBe('2:59:41');
    expect(holdCountdown((5 * 60 + 51) * 1000 + 999)).toBe('0:05:51');
  });

  it('stops at zero once the hold has run out', () => {
    expect(holdCountdown(0)).toBe('0:00:00');
    expect(holdCountdown(-90_000)).toBe('0:00:00');
  });
});

describe('ageOn', () => {
  it('counts whole years, a year older on the birthday', () => {
    expect(ageOn('2012-11-01', '2026-10-31')).toBe(13);
    expect(ageOn('2012-11-01', '2026-11-01')).toBe(14);
  });

  it('makes someone born on 29/02 a year older on 01/03 in other years', () => {
    expect(ageOn('2012-02-29', '2026-02-28')).toBe(13);
    expect(ageOn('2012-02-29', '2026-03-01')).toBe(14);
  });
});
