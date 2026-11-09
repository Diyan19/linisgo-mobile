import { envConfig } from '../config/env.js';
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDiagnostics,
} from '../config/firebase-admin.js';
import {
  ApiHttpError,
  TokenVerifier,
  VerifiedUserIdentity,
} from '../types/auth.types.js';

interface DecodedJwtEnvelope {
  header: {
    alg?: string;
    kid?: string;
    typ?: string;
  };
  payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    [key: string]: unknown;
  };
}

function decodeJwtSegments(idToken: string): DecodedJwtEnvelope {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new ApiHttpError(
      'INVALID_TOKEN',
      'Invalid Firebase ID token format. Expected a 3-part JWT.',
      401
    );
  }

  try {
    const headerJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const header = JSON.parse(headerJson) as DecodedJwtEnvelope['header'];
    const payload = JSON.parse(payloadJson) as DecodedJwtEnvelope['payload'];
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
      throw new Error('Invalid JSON structure');
    }
    return { header, payload };
  } catch {
    throw new ApiHttpError(
      'INVALID_TOKEN',
      'Malformed Firebase ID token encoding.',
      401
    );
  }
}

/**
 * Production TokenVerifier backed by the official Firebase Admin SDK.
 *
 * Security behavior:
 * 1. Always rejects malformed, expired, wrong-project, or invalid-signature tokens with HTTP 401.
 * 2. Requires validated server-side Firebase Admin credentials for live revocation-checked
 *    verification (`verifyIdToken(token, true)`). When trusted server-side credentials are
 *    unavailable in the runtime environment, returns HTTP 503 (`AUTH_BACKEND_UNAVAILABLE`)
 *    instead of faking successful backend verification.
 */
export class FirebaseAdminTokenVerifier implements TokenVerifier {
  private lastCredentialReady = false;

  isBackendCredentialReady(): boolean {
    return this.lastCredentialReady;
  }

  async verifyBearerToken(idToken: string): Promise<VerifiedUserIdentity> {
    const trimmed = idToken.trim();
    if (!trimmed) {
      throw new ApiHttpError('MISSING_TOKEN', 'Bearer token is empty.', 401);
    }

    // Step 1: Structural & claims pre-check to immediately reject expired or malformed JWTs with HTTP 401
    const { header, payload } = decodeJwtSegments(trimmed);

    if (header.alg !== 'RS256') {
      throw new ApiHttpError(
        'INVALID_TOKEN',
        'Invalid token signature algorithm. Expected RS256.',
        401
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
      throw new ApiHttpError(
        'TOKEN_EXPIRED',
        'Firebase ID token has expired. Please sign in again to obtain a fresh token.',
        401
      );
    }

    const expectedIssuer = `https://securetoken.google.com/${envConfig.firebaseProjectId}`;
    if (
      payload.aud !== envConfig.firebaseProjectId ||
      payload.iss !== expectedIssuer ||
      typeof payload.sub !== 'string' ||
      !payload.sub.trim()
    ) {
      throw new ApiHttpError(
        'INVALID_TOKEN',
        `Token audience or issuer does not match Firebase project "${envConfig.firebaseProjectId}".`,
        401
      );
    }

    // Step 2: Check whether trusted server-side Firebase Admin credentials are available
    const diagnostics = await getFirebaseAdminDiagnostics();
    this.lastCredentialReady = diagnostics.connectionValidated;

    const adminAuth = getFirebaseAdminAuth();

    // First verify cryptographic RS256 signature and claims via Firebase Admin SDK
    try {
      const decodedToken = await adminAuth.verifyIdToken(
        trimmed,
        diagnostics.connectionValidated
      );

      // If cryptographic verification succeeded but server-side Firebase Admin credentials
      // (ADC / service account for linisgo-mobile) are NOT configured in this environment,
      // report honestly that live authenticated backend integration is BLOCKED (HTTP 503).
      if (!diagnostics.connectionValidated) {
        throw new ApiHttpError(
          'AUTH_BACKEND_UNAVAILABLE',
          diagnostics.message,
          503
        );
      }

      return {
        uid: decodedToken.uid,
        email: typeof decodedToken.email === 'string' ? decodedToken.email : null,
        emailVerified: Boolean(decodedToken.email_verified),
        displayName:
          typeof decodedToken['name'] === 'string' ? (decodedToken['name'] as string) : null,
        claims: {
          role: typeof decodedToken['role'] === 'string' ? (decodedToken['role'] as string) : undefined,
          admin: Boolean(decodedToken['admin']),
        },
        issuedAt: decodedToken.iat,
        expiresAt: decodedToken.exp,
      };
    } catch (err: unknown) {
      if (err instanceof ApiHttpError) {
        throw err;
      }

      const firebaseCode =
        err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';

      if (firebaseCode === 'auth/id-token-expired') {
        throw new ApiHttpError(
          'TOKEN_EXPIRED',
          'Firebase ID token has expired. Please refresh your session.',
          401
        );
      }

      if (
        firebaseCode === 'auth/id-token-revoked' ||
        firebaseCode === 'auth/user-disabled'
      ) {
        throw new ApiHttpError(
          'TOKEN_REVOKED',
          'Firebase ID token has been revoked or the user account is disabled.',
          401
        );
      }

      if (
        firebaseCode === 'auth/argument-error' ||
        firebaseCode === 'auth/invalid-id-token'
      ) {
        throw new ApiHttpError(
          'INVALID_TOKEN',
          'Invalid Firebase ID token signature or claims.',
          401
        );
      }

      // If verification failed due to missing backend credentials or network/credential error
      if (!diagnostics.connectionValidated) {
        throw new ApiHttpError(
          'AUTH_BACKEND_UNAVAILABLE',
          diagnostics.message,
          503
        );
      }

      throw new ApiHttpError(
        'INVALID_TOKEN',
        'Unable to verify Firebase ID token.',
        401
      );
    }
  }
}

export const defaultTokenVerifier = new FirebaseAdminTokenVerifier();
