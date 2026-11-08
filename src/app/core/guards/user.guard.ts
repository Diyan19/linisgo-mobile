import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const userGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isUser()) {
    return true;
  }

  // Not logged in as demo user: redirect to login
  router.navigate(['/login']);
  return false;
};
