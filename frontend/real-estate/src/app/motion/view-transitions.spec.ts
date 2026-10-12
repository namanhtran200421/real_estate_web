import { animateTransition } from './view-transitions';

const base = { fromPath: '/', toPath: '/apartment', fromStory: true, toStory: true, reducedMotion: false };

describe('animateTransition', () => {
  it('animates between two different story pages', () => {
    expect(animateTransition(base)).toBe(true);
  });
  it('never animates with reduced motion', () => {
    expect(animateTransition({ ...base, reducedMotion: true })).toBe(false);
  });
  it('never animates when the booking flow is involved', () => {
    expect(animateTransition({ ...base, toPath: '/book', toStory: false })).toBe(false);
    expect(animateTransition({ ...base, fromPath: '/book', fromStory: false })).toBe(false);
  });
  it('does not animate a change on the same page (#chapter, ?apt)', () => {
    expect(animateTransition({ ...base, toPath: '/' })).toBe(false);
  });
});
