import { ActivatedRouteSnapshot } from '@angular/router';

/** Route data for story pages (Tier 1): the only routes where the motion engine runs. */
export const STORY = { motion: true } as const;

export function isStoryRoute(route: ActivatedRouteSnapshot | null): boolean {
  let story = false;
  for (let current = route; current; current = current.firstChild) {
    if (current.data?.['motion'] === true) story = true;
  }
  return story;
}

/** "/book/payment" for a snapshot chain (query and fragment excluded). */
export function pathOf(route: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  for (let current: ActivatedRouteSnapshot | null = route; current; current = current.firstChild) {
    parts.push(...current.url.map((segment) => segment.path));
  }
  return `/${parts.join('/')}`;
}
