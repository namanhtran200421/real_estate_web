/**
 * The guest's transfer screenshot, prepared in the browser before upload.
 *
 * Phone screenshots are large PNGs. Redrawn as a JPEG no longer than 2000 px on either side,
 * they stay perfectly legible at a few hundred KB, upload quickly on mobile data, and lose any
 * metadata the original carried. The API accepts JPEG, PNG or WebP up to 5 MB (backend:
 * payments/transfer-screenshot.ts).
 */

/** Types the guest can pick; the API accepts the same. */
export const SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The API's limit. A file the browser cannot shrink is sent as it is only below this size. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Larger picks are refused without being read: no bank screenshot comes close. */
const MAX_PICKED_BYTES = 20 * 1024 * 1024;

const LONGEST_SIDE = 2000;
const JPEG_QUALITY = 0.85;

export type ScreenshotProblem = 'type' | 'size' | 'unreadable';

/** Why a picked file cannot be used; the page shows a message for each reason. */
export class ScreenshotError extends Error {
  constructor(readonly problem: ScreenshotProblem) {
    super(`Transfer screenshot refused: ${problem}`);
  }
}

/** The size an image is redrawn at: within 2000 px on its longest side, never enlarged. */
export function shrunkSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, LONGEST_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function redrawAsJpeg(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = shrunkSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  // JPEG has no transparency: a transparent PNG would otherwise turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
}

/**
 * The image to upload for a picked file.
 * @throws ScreenshotError when the file is not a usable image
 */
export async function prepareScreenshot(file: File): Promise<Blob> {
  if (!SCREENSHOT_TYPES.includes(file.type)) throw new ScreenshotError('type');
  if (file.size > MAX_PICKED_BYTES) throw new ScreenshotError('size');

  let shrunk: Blob | null;
  try {
    shrunk = await redrawAsJpeg(file);
  } catch {
    // Not an image this browser can open: the owner could not look at it either.
    throw new ScreenshotError('unreadable');
  }
  if (shrunk && shrunk.size > 0 && shrunk.size <= MAX_UPLOAD_BYTES) return shrunk;
  // No canvas to redraw on: the original will do if the API takes it.
  if (file.size <= MAX_UPLOAD_BYTES) return file;
  throw new ScreenshotError('size');
}
