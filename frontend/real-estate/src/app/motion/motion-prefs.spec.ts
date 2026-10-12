import { MOTION_QUERIES, matches } from './motion-prefs';

describe('matches', () => {
  it('asks the browser with the named query', () => {
    const asked: string[] = [];
    const win = { matchMedia: (q: string) => { asked.push(q); return { matches: q.includes('pointer: fine') } as MediaQueryList; } };
    expect(matches('desktop', win)).toBe(true);
    expect(matches('stackTour', win)).toBe(false);
    expect(asked).toEqual([MOTION_QUERIES.desktop, MOTION_QUERIES.stackTour]);
  });

  it('never allows motion without no-preference', () => {
    for (const query of Object.values(MOTION_QUERIES)) expect(query).toContain('(prefers-reduced-motion: no-preference)');
  });
});
