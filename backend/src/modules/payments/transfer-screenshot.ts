/**
 * Transfer screenshots: the picture of a successful transfer a guest attaches when reporting it.
 *
 * The browser shrinks the image and sends its bytes as the request body. The type is read from
 * the bytes themselves, never from the Content-Type header, so only real JPEG, PNG and WebP
 * images are stored and later served to the owner.
 */
import type { Response } from 'express';
import { HttpError } from '../../lib/http-error.js';

/** Largest screenshot accepted. The website shrinks images to a few hundred KB before sending. */
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export type ScreenshotType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface TransferScreenshot {
  contentType: ScreenshotType;
  data: Buffer;
}

function startsWith(data: Buffer, signature: string, offset = 0): boolean {
  return data.subarray(offset, offset + signature.length).toString('latin1') === signature;
}

/** The image type from its first bytes (the format's signature). */
function detectType(data: Buffer): ScreenshotType | undefined {
  if (startsWith(data, '\xff\xd8\xff')) return 'image/jpeg';
  if (startsWith(data, '\x89PNG\r\n\x1a\n')) return 'image/png';
  if (startsWith(data, 'RIFF') && startsWith(data, 'WEBP', 8)) return 'image/webp';
  return undefined;
}

/** @param body the raw request body: a Buffer when an image was sent */
export function readTransferScreenshot(body: unknown): TransferScreenshot {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new HttpError(400, 'SCREENSHOT_REQUIRED', 'Vui lòng tải ảnh chuyển khoản thành công lên.');
  }
  const data = body;
  const contentType = detectType(data);
  if (!contentType) {
    throw new HttpError(415, 'SCREENSHOT_NOT_IMAGE', 'Ảnh chuyển khoản phải là ảnh PNG, JPG hoặc WebP.');
  }
  return { contentType, data };
}

/**
 * Answers with the image itself. It shows a guest's bank details, so no browser or proxy may keep
 * a copy, and its type is the one read from its bytes on upload.
 */
export function sendScreenshot(res: Response, screenshot: TransferScreenshot): void {
  res.setHeader('Content-Type', screenshot.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.send(screenshot.data);
}
