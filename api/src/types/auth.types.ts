import { Request } from 'express';

/**
 * Verified Firebase identity attached to authenticated Express requests.
 * Populated exclusively after cryptographic JWT verification via Firebase Admin SDK.
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
  verificationMode: 'public_certs_basic' | 'privileged_revocation_checked';
  issuedAt?: number;
  expiresAt?: number;
}

/**
 * Express Request extended with the verified Firebase user identity and raw verified Bearer ID token.
 */
export interface AuthenticatedRequest extends Request {
  authenticatedUser?: VerifiedUserIdentity;
  verifiedBearerToken?: string;
}

/**
 * Dependency-injection contract for verifying Firebase ID tokens.
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

export type CapabilityStatus = 'working' | 'blocked';

export interface ApiCapabilitiesReport {
  apiServerReachable: boolean;
  firebaseProjectIdConfigured: boolean;
  publicSigningKeysAccessible: boolean;
  basicIdTokenVerification: CapabilityStatus;
  tokenRevocationChecking: CapabilityStatus;
  privilegedFirebaseAdminAccess: CapabilityStatus;
  firestoreServerOperations: CapabilityStatus;
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
  capabilities: ApiCapabilitiesReport;
  firebaseAdmin: {
    projectId: string;
    databaseId: string;
    location: string;
    edition: string;
    mode: string;
    sdkInitialized: boolean;
    publicSigningKeysAccessible: boolean;
    basicIdTokenVerification: CapabilityStatus;
    tokenRevocationChecking: CapabilityStatus;
    privilegedAdminAccess: CapabilityStatus;
    firestoreServerOperations: CapabilityStatus;
    firestoreReadProbeErrorCode?: string | null;
    credentialsAvailable: boolean;
    connectionValidated: boolean;
    status: 'basic_jwt_ready_privileged_blocked' | 'full_privileged_ready' | 'blocked';
    message: string;
  };
  firebaseWebSdk?: {
    projectId: string;
    authDomain: string;
    appId: string;
    storageBucket: string;
    messagingSenderId: string;
    apiKeyConfigured: boolean;
    apiKey?: string;
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
  verification: {
    mode: 'public_certs_basic' | 'privileged_revocation_checked';
    revocationChecked: boolean;
    privilegedAdminAccess: CapabilityStatus;
  };
  authorizationBoundary: {
    role: 'user' | 'admin';
    accountStateEnforced: boolean;
    privilegedOperationsBlocked: boolean;
    note: string;
  };
}

export interface ApiErrorResponse {
  status: 'error';
  code: string;
  message: string;
  timestamp: string;
}
