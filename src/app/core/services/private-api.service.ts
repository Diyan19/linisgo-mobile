import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import {
  ApiErrorResponse,
  AuthIntegrationDiagnosticResult,
  AuthMeApiResponse,
  HealthApiResponse,
} from '../../shared/models/api.model';
import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class PrivateApiService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly authService = inject(AuthService);

  readonly isTestingSignal = signal<boolean>(false);
  readonly lastDiagnosticSignal = signal<AuthIntegrationDiagnosticResult | null>(null);

  /**
   * Calls `GET /api/health` (unauthenticated).
   */
  getHealth(): Observable<HealthApiResponse> {
    return this.http.get<HealthApiResponse>(this.apiConfig.buildEndpointUrl('/health'));
  }

  /**
   * Calls `GET /api/auth/me` (protected; `firebaseAuthInterceptor` automatically attaches Bearer token).
   */
  getAuthMe(): Observable<AuthMeApiResponse> {
    return this.http.get<AuthMeApiResponse>(this.apiConfig.buildEndpointUrl('/auth/me'));
  }

  /**
   * Waits for Firebase Authentication initialization to complete, checks `GET /api/health`,
   * and ONLY calls `GET /api/auth/me` if a Firebase user is currently signed in
   * (or if `forceUnauthenticatedRequest === true` is explicitly passed for a negative security test).
   * If the user is signed out, displays "Sign in required" instead of performing the protected request.
   */
  async runAuthIntegrationDiagnostic(
    forceUnauthenticatedRequest = false
  ): Promise<AuthIntegrationDiagnosticResult> {
    this.isTestingSignal.set(true);
    const testedAt = new Date().toISOString();
    const endpointTested = this.apiConfig.buildEndpointUrl('/auth/me');

    // 1. Wait until Firebase Authentication initialization is complete
    await this.authService.waitForAuthInit();

    let healthData: HealthApiResponse | null = null;
    let apiReachable = false;

    try {
      healthData = await firstValueFrom(this.getHealth());
      apiReachable = Boolean(healthData && healthData.status === 'ok');
    } catch {
      apiReachable = false;
    }

    if (!apiReachable) {
      const unreachableResult: AuthIntegrationDiagnosticResult = {
        testedAt,
        endpointTested,
        apiReachable: false,
        healthData: null,
        tokenVerificationStatus: 'unreachable',
        httpStatusCode: null,
        errorCode: 'API_UNREACHABLE',
        message:
          'Private REST API server is unreachable. Ensure the Express server (port 3001) is running.',
        uidMatchesFrontendUser: null,
        authenticatedUser: this.authService.isAuthenticatedUser()
          ? {
              displayName: this.authService.currentUserDisplayName(),
              email: this.authService.currentUserEmail(),
              emailVerified: this.authService.isEmailVerified(),
            }
          : null,
      };
      this.lastDiagnosticSignal.set(unreachableResult);
      this.isTestingSignal.set(false);
      return unreachableResult;
    }

    // 2. If the user is signed out, display "Sign in required" instead of performing GET /api/auth/me
    if (!this.authService.isAuthenticatedUser() && !forceUnauthenticatedRequest) {
      const signInRequiredResult: AuthIntegrationDiagnosticResult = {
        testedAt,
        endpointTested,
        apiReachable: true,
        healthData,
        tokenVerificationStatus: 'sign_in_required',
        httpStatusCode: null,
        errorCode: 'SIGN_IN_REQUIRED',
        message:
          'Sign in required — No Firebase user is currently authenticated. Sign in with a real Firebase account to test GET /api/auth/me with a verified ID token.',
        uidMatchesFrontendUser: null,
        authenticatedUser: null,
      };
      this.lastDiagnosticSignal.set(signInRequiredResult);
      this.isTestingSignal.set(false);
      return signInRequiredResult;
    }

    // 3. If the user is signed in, ensure a fresh Firebase ID token is obtained before calling GET /api/auth/me
    if (this.authService.isAuthenticatedUser()) {
      await this.authService.getIdToken(false);
    }

    try {
      const authMe = await firstValueFrom(this.getAuthMe());
      const frontendUid = this.authService.currentUserId();
      const uidMatches = Boolean(frontendUid && authMe.user.uid === frontendUid);

      const successResult: AuthIntegrationDiagnosticResult = {
        testedAt,
        endpointTested,
        apiReachable: true,
        healthData,
        tokenVerificationStatus: 'verified',
        httpStatusCode: 200,
        errorCode: null,
        message: uidMatches
          ? 'Firebase ID token cryptographically verified by Private REST API (HTTP 200). Returned UID matches the authenticated Firebase user.'
          : 'Firebase ID token verified by Private REST API (HTTP 200).',
        uidMatchesFrontendUser: uidMatches,
        authenticatedUser: {
          displayName: authMe.user.displayName,
          email: authMe.user.email,
          emailVerified: authMe.user.emailVerified,
        },
      };
      this.lastDiagnosticSignal.set(successResult);
      this.isTestingSignal.set(false);
      return successResult;
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        const apiError = err.error as Partial<ApiErrorResponse> | undefined;
        const errorCode = apiError?.code || `HTTP_${err.status}`;
        const serverMessage =
          apiError?.message ||
          (err.status === 401
            ? 'HTTP 401 Unauthorized: Missing, invalid, wrong-project, or expired Firebase ID token.'
            : err.status === 503
            ? 'HTTP 503 Service Unavailable: Public signing keys unreachable.'
            : `Private REST API returned HTTP ${err.status}.`);

        const statusType =
          err.status === 401
            ? 'unauthorized_401'
            : err.status === 503
            ? 'blocked_missing_backend_credentials_503'
            : 'error';

        const errorResult: AuthIntegrationDiagnosticResult = {
          testedAt,
          endpointTested,
          apiReachable: true,
          healthData,
          tokenVerificationStatus: statusType,
          httpStatusCode: err.status,
          errorCode,
          message: serverMessage,
          uidMatchesFrontendUser: false,
          authenticatedUser: this.authService.isAuthenticatedUser()
            ? {
                displayName: this.authService.currentUserDisplayName(),
                email: this.authService.currentUserEmail(),
                emailVerified: this.authService.isEmailVerified(),
              }
            : null,
        };
        this.lastDiagnosticSignal.set(errorResult);
        this.isTestingSignal.set(false);
        return errorResult;
      }

      const fallbackResult: AuthIntegrationDiagnosticResult = {
        testedAt,
        endpointTested,
        apiReachable,
        healthData,
        tokenVerificationStatus: 'error',
        httpStatusCode: null,
        errorCode: 'UNKNOWN_ERROR',
        message: 'Unexpected error while communicating with GET /api/auth/me.',
        uidMatchesFrontendUser: null,
        authenticatedUser: null,
      };
      this.lastDiagnosticSignal.set(fallbackResult);
      this.isTestingSignal.set(false);
      return fallbackResult;
    }
  }
}
