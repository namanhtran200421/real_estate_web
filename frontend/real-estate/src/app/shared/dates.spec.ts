import { holdCountdown } from './dates';

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
