export interface TransitionContext {
  fromPath: string;
  toPath: string;
  fromStory: boolean;
  toStory: boolean;
  reducedMotion: boolean;
}

/** Cross-page transitions only between two different story pages, and only with motion allowed. */
export function animateTransition(c: TransitionContext): boolean {
  return !c.reducedMotion && c.fromStory && c.toStory && c.fromPath !== c.toPath;
}
