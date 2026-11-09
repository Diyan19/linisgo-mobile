import { Response } from 'express';
import {
  ApiHttpError,
  AuthenticatedRequest,
  AuthMeApiResponse,
} from '../types/auth.types.js';

/**
 * GET /api/auth/me
 * Protected endpoint requiring a verified Firebase ID token via `authenticate` middleware.
 *
 * Security Rules:
 * - Uses ONLY `req.authenticatedUser` populated from the verified Firebase ID token.
 * - Never trusts any UID or email passed in query parameters, headers, or request body.
 * - Distinguishes basic public-certificate JWT verification from privileged Firebase Admin operations.
 */
export function getAuthenticatedUserMe(
  req: AuthenticatedRequest,
  res: Response
): void {
  const verifiedUser = req.authenticatedUser;

  if (!verifiedUser || !verifiedUser.uid) {
    throw new ApiHttpError(
      'UNAUTHORIZED',
      'Verified Firebase user identity is missing from request context.',
      401
    );
  }

  const isTrustedAdmin =
    verifiedUser.claims.admin === true || verifiedUser.claims.role === 'admin';
  const revocationChecked =
    verifiedUser.verificationMode === 'privileged_revocation_checked';

  const payload: AuthMeApiResponse = {
    status: 'ok',
    authenticated: true,
    user: {
      uid: verifiedUser.uid,
      email: verifiedUser.email,
      emailVerified: verifiedUser.emailVerified,
      displayName: verifiedUser.displayName,
    },
    verification: {
      mode: verifiedUser.verificationMode,
      revocationChecked,
      privilegedAdminAccess: revocationChecked ? 'working' : 'blocked',
    },
    authorizationBoundary: {
      role: isTrustedAdmin ? 'admin' : 'user',
      accountStateEnforced: false,
      privilegedOperationsBlocked: !revocationChecked,
      note:
        'Basic Firebase JWT signature and claims verified against project linisgo-mobile. Privileged Firebase Admin operations (getUser, revocation checking, custom-claim assignment, and server-side Firestore writes) remain blocked until authorized backend credentials are configured.',
    },
  };

  res.status(200).json(payload);
}
