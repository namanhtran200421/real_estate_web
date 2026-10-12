/**
 * Reads the text in an image (OCR) with Tesseract, on this server: images go nowhere else.
 *
 * One Tesseract worker thread starts on first use and is reused (starting one takes a few hundred
 * milliseconds); it stops after 10 idle minutes to give back its memory (about 100 MB). Reads take turns, because a
 * worker handles one image at a time. The Vietnamese model (which reads Latin text and digits too)
 * ships in node_modules (@tesseract.js-data/vie), so nothing is downloaded at run time and nothing
 * is cached to disk.
 *
 * Reading is best effort: on any failure, or after 15 seconds, it gives up and returns undefined.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import Tesseract from 'tesseract.js';
import { logger } from './logger.js';

const READ_TIMEOUT_MS = 15_000;
const IDLE_STOP_MS = 10 * 60_000;

const require = createRequire(import.meta.url);

let worker: Promise<Tesseract.Worker> | undefined;
let idleTimer: NodeJS.Timeout | undefined;
let turn: Promise<unknown> = Promise.resolve();

/** The "best_int" model: integer-quantised LSTM, smaller and faster than "best" at similar accuracy. */
const VIETNAMESE_MODEL_DIR = path.join(path.dirname(require.resolve('@tesseract.js-data/vie/package.json')), '4.0.0_best_int');

function startWorker(): Promise<Tesseract.Worker> {
  return Tesseract.createWorker('vie', Tesseract.OEM.LSTM_ONLY, {
    langPath: VIETNAMESE_MODEL_DIR,
    cacheMethod: 'none',
    // Without a handler, Tesseract throws a failed read (any unreadable image) from an event
    // handler, which would crash the process; with one, the failure only rejects the read.
    errorHandler: () => {},
  });
}

/** Stops the worker (when idle, after a failure, and on shutdown); the next read starts a new one. */
export async function stopImageTextReader(): Promise<void> {
  clearTimeout(idleTimer);
  const current = worker;
  worker = undefined;
  if (!current) return;
  try {
    await (await current).terminate();
  } catch {
    // It never started, or has stopped already.
  }
}

async function readNow(image: Buffer): Promise<string | undefined> {
  clearTimeout(idleTimer);
  let timeout: NodeJS.Timeout | undefined;
  try {
    worker ??= startWorker();
    const reader = await worker;
    const result = await Promise.race([
      reader.recognize(image),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`OCR took longer than ${READ_TIMEOUT_MS} ms`)), READ_TIMEOUT_MS);
      }),
    ]);
    return result.data.text;
  } catch (error) {
    logger.warn('Could not read the text in an image', { error });
    // A worker that failed or got stuck is replaced on the next read.
    await stopImageTextReader();
    return undefined;
  } finally {
    clearTimeout(timeout);
    idleTimer = setTimeout(() => void stopImageTextReader(), IDLE_STOP_MS);
    idleTimer.unref();
  }
}

/** The text in a JPEG, PNG or WebP image, or undefined when it could not be read. */
export function readImageText(image: Buffer): Promise<string | undefined> {
  const read = turn.then(() => readNow(image));
  turn = read;
  return read;
}
