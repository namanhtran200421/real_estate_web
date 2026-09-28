/**
 * Final middleware: turns unmatched routes and thrown errors into JSON responses.
 *
 * Every error response has the same shape: `{ error: { code, message, details? } }`.
 * - HttpError (thrown by services/controllers) → its own status, code and message.
 * - Client errors raised by Express itself (malformed JSON, body too large, …) → their 4xx
 *   status with a generic message.
 * - Anything else is a bug → logged with the request ID, answered with a bare 500 so no
 *   stack traces or SQL details reach the client.
 */
import { STATUS_CODES } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

/** Shape of errors created by Express's body parsers (`http-errors`). */
interface ExposedClientError {
  status: number;
  expose: true;
}

function isExposedClientError(error: unknown): error is ExposedClientError {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as Partial<ExposedClientError>;
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
}

/** e.g. 413 → PAYLOAD_TOO_LARGE, "Payload Too Large" */
function fromStatus(status: number): HttpError {
  const reason = STATUS_CODES[status] ?? 'Bad Request';
  return new HttpError(status, reason.toUpperCase().replace(/\W+/g, '_'), reason);
}

function toHttpError(error: unknown): HttpError | undefined {
  if (error instanceof HttpError) return error;
  if (isExposedClientError(error)) return fromStatus(error.status);
  return undefined;
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(HttpError.notFound('Route not found'));
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  // The response is already streaming; let Express close the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  let httpError = toHttpError(error);
  if (!httpError) {
    logger.error('Unhandled error', {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      error,
    });
    httpError = fromStatus(500);
  }

  res.status(httpError.status).json({
    error: { code: httpError.code, message: httpError.message, details: httpError.details },
  });
}
