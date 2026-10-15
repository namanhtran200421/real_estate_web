import { step } from './lightbox';

describe('lightbox step', () => {
  it('moves forward and back, wrapping at the ends', () => {
    expect(step(0, 1, 16)).toBe(1);
    expect(step(15, 1, 16)).toBe(0);
    expect(step(0, -1, 16)).toBe(15);
  });
  it('stays put with a single photo', () => {
    expect(step(0, 1, 1)).toBe(0);
  });
});
