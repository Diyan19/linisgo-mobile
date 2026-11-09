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
 * Production TokenVerifier backed by the official Firebase Admin SDK (`getAuth().verifyIdToken`).
 *
 * Security guarantees:
 * 1. Never accepts unverified or decoded-only JWT payloads as authenticated identities.
 * 2. Enforces strict RS256 cryptographic signature verification against Google's public signing
 *    certificates, plus `iss`, `aud` (`linisgo-mobile`), `exp`, `iat`, and `sub` validation via
 *    `getFirebaseAdminAuth().verifyIdToken(token, checkRevoked)`.
 * 3. Rejects tokens from any other Firebase project (`aud !== 'linisgo-mobile'`) with HTTP 401.
 * 4. Enables revocation checking (`checkRevoked = true`) only when privileged backend credentials
 *    are available; uses basic public-certificate verification (`checkRevoked = false`) otherwise,
 *    while keeping all privileged Firebase Admin operations strictly blocked.
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

    // Step 1: Pre-check JWT envelope to reject obviously malformed, expired, or wrong-project tokens
    // immediately with clear 401 error codes before calling cryptographic verification.
    // NOTE: Passing this pre-check NEVER authenticates a request — cryptographic verification in Step 2 is mandatory.
    const { header, payload } = decodeJwtSegments(trimmed);

    if (header.alg !== 'RS256' || !header.kid) {
      throw new ApiHttpError(
        'INVALID_TOKEN',
        'Invalid token signature algorithm or missing key ID (kid). Expected RS256.',
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
    if (payload.aud !== envConfig.firebaseProjectId || payload.iss !== expectedIssuer) {
      throw new ApiHttpError(
        'WRONG_PROJECT_TOKEN',
        `Token audience or issuer does not match configured Firebase project "${envConfig.firebaseProjectId}".`,
        401
      );
    }

    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new ApiHttpError(
        'INVALID_TOKEN',
        'Firebase ID token is missing a valid subject (sub / uid) claim.',
        401
      );
    }

    // Step 2: Check backend readiness & run cryptographic verification via Firebase Admin SDK
    const diagnostics = await getFirebaseAdminDiagnostics();
    this.lastCredentialReady = diagnostics.basicIdTokenVerification === 'working';

    if (diagnostics.basicIdTokenVerification !== 'working') {
      throw new ApiHttpError(
        'AUTH_BACKEND_UNAVAILABLE',
        'Basic Firebase ID token verification is currently blocked because Google public signing keys could not be reached.',
        503
      );
    }

    const adminAuth = getFirebaseAdminAuth();
    const useRevocationCheck = diagnostics.tokenRevocationChecking === 'working';

    try {
      // Cryptographically verifies RS256 signature against Google's public X.509 certificates
      // and validates aud, iss, exp, iat, and sub claims for project `linisgo-mobile`.
      const decodedToken = await adminAuth.verifyIdToken(trimmed, useRevocationCheck);

      if (decodedToken.aud !== envConfig.firebaseProjectId) {
        throw new ApiHttpError(
          'WRONG_PROJECT_TOKEN',
          `Verified token audience does not match "${envConfig.firebaseProjectId}".`,
          401
        );
      }

      return {
        uid: decodedToken.uid,
        email: typeof decodedToken.email === 'string' ? decodedToken.email : null,
        emailVerified: Boolean(decodedToken.email_verified),
        displayName:
          typeof decodedToken['name'] === 'string' ? (decodedToken['name'] as string) : null,
        claims: {
          role:
            typeof decodedToken['role'] === 'string'
              ? (decodedToken['role'] as string)
              : undefined,
          admin: Boolean(decodedToken['admin']),
        },
        verificationMode: useRevocationCheck
          ? 'privileged_revocation_checked'
          : 'public_certs_basic',
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

      throw new ApiHttpError(
        'INVALID_TOKEN',
        'Invalid Firebase ID token signature or claims.',
        401
      );
    }
  }
}

export const defaultTokenVerifier = new FirebaseAdminTokenVerifier();
