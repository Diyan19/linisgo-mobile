import fs from 'node:fs';
import { App, applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { envConfig } from './env.js';

/**
 * Revoked/exposed service account key identifier from earlier history.
 * Strictly forbidden from ever being loaded or accepted.
 */
const FORBIDDEN_KEY_IDENTIFIER = 'db6ff4441b';

export interface FirebaseAdminDiagnostics {
  projectId: string;
  sdkInitialized: boolean;
  credentialsAvailable: boolean;
  connectionValidated: boolean;
  status: 'connected' | 'blocked_missing_credentials' | 'error';
  message: string;
}

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let cachedDiagnostics: FirebaseAdminDiagnostics | null = null;
let lastDiagnosticsTimestamp = 0;
const DIAGNOSTICS_CACHE_TTL_MS = 60_000;

/**
 * Inspects optional GOOGLE_APPLICATION_CREDENTIALS if set, or falls back to
 * Application Default Credentials (ADC). Never requires users to paste private keys.
 */
function inspectExplicitCredentialFile(): {
  explicitFileProvided: boolean;
  validExplicitFile: boolean;
  errorReason: string | null;
} {
  const gacPath = (process.env['GOOGLE_APPLICATION_CREDENTIALS'] || '').trim();

  // GOOGLE_APPLICATION_CREDENTIALS is optional; when empty, ADC will be checked
  if (!gacPath) {
    return {
      explicitFileProvided: false,
      validExplicitFile: false,
      errorReason: null,
    };
  }

  if (gacPath.includes(FORBIDDEN_KEY_IDENTIFIER)) {
    return {
      explicitFileProvided: true,
      validExplicitFile: false,
      errorReason:
        'Rejected previously exposed service-account key path. Never reuse exposed credentials.',
    };
  }

  if (!fs.existsSync(gacPath)) {
    return {
      explicitFileProvided: true,
      validExplicitFile: false,
      errorReason: 'GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist.',
    };
  }

  try {
    const raw = fs.readFileSync(gacPath, 'utf8');
    if (raw.includes(FORBIDDEN_KEY_IDENTIFIER)) {
      return {
        explicitFileProvided: true,
        validExplicitFile: false,
        errorReason:
          'Rejected previously exposed service-account key ID. Never reuse exposed credentials.',
      };
    }
    const parsed = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (
      parsed.project_id === envConfig.firebaseProjectId &&
      Boolean(parsed.client_email) &&
      Boolean(parsed.private_key)
    ) {
      return {
        explicitFileProvided: true,
        validExplicitFile: true,
        errorReason: null,
      };
    }
    return {
      explicitFileProvided: true,
      validExplicitFile: false,
      errorReason: `GOOGLE_APPLICATION_CREDENTIALS project_id does not match "${envConfig.firebaseProjectId}".`,
    };
  } catch {
    return {
      explicitFileProvided: true,
      validExplicitFile: false,
      errorReason: 'GOOGLE_APPLICATION_CREDENTIALS file could not be parsed as valid JSON.',
    };
  }
}

/**
 * Initializes the Firebase Admin SDK once on the backend for project `linisgo-mobile`.
 * Prefers Application Default Credentials (ADC) automatically when GOOGLE_APPLICATION_CREDENTIALS
 * is omitted or valid.
 */
export function getOrInitializeFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  if (getApps().length > 0) {
    adminApp = getApp();
    return adminApp;
  }

  const fileCheck = inspectExplicitCredentialFile();
  if (fileCheck.explicitFileProvided && !fileCheck.validExplicitFile) {
    // Explicit GOOGLE_APPLICATION_CREDENTIALS was set but invalid/forbidden;
    // initialize with projectId only so we do not load an invalid/forbidden file.
    adminApp = initializeApp({
      projectId: envConfig.firebaseProjectId,
    });
    return adminApp;
  }

  try {
    adminApp = initializeApp({
      credential: applicationDefault(),
      projectId: envConfig.firebaseProjectId,
    });
  } catch {
    adminApp = initializeApp({
      projectId: envConfig.firebaseProjectId,
    });
  }

  return adminApp;
}

export function getFirebaseAdminAuth(): Auth {
  if (adminAuth) {
    return adminAuth;
  }
  const app = getOrInitializeFirebaseAdminApp();
  adminAuth = getAuth(app);
  return adminAuth;
}

/**
 * Actively checks whether the backend runtime has a trusted service identity
 * authorized for Firebase project `linisgo-mobile`.
 *
 * How validation works:
 * 1. If an invalid/forbidden GOOGLE_APPLICATION_CREDENTIALS path was set, reports BLOCKED.
 * 2. Otherwise checks Application Default Credentials (ADC) and probes Firebase Auth
 *    (`getUser('__linisgo_probe__')`) for project `linisgo-mobile`.
 * 3. If the probe returns `auth/user-not-found`, the service identity is genuinely authorized
 *    for `linisgo-mobile` -> reports `status: 'connected'`.
 * 4. If the ambient container identity belongs to a different host project (e.g., AI Studio host
 *    project 332623356276) or lacks IAM permission for `linisgo-mobile`, reports
 *    `status: 'blocked_missing_credentials'` so Firebase Admin auth is never faked.
 */
export async function getFirebaseAdminDiagnostics(): Promise<FirebaseAdminDiagnostics> {
  const now = Date.now();
  if (cachedDiagnostics && now - lastDiagnosticsTimestamp < DIAGNOSTICS_CACHE_TTL_MS) {
    return cachedDiagnostics;
  }

  const fileCheck = inspectExplicitCredentialFile();
  const app = getOrInitializeFirebaseAdminApp();

  if (fileCheck.explicitFileProvided && !fileCheck.validExplicitFile) {
    cachedDiagnostics = {
      projectId: envConfig.firebaseProjectId,
      sdkInitialized: Boolean(app),
      credentialsAvailable: false,
      connectionValidated: false,
      status: 'blocked_missing_credentials',
      message:
        fileCheck.errorReason ||
        'Explicit GOOGLE_APPLICATION_CREDENTIALS is invalid. Firebase Admin authentication is BLOCKED.',
    };
    lastDiagnosticsTimestamp = now;
    return cachedDiagnostics;
  }

  try {
    const auth = getFirebaseAdminAuth();
    await auth.getUser('__linisgo_service_identity_probe__');

    // If getUser succeeded (unlikely for probe ID), identity is valid for linisgo-mobile
    cachedDiagnostics = {
      projectId: envConfig.firebaseProjectId,
      sdkInitialized: true,
      credentialsAvailable: true,
      connectionValidated: true,
      status: 'connected',
      message: `Trusted server-side identity validated for Firebase project "${envConfig.firebaseProjectId}".`,
    };
    lastDiagnosticsTimestamp = now;
    return cachedDiagnostics;
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';

    if (code === 'auth/user-not-found') {
      // auth/user-not-found proves Firebase Identity Toolkit accepted our server credential for linisgo-mobile!
      cachedDiagnostics = {
        projectId: envConfig.firebaseProjectId,
        sdkInitialized: true,
        credentialsAvailable: true,
        connectionValidated: true,
        status: 'connected',
        message: `Trusted server-side identity validated for Firebase project "${envConfig.firebaseProjectId}".`,
      };
      lastDiagnosticsTimestamp = now;
      return cachedDiagnostics;
    }

    cachedDiagnostics = {
      projectId: envConfig.firebaseProjectId,
      sdkInitialized: Boolean(app),
      credentialsAvailable: false,
      connectionValidated: false,
      status: 'blocked_missing_credentials',
      message:
        'Firebase Admin authentication is BLOCKED: The backend environment does not have a trusted service identity (ADC or service account) authorized for Firebase project "linisgo-mobile". Public health endpoint is operational; authenticated endpoints (/api/auth/me) require valid server credentials.',
    };
    lastDiagnosticsTimestamp = now;
    return cachedDiagnostics;
  }
}
