import { layoutPlaces } from './route-map';

describe('layoutPlaces', () => {
  it('places every nearby spot inside the canvas, left and right alternately', () => {
    const points = layoutPlaces(7, 640, 420);
    expect(points).toHaveLength(7);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(600);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(390);
    }
    expect(points.map((p) => p.anchor)).toEqual(['start', 'end', 'start', 'end', 'start', 'end', 'start']);
  });

  it('keeps labels at least 44 px apart vertically on each side', () => {
    const points = layoutPlaces(7, 640, 420);
    for (const side of ['start', 'end']) {
      const ys = points.filter((p) => p.anchor === side).map((p) => p.y).sort((a, b) => a - b);
      ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeGreaterThanOrEqual(44));
    }
  });

  it('handles no places', () => {
    expect(layoutPlaces(0)).toEqual([]);
  });
});
