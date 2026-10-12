import { routes } from '../app.routes';
import { isStoryRoute, pathOf, STORY } from './motion-routes';
import { ActivatedRouteSnapshot } from '@angular/router';

function snapshot(chain: { path: string; data?: Record<string, unknown> }[]): ActivatedRouteSnapshot {
  let child: ActivatedRouteSnapshot | null = null;
  for (const level of [...chain].reverse()) {
    child = { url: level.path ? level.path.split('/').map((path) => ({ path })) : [], data: level.data ?? {}, firstChild: child } as unknown as ActivatedRouteSnapshot;
  }
  return child!;
}

describe('story routes', () => {
  it('marks exactly the five story pages', () => {
    const story = routes.filter((r) => r.data?.['motion'] === true).map((r) => r.path);
    expect(story.sort()).toEqual(['', 'about', 'apartment', 'gallery', 'location']);
  });

  it('finds the story flag on the deepest matched route', () => {
    expect(isStoryRoute(snapshot([{ path: '' }, { path: 'gallery', data: STORY }]))).toBe(true);
    expect(isStoryRoute(snapshot([{ path: '' }, { path: 'book' }]))).toBe(false);
    expect(isStoryRoute(null)).toBe(false);
  });

  it('builds the full path of a snapshot chain', () => {
    expect(pathOf(snapshot([{ path: '' }, { path: 'book/payment' }]))).toBe('/book/payment');
    expect(pathOf(snapshot([{ path: '' }]))).toBe('/');
  });
});
