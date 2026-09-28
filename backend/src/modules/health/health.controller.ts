/**
 * Health probes for load balancers and orchestrators (Docker, Kubernetes, Railway, …).
 *
 * - Liveness: the process is running and can answer HTTP. Restart it if this fails.
 * - Readiness: the process can serve real traffic (database reachable). Stop routing
 *   requests to it while this fails, but do not restart it.
 */
import type { Request, Response } from 'express';
import { pingDatabase } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

/** GET /health */
function liveness(_req: Request, res: Response): void {
  res.json({ status: 'ok' });
}

/** GET /health/ready */
async function readiness(_req: Request, res: Response): Promise<void> {
  try {
    await pingDatabase();
    res.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    logger.warn('Readiness check failed', { error });
    res.status(503).json({ status: 'unavailable', database: 'unreachable' });
  }
}

export const healthController = { liveness, readiness };
