import fs from 'node:fs';
import { App, applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { CapabilityStatus } from '../types/auth.types.js';
import { envConfig } from './env.js';

/**
 * Revoked/exposed service account key identifier from earlier history.
 * Strictly forbidden from ever being loaded or accepted.
 */
const FORBIDDEN_KEY_IDENTIFIER = 'db6ff4441b';

/**
 * Official Google public X.509 signing certificates endpoint used by Firebase Admin SDK
 * to cryptographically verify Firebase Auth ID tokens (`verifyIdToken`).
 */
const GOOGLE_PUBLIC_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface FirebaseAdminDiagnostics {
  projectId: string;
  databaseId: string;
  location: string;
  edition: string;
  mode: string;
  sdkInitialized: boolean;
  firebaseProjectIdConfigured: boolean;
  publicSigningKeysAccessible: boolean;
  basicIdTokenVerification: CapabilityStatus;
  tokenRevocationChecking: CapabilityStatus;
  privilegedFirebaseAdminAccess: CapabilityStatus;
  firestoreServerOperations: CapabilityStatus;
  firestoreReadProbeErrorCode: string | null;
  credentialsAvailable: boolean;
  connectionValidated: boolean;
  status: 'basic_jwt_ready_privileged_blocked' | 'full_privileged_ready' | 'blocked';
  message: string;
}

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminFirestore: Firestore | null = null;
let cachedDiagnostics: FirebaseAdminDiagnostics | null = null;
let lastDiagnosticsTimestamp = 0;
const DIAGNOSTICS_CACHE_TTL_MS = 60_000;

/**
 * Inspects optional GOOGLE_APPLICATION_CREDENTIALS if set.
 */
function inspectExplicitCredentialFile(): {
  explicitFileProvided: boolean;
  validExplicitFile: boolean;
  errorReason: string | null;
} {
  const gacPath = (process.env['GOOGLE_APPLICATION_CREDENTIALS'] || '').trim();

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
      type?: string;
      project_id?: string;
      quota_project_id?: string;
      client_email?: string;
      private_key?: string;
      service_account_impersonation_url?: string;
    };
    if (
      parsed.type === 'impersonated_service_account' ||
      parsed.type === 'authorized_user' ||
      (parsed.project_id === envConfig.firebaseProjectId &&
        Boolean(parsed.client_email) &&
        Boolean(parsed.private_key))
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
 * Returns the Firebase Admin Firestore instance connected to the existing `(default)` database
 * (location `nam5`, edition `Standard`, mode `Firestore Native`) of project `linisgo-mobile`.
 */
export function getFirebaseAdminFirestore(): Firestore {
  if (adminFirestore) {
    return adminFirestore;
  }
  const app = getOrInitializeFirebaseAdminApp();
  adminFirestore =
    envConfig.firestoreDatabaseId === '(default)'
      ? getFirestore(app)
      : getFirestore(app, envConfig.firestoreDatabaseId);
  return adminFirestore;
}

/**
 * Checks whether Google's public X.509 signing certificates for Firebase Auth are reachable.
 */
async function checkPublicSigningCertificatesAccessible(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(GOOGLE_PUBLIC_CERTS_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return false;
    }
    const certs = (await response.json()) as Record<string, unknown>;
    return Boolean(certs && typeof certs === 'object' && Object.keys(certs).length > 0);
  } catch {
    return false;
  }
}

/**
 * Checks whether privileged Firebase Admin Auth operations (`getAuth().getUser()`, revocation lookup,
 * custom-claim assignment) are authorized for project `linisgo-mobile`.
 */
async function checkPrivilegedFirebaseAdminAccess(): Promise<boolean> {
  const fileCheck = inspectExplicitCredentialFile();
  if (fileCheck.explicitFileProvided && !fileCheck.validExplicitFile) {
    return false;
  }

  try {
    const auth = getFirebaseAdminAuth();
    await auth.getUser('__linisgo_service_identity_probe__');
    return true;
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
    return code === 'auth/user-not-found';
  }
}

/**
 * Performs a real, non-destructive Firestore read probe against the existing `(default)` database
 * on project `linisgo-mobile` (`_linisgo_stage1_smoke_test/__read_probe__`).
 * Never claims Firestore server access is working unless the actual read succeeds.
 */
export async function checkFirestoreDatabaseConnectivity(): Promise<{
  firestoreAuthorized: boolean;
  errorCode: string | null;
}> {
  const fileCheck = inspectExplicitCredentialFile();
  if (fileCheck.explicitFileProvided && !fileCheck.validExplicitFile) {
    return {
      firestoreAuthorized: false,
      errorCode: 'INVALID_CREDENTIAL_FILE',
    };
  }

  try {
    const db = getFirebaseAdminFirestore();
    const readPromise = db
      .collection('_linisgo_stage1_smoke_test')
      .doc('__read_probe__')
      .get();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('FIRESTORE_PROBE_TIMEOUT')), 3500)
    );
    await Promise.race([readPromise, timeoutPromise]);
    return {
      firestoreAuthorized: true,
      errorCode: null,
    };
  } catch (err: unknown) {
    const rawCode =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code)
        : err instanceof Error
        ? err.message
        : 'FIRESTORE_ACCESS_BLOCKED';
    return {
      firestoreAuthorized: false,
      errorCode: rawCode || 'FIRESTORE_ACCESS_BLOCKED',
    };
  }
}

/**
 * Computes accurate, separated readiness diagnostics distinguishing:
 * 1. Basic Firebase ID token verification (`verifyIdToken(token, false)` using public signing keys + projectId)
 * 2. Privileged Firebase Admin Auth operations (`getUser`, `checkRevoked: true`, custom claims)
 * 3. Authorized Cloud Firestore server operations (`_linisgo_stage1_smoke_test/__read_probe__`)
 */
export async function getFirebaseAdminDiagnostics(
  forceRefresh = false
): Promise<FirebaseAdminDiagnostics> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedDiagnostics &&
    now - lastDiagnosticsTimestamp < DIAGNOSTICS_CACHE_TTL_MS
  ) {
    return cachedDiagnostics;
  }

  const app = getOrInitializeFirebaseAdminApp();
  const sdkInitialized = Boolean(app);
  const firebaseProjectIdConfigured = app.options.projectId === 'linisgo-mobile';

  const [publicSigningKeysAccessible, privilegedAuthReady, firestoreProbe] = await Promise.all([
    checkPublicSigningCertificatesAccessible(),
    checkPrivilegedFirebaseAdminAccess(),
    checkFirestoreDatabaseConnectivity(),
  ]);

  const basicReady = sdkInitialized && firebaseProjectIdConfigured && publicSigningKeysAccessible;
  const firestoreReady = firestoreProbe.firestoreAuthorized;

  const basicIdTokenVerification: CapabilityStatus = basicReady ? 'working' : 'blocked';
  const tokenRevocationChecking: CapabilityStatus = privilegedAuthReady ? 'working' : 'blocked';
  const privilegedFirebaseAdminAccess: CapabilityStatus = privilegedAuthReady
    ? 'working'
    : 'blocked';
  const firestoreServerOperations: CapabilityStatus = firestoreReady ? 'working' : 'blocked';

  let status: FirebaseAdminDiagnostics['status'] = 'blocked';
  let message = '';

  if (basicReady && firestoreReady) {
    status = 'full_privileged_ready';
    message =
      'Basic Firebase ID token verification and authorized Cloud Firestore server access to "(default)" (nam5, Standard, Firestore Native) on project "linisgo-mobile" are WORKING.';
  } else if (basicReady && !firestoreReady) {
    status = 'basic_jwt_ready_privileged_blocked';
    message =
      'Basic Firebase ID token verification (getAuth().verifyIdToken against public signing keys for project "linisgo-mobile") is WORKING. Cloud Firestore server operations on "(default)" (nam5, Standard, Firestore Native) remain BLOCKED until trusted backend credentials (e.g., keyless ADC with service-account impersonation and roles/datastore.user) are configured.';
  } else {
    status = 'blocked';
    message =
      'Firebase ID token verification and Cloud Firestore access are BLOCKED (unable to reach public signing certificates or initialize SDK).';
  }

  cachedDiagnostics = {
    projectId: envConfig.firebaseProjectId,
    databaseId: envConfig.firestoreDatabaseId,
    location: envConfig.firestoreLocation,
    edition: envConfig.firestoreEdition,
    mode: envConfig.firestoreMode,
    sdkInitialized,
    firebaseProjectIdConfigured,
    publicSigningKeysAccessible,
    basicIdTokenVerification,
    tokenRevocationChecking,
    privilegedFirebaseAdminAccess,
    firestoreServerOperations,
    firestoreReadProbeErrorCode: firestoreProbe.errorCode,
    credentialsAvailable: firestoreReady || privilegedAuthReady,
    connectionValidated: firestoreReady,
    status,
    message,
  };
  lastDiagnosticsTimestamp = now;
  return cachedDiagnostics;
}
