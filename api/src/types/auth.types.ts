import { Request } from 'express';

/**
 * Verified Firebase identity attached to authenticated Express requests.
 * Never populated from unverified client parameters.
 */
export interface VerifiedUserIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  claims: {
    role?: string;
    admin?: boolean;
    [key: string]: unknown;
  };
  issuedAt?: number;
  expiresAt?: number;
}

/**
 * Express Request extended with the verified Firebase user identity.
 */
export interface AuthenticatedRequest extends Request {
  authenticatedUser?: VerifiedUserIdentity;
}

/**
 * Dependency-injection contract for verifying Firebase ID tokens.
 * Enables isolated middleware unit testing with test doubles while using
 * Firebase Admin SDK in production/live mode.
 */
export interface TokenVerifier {
  verifyBearerToken(idToken: string): Promise<VerifiedUserIdentity>;
  isBackendCredentialReady(): boolean;
}

/**
 * Structured error thrown during authentication or authorization checks.
 */
export class ApiHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = 'ApiHttpError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface HealthApiResponse {
  status: 'ok';
  service: string;
  timestamp: string;
  runtime: {
    nodeVersion: string;
    environment: string;
    uptimeSeconds: number;
  };
  firebaseAdmin: {
    projectId: string;
    sdkInitialized: boolean;
    credentialsAvailable: boolean;
    connectionValidated: boolean;
    status: 'connected' | 'blocked_missing_credentials' | 'error';
    message: string;
  };
}

export interface AuthMeApiResponse {
  status: 'ok';
  authenticated: true;
  user: {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
  };
  authorizationBoundary: {
    role: 'user' | 'admin';
    accountStateEnforced: boolean;
    note: string;
  };
}

export interface ApiErrorResponse {
  status: 'error';
  code: string;
  message: string;
  timestamp: string;
}
