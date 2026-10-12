/**
 * Media queries for motion, shared by MotionService and gsap.matchMedia().
 * src/styles.css and src/index.html repeat them verbatim (CSS cannot import these): keep in sync.
 */
export const MOTION_QUERIES = {
  allowed: '(prefers-reduced-motion: no-preference)',
  desktop: '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px)',
  pinTour: '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px) and (min-height: 700px)',
  stackTour: '(prefers-reduced-motion: no-preference) and (max-width: 767px) and (min-height: 600px) and (orientation: portrait)',
} as const;

export type MotionQuery = keyof typeof MOTION_QUERIES;

export function matches(query: MotionQuery, win: Pick<Window, 'matchMedia'> = window): boolean {
  return win.matchMedia(MOTION_QUERIES[query]).matches;
}
