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
 * - Returns minimal authenticated user profile metadata without password hashes or raw tokens.
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

  const payload: AuthMeApiResponse = {
    status: 'ok',
    authenticated: true,
    user: {
      uid: verifiedUser.uid,
      email: verifiedUser.email,
      emailVerified: verifiedUser.emailVerified,
      displayName: verifiedUser.displayName,
    },
    authorizationBoundary: {
      role: isTrustedAdmin ? 'admin' : 'user',
      accountStateEnforced: false,
      note:
        'Firebase ID token verified. Server-side Firestore account state (suspension/deactivation) and admin custom-claim enforcement will be completed in Task 1.2+.',
    },
  };

  res.status(200).json(payload);
}
