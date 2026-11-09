import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ApiConfigService } from '../services/api-config.service';
import { AuthService } from '../services/auth.service';

/**
 * Functional HTTP Interceptor that attaches the current Firebase User's ID token
 * (`Authorization: Bearer <FIREBASE_ID_TOKEN>`) strictly to protected Private REST API requests.
 *
 * Security guarantees:
 * - Never attaches tokens to unrelated third-party URLs.
 * - Never logs ID tokens to the browser console.
 * - Never stores ID tokens in permanent localStorage.
 */
export const firebaseAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const apiConfig = inject(ApiConfigService);
  const authService = inject(AuthService);

  // Never attach Firebase ID tokens to third-party URLs
  if (!apiConfig.isPrivateApiUrl(req.url)) {
    return next(req);
  }

  // Public health endpoint does not require authentication
  if (req.url.endsWith('/api/health') || req.url.includes('/api/health?')) {
    return next(req);
  }

  return from(authService.getIdToken(false)).pipe(
    switchMap(token => {
      const requestToSend = token
        ? req.clone({
            setHeaders: {
              Authorization: `Bearer ${token}`,
            },
          })
        : req;

      return next(requestToSend);
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // Expose a clean 401 state without logging raw tokens
        return throwError(() => error);
      }
      return throwError(() => error);
    })
  );
};
