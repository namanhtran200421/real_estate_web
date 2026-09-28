import { ImageLoaderConfig } from '@angular/common';
import imageWidths from './image-widths.json';

const UNSPLASH = 'https://images.unsplash.com/';
/** Photos in public/apartments, resized to WebP at build time by scripts/optimize-images.mjs. */
const LOCAL_PHOTO = /^\/?apartments\/(.+)\.(?:jpe?g|png)$/i;

/**
 * NgOptimizedImage loader: serves the smallest copy that covers the width the browser needs,
 * in a modern format (WebP/AVIF). Other sources are returned unchanged.
 */
export function imageLoader({ src, width, loaderParams }: ImageLoaderConfig): string {
  const local = LOCAL_PHOTO.exec(src);
  if (local) {
    const fit = imageWidths.find((w) => w >= (width ?? Infinity)) ?? imageWidths.at(-1);
    return `/optimized/apartments/${local[1]}-${fit}.webp`;
  }
  if (!src.startsWith(UNSPLASH)) return src;
  const url = new URL(src);
  // `loaderParams.ar` (e.g. '6:5') crops to a fixed aspect ratio; otherwise keep the original shape.
  const ar = loaderParams?.['ar'] as string | undefined;
  url.searchParams.set('auto', 'format');
  url.searchParams.set('fit', ar ? 'crop' : 'max');
  if (ar) url.searchParams.set('ar', ar);
  url.searchParams.set('q', '75');
  url.searchParams.set('w', String(width ?? 1600));
  return url.toString();
}

/** 1200×630 crop for Open Graph / Zalo / Facebook link previews. */
export function socialImage(src: string): string {
  if (!src.startsWith(UNSPLASH)) return src;
  const url = new URL(src);
  url.searchParams.set('auto', 'format');
  url.searchParams.set('fit', 'crop');
  url.searchParams.set('q', '75');
  url.searchParams.set('w', '1200');
  url.searchParams.set('h', '630');
  return url.toString();
}
