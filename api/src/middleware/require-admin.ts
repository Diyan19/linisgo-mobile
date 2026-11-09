import { NextFunction, Response } from 'express';
import { ApiHttpError, AuthenticatedRequest } from '../types/auth.types.js';

/**
 * Administrator Security Boundary Preparation (Task 1.1 Section 8).
 *
 * Security Rules:
 * - Must run AFTER `authenticate` middleware.
 * - Never trusts Client/Provider profile tags, editable profile fields,
 *   frontend localStorage role flags, or hardcoded demo admin credentials.
 * - Requires verified Firebase custom claims (`admin === true` or `role === 'admin'`).
 * - Actual admin promotion, role assignment, and server-side account-state
 *   enforcement are intentionally deferred until Task 1.2+.
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const user = req.authenticatedUser;

  if (!user || !user.uid) {
    next(
      new ApiHttpError(
        'UNAUTHORIZED',
        'Authentication is required before checking administrator permissions.',
        401
      )
    );
    return;
  }

  const hasTrustedAdminClaim =
    user.claims.admin === true || user.claims.role === 'admin';

  if (!hasTrustedAdminClaim) {
    next(
      new ApiHttpError(
        'FORBIDDEN_ADMIN_REQUIRED',
        'Administrator authorization denied. Verified Firebase custom claims and server-side account state are required.',
        403
      )
    );
    return;
  }

  next();
}
