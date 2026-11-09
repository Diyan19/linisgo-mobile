import { Router } from 'express';
import { getHealthStatus } from '../controllers/health.controller.js';

export function createHealthRouter(): Router {
  const router = Router();
  router.get('/', getHealthStatus);
  return router;
}

export const healthRouter = createHealthRouter();
