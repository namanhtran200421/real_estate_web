/**
 * Resizes the apartment photos in public/apartments to WebP, once per width in
 * src/app/image-widths.json, into public/optimized/apartments (01.jpg → 01-640.webp, …).
 * The image loader (src/app/image-loader.ts) points <img srcset> at these files, so a
 * thumbnail downloads ~20 KB instead of the full-size photo.
 *
 * Runs automatically before `npm start`, `npm run build` and `npm run watch`.
 * Files that are already newer than their photo are skipped.
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import widths from '../src/app/image-widths.json' with { type: 'json' };

const SOURCE = 'public/apartments';
const OUTPUT = 'public/optimized/apartments';
const PHOTO = /\.(jpe?g|png)$/i;

let written = 0;
for (const entry of await readdir(SOURCE, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !PHOTO.test(entry.name)) continue;
  const source = join(entry.parentPath, entry.name);
  const base = join(OUTPUT, relative(SOURCE, source)).replace(PHOTO, '');
  const { mtimeMs } = await stat(source);

  const stale = [];
  for (const width of widths) {
    const target = `${base}-${width}.webp`;
    const existing = await stat(target).catch(() => null);
    if (!existing || existing.mtimeMs < mtimeMs) stale.push({ width, target });
  }
  if (!stale.length) continue;

  await mkdir(dirname(base), { recursive: true });
  // Decode once; the EXIF rotation is applied up front because the metadata is dropped.
  const image = sharp(source).autoOrient();
  await Promise.all(
    stale.map(({ width, target }) =>
      image.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toFile(target),
    ),
  );
  written += stale.length;
}

console.log(`Optimized images: ${written} written to ${OUTPUT}`);
