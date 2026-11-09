import { Request, Response } from 'express';
import { envConfig } from '../config/env.js';
import { getFirebaseAdminDiagnostics } from '../config/firebase-admin.js';
import { HealthApiResponse } from '../types/auth.types.js';

/**
 * GET /api/health
 * Public health endpoint (no authentication required).
 * Reports honest runtime and Firebase Admin SDK credential validation status
 * without exposing secrets, private keys, or stack traces.
 */
export async function getHealthStatus(_req: Request, res: Response): Promise<void> {
  const firebaseDiagnostics = await getFirebaseAdminDiagnostics();

  const response: HealthApiResponse = {
    status: 'ok',
    service: 'linisgo-finder-private-api',
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      environment: envConfig.nodeEnv,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    firebaseAdmin: {
      projectId: firebaseDiagnostics.projectId,
      sdkInitialized: firebaseDiagnostics.sdkInitialized,
      credentialsAvailable: firebaseDiagnostics.credentialsAvailable,
      connectionValidated: firebaseDiagnostics.connectionValidated,
      status: firebaseDiagnostics.status,
      message: firebaseDiagnostics.message,
    },
  };

  res.status(200).json(response);
}
