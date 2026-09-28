/**
 * Health routes, mounted at `/health` outside `/api` so probes are never rate limited.
 */
import { Router } from 'express';
import { healthController } from './health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', healthController.liveness);
healthRouter.get('/ready', healthController.readiness);
