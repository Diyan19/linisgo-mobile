import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects Regular User routes (/user/*).
 * Waits for Firebase Authentication to finish restoring the session (onAuthStateChanged)
 * before deciding whether to allow navigation or redirect to /login.
 */
export const userGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = await authService.waitForAuthInit();
  if (user && authService.isAuthenticatedUser()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
