import 'dotenv/config';

export interface BackendEnvConfig {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  firebaseProjectId: string;
  firestoreDatabaseId: string;
  firestoreLocation: string;
  firestoreEdition: string;
  firestoreMode: string;
  firebaseWebApiKey: string;
  allowedOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

const EXPECTED_PROJECT_ID = 'linisgo-mobile';
const EXPECTED_DATABASE_ID = '(default)';
const EXPECTED_FIRESTORE_LOCATION = 'nam5';
const EXPECTED_FIRESTORE_EDITION = 'Standard';
const ALLOWED_FIRESTORE_MODES = new Set(['Native', 'Firestore Native']);

/**
 * Verified frontend origins for Google AI Studio embedded preview and local Angular dev server.
 * Wildcard '*' is strictly prohibited.
 */
export const DEFAULT_VERIFIED_ORIGINS = [
  'https://ais-dev-wjmg4lrpgdcyxp2jlqp5km-332623356276.asia-east1.run.app',
  'https://ais-pre-wjmg4lrpgdcyxp2jlqp5km-332623356276.asia-east1.run.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid API_PORT value: "${raw}". Expected an integer between 1 and 65535.`);
  }
  return parsed;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} value. Expected a positive integer.`);
  }
  return parsed;
}

function parseAllowedOrigins(raw: string | undefined, nodeEnv: string): string[] {
  if (!raw || !raw.trim()) {
    if (nodeEnv === 'production') {
      throw new Error('ALLOWED_ORIGINS must be explicitly configured in production.');
    }
    return DEFAULT_VERIFIED_ORIGINS;
  }

  const origins = raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error('Wildcard "*" is not permitted in ALLOWED_ORIGINS. Specify explicit origins.');
  }

  return origins.length > 0 ? origins : DEFAULT_VERIFIED_ORIGINS;
}

function parsePublicWebApiKey(raw: string | undefined): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (
    trimmed.includes('PRIVATE_KEY') ||
    trimmed.includes('private_key') ||
    trimmed.includes('firebase-adminsdk')
  ) {
    return '';
  }
  return /^AIza[0-9A-Za-z_-]{30,50}$/.test(trimmed) ? trimmed : '';
}

/**
 * Detects whether the current process is running inside the Google AI Studio / Cloud Run hosted preview
 * rather than on a trusted local developer workstation.
 */
export function isHostedPreviewOrProductionEnvironment(
  nodeEnv: string = process.env['NODE_ENV'] || 'development'
): boolean {
  if (nodeEnv === 'production') {
    return true;
  }
  return Boolean(
    process.env['K_SERVICE'] ||
      process.env['CLOUD_RUN_JOB'] ||
      process.env['CLOUD_RUN_REVISION'] ||
      process.env['APPLET_ID']
  );
}

export function loadBackendEnv(): BackendEnvConfig {
  const rawNodeEnv = (process.env['NODE_ENV'] || 'development').trim();
  const nodeEnv: 'development' | 'production' | 'test' =
    rawNodeEnv === 'production' || rawNodeEnv === 'test' ? rawNodeEnv : 'development';

  const host = (process.env['API_HOST'] || '0.0.0.0').trim();
  if (!host) {
    throw new Error('API_HOST cannot be empty.');
  }

  const port = parsePort(process.env['API_PORT'], 3001);

  const firebaseProjectId = (process.env['FIREBASE_PROJECT_ID'] || EXPECTED_PROJECT_ID).trim();
  if (firebaseProjectId !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `Invalid FIREBASE_PROJECT_ID "${firebaseProjectId}". Must be "${EXPECTED_PROJECT_ID}".`
    );
  }

  const firestoreDatabaseId = (
    process.env['FIRESTORE_DATABASE_ID'] || EXPECTED_DATABASE_ID
  ).trim();
  if (firestoreDatabaseId !== EXPECTED_DATABASE_ID) {
    throw new Error(
      `Invalid FIRESTORE_DATABASE_ID "${firestoreDatabaseId}". Must use the existing "${EXPECTED_DATABASE_ID}" database on Spark Free plan.`
    );
  }

  const firestoreLocation = (
    process.env['FIRESTORE_LOCATION'] || EXPECTED_FIRESTORE_LOCATION
  ).trim();
  if (firestoreLocation !== EXPECTED_FIRESTORE_LOCATION) {
    throw new Error(
      `Invalid FIRESTORE_LOCATION "${firestoreLocation}". Must match existing database location "${EXPECTED_FIRESTORE_LOCATION}".`
    );
  }

  const firestoreEdition = (
    process.env['FIRESTORE_EDITION'] || EXPECTED_FIRESTORE_EDITION
  ).trim();
  if (firestoreEdition !== EXPECTED_FIRESTORE_EDITION) {
    throw new Error(
      `Invalid FIRESTORE_EDITION "${firestoreEdition}". Must match "${EXPECTED_FIRESTORE_EDITION}".`
    );
  }

  const rawMode = (process.env['FIRESTORE_MODE'] || 'Firestore Native').trim();
  if (!ALLOWED_FIRESTORE_MODES.has(rawMode)) {
    throw new Error(
      `Invalid FIRESTORE_MODE "${rawMode}". Must be "Native" or "Firestore Native".`
    );
  }

  const firebaseWebApiKey = parsePublicWebApiKey(
    process.env['FIREBASE_WEB_API_KEY'] || process.env['FIREBASE_API_KEY']
  );

  const allowedOrigins = parseAllowedOrigins(process.env['ALLOWED_ORIGINS'], nodeEnv);

  const rateLimitWindowMs = parsePositiveInt(
    process.env['RATE_LIMIT_WINDOW_MS'],
    900_000,
    'RATE_LIMIT_WINDOW_MS'
  );

  const rawRateLimitMax =
    process.env['RATE_LIMIT_MAX_REQUEST'] || process.env['RATE_LIMIT_MAX_REQUESTS'];
  const rateLimitMaxRequests = parsePositiveInt(
    rawRateLimitMax,
    100,
    'RATE_LIMIT_MAX_REQUEST'
  );

  return {
    nodeEnv,
    host,
    port,
    firebaseProjectId,
    firestoreDatabaseId,
    firestoreLocation,
    firestoreEdition,
    firestoreMode: rawMode,
    firebaseWebApiKey,
    allowedOrigins,
    rateLimitWindowMs,
    rateLimitMaxRequests,
  };
}

export const envConfig: BackendEnvConfig = loadBackendEnv();
