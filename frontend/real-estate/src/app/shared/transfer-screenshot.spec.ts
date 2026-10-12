import { shrunkSize } from './transfer-screenshot';

describe('shrunkSize', () => {
  it('fits a tall phone screenshot within 2000 px on its longest side, keeping its shape', () => {
    // iPhone 15 Pro screenshot
    expect(shrunkSize(1179, 2556)).toEqual({ width: 923, height: 2000 });
  });

  it('fits a wide image by its width', () => {
    expect(shrunkSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
  });

  it('never enlarges a small image', () => {
    expect(shrunkSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
  });
});
