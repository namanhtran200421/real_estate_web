/**
 * Builds the Express application: middleware order, routes and error handling.
 * Kept separate from `server.ts` so the app can be mounted in tests without opening a port.
 *
 * Request pipeline (order matters):
 *   1. request logger      — ID + access log for every request, including rejected ones
 *   2. security headers    — helmet
 *   3. compression         — gzip/brotli for JSON responses over 1 kB
 *   4. /health             — probes, before rate limiting so they always answer
 *   5. /api:
 *        CORS → load shedding → rate limits → JSON body parser → cache invalidation → routers
 *      Rate limits run before body parsing, so blocked clients cost almost nothing.
 *   6. 404 + error handler — uniform JSON errors
 */
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { invalidateCaches } from './lib/cache.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRateLimiter, corsPolicy, overloadGuard, securityHeaders, writeRateLimiter } from './middleware/security.js';
import { healthRouter } from './modules/health/health.router.js';
import { apiRouter } from './routes.js';

/** Large enough for any form this site has; anything bigger is rejected with 413 before parsing. */
const JSON_BODY_LIMIT = '100kb';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Public reads are cached in memory (lib/cache.ts); any successful change drops the cache. */
function invalidateCachesOnWrite(req: Request, res: Response, next: NextFunction): void {
  if (!READ_METHODS.has(req.method)) {
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateCaches();
    });
  }
  next();
}

export function createApp(): express.Express {
  const app = express();

  // Resolve the real client IP from X-Forwarded-For only across our own proxies.
  app.set('trust proxy', env.trustProxyHops);

  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(compression({ threshold: 1024 }));

  app.use('/health', healthRouter);

  app.use(
    '/api',
    corsPolicy,
    overloadGuard,
    apiRateLimiter,
    writeRateLimiter,
    express.json({ limit: JSON_BODY_LIMIT }),
    invalidateCachesOnWrite,
    apiRouter,
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
