/**
 * Gives every request an ID and writes one access-log line when the response finishes.
 *
 * The ID is returned in the `X-Request-Id` header and attached to error logs, so a user's
 * bug report ("request abc-123 failed") can be traced to the exact log entries.
 * Query strings are left out of the log because they can carry personal data.
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

declare global {
  namespace Express {
    interface Locals {
      requestId: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startedAt = performance.now();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    logger.info('HTTP request', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
      ip: req.ip,
    });
  });

  next();
}
