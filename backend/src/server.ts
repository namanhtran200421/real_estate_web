/**
 * Process entry point: checks the database, starts the HTTP server and shuts down cleanly.
 *
 * Server timeouts are part of the DDoS mitigation: they stop slow or idle clients (e.g.
 * Slowloris, which trickles headers byte by byte) from holding sockets open indefinitely.
 *
 * Graceful shutdown: on SIGTERM/SIGINT (sent by Docker, Kubernetes, PaaS platforms on each
 * deploy) the server stops accepting connections, lets in-flight requests finish, then
 * closes the database pool. If that takes too long the process exits anyway.
 */
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool, pingDatabase } from './db/pool.js';
import { jobs } from './jobs/index.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';

/** Max time for a client to send all request headers. */
const HEADERS_TIMEOUT_MS = 10_000;
/** Max time for a client to send the whole request (headers + body). */
const REQUEST_TIMEOUT_MS = 30_000;
/** Idle keep-alive time; must exceed the load balancer's idle timeout (60 s on AWS ALB). */
const KEEP_ALIVE_TIMEOUT_MS = 65_000;
/** Rejects requests with an unreasonable number of headers. */
const MAX_HEADERS_COUNT = 100;
/** How long in-flight requests get to finish before the process is forced to exit. */
const SHUTDOWN_GRACE_MS = 10_000;

const server = createServer(createApp());
server.headersTimeout = HEADERS_TIMEOUT_MS;
server.requestTimeout = REQUEST_TIMEOUT_MS;
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.maxHeadersCount = MAX_HEADERS_COUNT;

let shuttingDown = false;

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { reason });

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();

  // Stop accepting new connections, and drop keep-alive sockets that are not mid-request.
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections();
  await Promise.all([closed, stopJobs()]);

  await closePool();
  logger.info('Shutdown complete');
  process.exit(exitCode);
}

process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
process.on('SIGINT', () => void shutdown('SIGINT', 0));

// A rejection nobody awaited means the process is in an unknown state: log it and restart cleanly.
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', { error });
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

try {
  // Fail fast on a wrong DATABASE_URL instead of answering every request with 500.
  await pingDatabase();
} catch (error) {
  logger.error('Cannot connect to the database', { error });
  await closePool();
  process.exit(1);
}

// e.g. EADDRINUSE when the port is taken.
server.on('error', (error) => {
  logger.error('HTTP server error', { error });
  void shutdown('serverError', 1);
});

/** Settings that production can run without, but only with weaker protection. */
function warnAboutWeakSettings(): void {
  if (!env.isProduction) return;
  if (!env.captchaSecret) {
    logger.warn('TURNSTILE_SECRET_KEY is not set: public forms accept requests without a CAPTCHA');
  }
  if (env.trustProxyHops === 0) {
    logger.warn('TRUST_PROXY_HOPS is 0: behind a proxy or CDN every visitor shares one rate-limit bucket');
  }
  if (!env.internalApiKey) {
    logger.warn('INTERNAL_API_KEY is not set: the website renderer is rate limited like one visitor');
  }
}

server.listen(env.port, () => {
  logger.info('Server listening', { port: env.port, env: env.nodeEnv });
  warnAboutWeakSettings();
  if (env.jobsEnabled) startJobs(jobs);
});
