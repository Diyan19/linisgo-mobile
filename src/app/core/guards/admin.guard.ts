import { inject, isDevMode } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects Administrator routes (/admin/*).
 *
 * Security Enforcement (Task 1.0):
 * - Regular Firebase Authentication users are NEVER automatically granted Admin access.
 * - Does not rely on localStorage role strings or Client/Service Provider profile tags.
 * - Real Administrator authorization requires verified Firebase custom claims via the trusted
 *   backend in Task 1.1+.
 * - Allows access ONLY if the explicitly isolated development-only Admin UI sandbox mode is active
 *   and no regular user session is attempting to escalate privileges.
 */
export const adminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitForAuthInit();

  // Deny any regular authenticated Firebase user from accessing Admin routes in Task 1.0
  // (since trusted backend custom-claim verification is not yet connected).
  if (authService.isAuthenticatedUser()) {
    return router.createUrlTree(['/user/tabs/home'], {
      queryParams: { adminDenied: '1' },
    });
  }

  // Only allow the explicitly isolated development-only Admin UI sandbox in dev mode
  if (isDevMode() && authService.isAdmin()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { adminRestricted: '1' },
  });
};
