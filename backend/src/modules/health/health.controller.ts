/**
 * Health probes for load balancers and orchestrators (Docker, Kubernetes, Railway, …).
 *
 * - Liveness: the process is running and can answer HTTP. Restart it if this fails.
 * - Readiness: the process can serve real traffic (database reachable). Stop routing
 *   requests to it while this fails, but do not restart it.
 *
 * Probes are public and not rate limited, so readiness reuses one database check for a couple
 * of seconds: flooding it never turns into database load.
 */
import type { Request, Response } from 'express';
import { pingDatabase } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

const READINESS_REUSE_MS = 2_000;

let lastCheck: { at: number; reachable: Promise<boolean> } | undefined;

function databaseReachable(): Promise<boolean> {
  const now = Date.now();
  if (lastCheck && now - lastCheck.at < READINESS_REUSE_MS) return lastCheck.reachable;

  const reachable = pingDatabase().then(
    () => true,
    (error: unknown) => {
      logger.warn('Readiness check failed', { error });
      return false;
    },
  );
  lastCheck = { at: now, reachable };
  return reachable;
}

/** GET /health */
function liveness(_req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok' });
}

/** GET /health/ready */
async function readiness(_req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (await databaseReachable()) {
    res.json({ status: 'ok', database: 'ok' });
    return;
  }
  res.status(503).json({ status: 'unavailable', database: 'unreachable' });
}

export const healthController = { liveness, readiness };
