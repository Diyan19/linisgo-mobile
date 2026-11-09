import 'dotenv/config';

export interface BackendEnvConfig {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  firebaseProjectId: string;
  allowedOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

const EXPECTED_PROJECT_ID = 'linisgo-mobile';

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

  const allowedOrigins = parseAllowedOrigins(process.env['ALLOWED_ORIGINS'], nodeEnv);

  // Default 15 minutes (900,000 ms) per Task 1.1 specification
  const rateLimitWindowMs = parsePositiveInt(
    process.env['RATE_LIMIT_WINDOW_MS'],
    900_000,
    'RATE_LIMIT_WINDOW_MS'
  );

  // Support both RATE_LIMIT_MAX_REQUEST and RATE_LIMIT_MAX_REQUESTS (default 100)
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
    allowedOrigins,
    rateLimitWindowMs,
    rateLimitMaxRequests,
  };
}

export const envConfig: BackendEnvConfig = loadBackendEnv();
