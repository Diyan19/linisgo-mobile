import { ApiHttpError, AuthenticatedRequest, VerifiedUserIdentity } from '../types/auth.types.js';
import { AccountLifecycleState, AppealTargetModerationAction } from '../types/firestore-schema.types.js';

/**
 * Asserts that an authenticated Firebase user identity is present on the request.
 * Never trusts client-supplied `uid` parameters or `profileTag` ('client' | 'provider').
 */
export function requireVerifiedIdentity(req: AuthenticatedRequest): VerifiedUserIdentity {
  const user = req.authenticatedUser;
  if (!user || !user.uid) {
    throw new ApiHttpError(
      'UNAUTHORIZED',
      'Authenticated Firebase user identity is required.',
      401
    );
  }
  return user;
}

/**
 * Checks whether the verified identity has trusted administrator custom claims.
 * Explicitly ignores `profileTag` ('client' | 'provider') or any editable profile attribute.
 */
export function isVerifiedAdminIdentity(user: VerifiedUserIdentity): boolean {
  return user.claims.admin === true || user.claims.role === 'admin';
}

/**
 * Asserts that the authenticated user owns the target record (or is a verified admin when `allowAdminOverride === true`).
 */
export function assertRecordOwnership(
  user: VerifiedUserIdentity,
  resourceOwnerUid: string,
  allowAdminOverride = false
): void {
  if (user.uid === resourceOwnerUid) {
    return;
  }
  if (allowAdminOverride && isVerifiedAdminIdentity(user)) {
    return;
  }
  throw new ApiHttpError(
    'FORBIDDEN_NOT_OWNER',
    'You do not have permission to access or modify a record owned by another user.',
    403
  );
}

/**
 * Enforces account-state restrictions before performing mutations.
 * - Suspended accounts are blocked from creating/updating posts, profiles, or bookmarks,
 *   and CANNOT reactivate themselves.
 * - Appeals (`submit_appeal`) are permitted for:
 *   1. `'account_suspension'` when `accountState === 'suspended'`
 *   2. `'post_hidden'` when the author's account is `'active'` or `'suspended'` (not undergoing permanent deletion)
 * - Deactivated accounts must reactivate before publishing posts or bookmarks.
 */
export function assertAccountStatePermitsAction(
  accountState: AccountLifecycleState,
  action: 'publish_or_mutate' | 'submit_appeal' | 'self_toggle_deactivation',
  appealActionType?: AppealTargetModerationAction
): void {
  if (
    accountState === 'pending_deletion' ||
    accountState === 'deletion_processing' ||
    accountState === 'deleted'
  ) {
    throw new ApiHttpError(
      'FORBIDDEN_ACCOUNT_DELETION_PENDING',
      'Your account is scheduled for or undergoing permanent deletion and cannot perform this action.',
      403
    );
  }

  if (action === 'submit_appeal') {
    if (appealActionType === 'post_hidden') {
      if (accountState !== 'active' && accountState !== 'suspended') {
        throw new ApiHttpError(
          'APPEAL_NOT_APPLICABLE',
          'Hidden-post appeals require an active or suspended account owned by the post author.',
          400
        );
      }
      return;
    }

    if (accountState !== 'suspended') {
      throw new ApiHttpError(
        'APPEAL_NOT_APPLICABLE',
        'Account suspension appeals may only be submitted while an account is suspended.',
        400
      );
    }
    return;
  }

  if (accountState === 'suspended') {
    throw new ApiHttpError(
      'FORBIDDEN_ACCOUNT_SUSPENDED',
      'Your account is currently suspended. Suspended accounts cannot publish content or reactivate themselves.',
      403
    );
  }

  if (action === 'publish_or_mutate' && accountState === 'deactivated') {
    throw new ApiHttpError(
      'FORBIDDEN_ACCOUNT_DEACTIVATED',
      'Your account is currently deactivated. Please reactivate your account before publishing or modifying content.',
      403
    );
  }
}
