import { Request, Response } from 'express';
import { envConfig } from '../config/env.js';
import { getFirebaseAdminDiagnostics } from '../config/firebase-admin.js';
import { HealthApiResponse } from '../types/auth.types.js';

/**
 * GET /api/health
 * Public health endpoint (no authentication required).
 * Reports all 7 API readiness capabilities separately without exposing secrets.
 */
export async function getHealthStatus(_req: Request, res: Response): Promise<void> {
  const diag = await getFirebaseAdminDiagnostics();

  const response: HealthApiResponse = {
    status: 'ok',
    service: 'linisgo-finder-private-api',
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      environment: envConfig.nodeEnv,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    capabilities: {
      apiServerReachable: true,
      firebaseProjectIdConfigured: diag.firebaseProjectIdConfigured,
      publicSigningKeysAccessible: diag.publicSigningKeysAccessible,
      basicIdTokenVerification: diag.basicIdTokenVerification,
      tokenRevocationChecking: diag.tokenRevocationChecking,
      privilegedFirebaseAdminAccess: diag.privilegedFirebaseAdminAccess,
      firestoreServerOperations: diag.firestoreServerOperations,
    },
    firebaseAdmin: {
      projectId: diag.projectId,
      databaseId: diag.databaseId,
      location: diag.location,
      edition: diag.edition,
      mode: diag.mode,
      sdkInitialized: diag.sdkInitialized,
      publicSigningKeysAccessible: diag.publicSigningKeysAccessible,
      basicIdTokenVerification: diag.basicIdTokenVerification,
      tokenRevocationChecking: diag.tokenRevocationChecking,
      privilegedAdminAccess: diag.privilegedFirebaseAdminAccess,
      firestoreServerOperations: diag.firestoreServerOperations,
      firestoreReadProbeErrorCode: diag.firestoreReadProbeErrorCode,
      credentialsAvailable: diag.credentialsAvailable,
      connectionValidated: diag.connectionValidated,
      status: diag.status,
      message: diag.message,
    },
    firebaseWebSdk: {
      projectId: 'linisgo-mobile',
      authDomain: 'linisgo-mobile.firebaseapp.com',
      appId: '1:932812492190:web:20c4c8982f8c6adfa5da8f',
      storageBucket: 'linisgo-mobile.firebasestorage.app',
      messagingSenderId: '932812492190',
      apiKeyConfigured: Boolean(envConfig.firebaseWebApiKey),
      ...(envConfig.firebaseWebApiKey ? { apiKey: envConfig.firebaseWebApiKey } : {}),
    },
  };

  res.status(200).json(response);
}
