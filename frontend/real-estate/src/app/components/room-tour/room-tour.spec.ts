import { scrollForChapter } from './room-tour';

describe('scrollForChapter', () => {
  it('maps a chapter position on the track to a page scroll position', () => {
    // Track shifts 0 → 3000 px while the page scrolls 1000 → 2500.
    expect(scrollForChapter(0, 3000, 1000, 2500)).toBe(1000);
    expect(scrollForChapter(1500, 3000, 1000, 2500)).toBe(1750);
    expect(scrollForChapter(3000, 3000, 1000, 2500)).toBe(2500);
  });

  it('clamps chapters beyond the end and handles a track that does not move', () => {
    expect(scrollForChapter(4200, 3000, 1000, 2500)).toBe(2500);
    expect(scrollForChapter(500, 0, 1000, 2500)).toBe(1000);
  });
});
