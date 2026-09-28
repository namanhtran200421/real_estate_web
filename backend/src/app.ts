/**
 * Builds the Express application: middleware order, routes and error handling.
 * Kept separate from `server.ts` so the app can be mounted in tests without opening a port.
 *
 * Request pipeline (order matters):
 *   1. request logger      — ID + access log for every request, including rejected ones
 *   2. security headers    — helmet
 *   3. /health             — probes, before rate limiting so they always answer
 *   4. /api:
 *        CORS → rate limits → JSON body parser → feature routers
 *      Rate limits run before body parsing, so blocked clients cost almost nothing.
 *   5. 404 + error handler — uniform JSON errors
 */
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRateLimiter, corsPolicy, securityHeaders, writeRateLimiter } from './middleware/security.js';
import { healthRouter } from './modules/health/health.router.js';
import { apiRouter } from './routes.js';

/** Large enough for any form this site has; anything bigger is rejected with 413 before parsing. */
const JSON_BODY_LIMIT = '100kb';

export function createApp(): express.Express {
  const app = express();

  // Resolve the real client IP from X-Forwarded-For only across our own proxies.
  app.set('trust proxy', env.trustProxyHops);

  app.use(requestLogger);
  app.use(securityHeaders);

  app.use('/health', healthRouter);

  app.use(
    '/api',
    corsPolicy,
    apiRateLimiter,
    writeRateLimiter,
    express.json({ limit: JSON_BODY_LIMIT }),
    apiRouter,
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
