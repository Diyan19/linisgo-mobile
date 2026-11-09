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
   * Checks `GET /api/health` and, if a Firebase user is currently signed in
   * (or `forceAuthMeCall === true`), also invokes `GET /api/auth/me`.
   */
  async runAuthIntegrationDiagnostic(
    forceAuthMeCall = true
  ): Promise<AuthIntegrationDiagnosticResult> {
    this.isTestingSignal.set(true);
    const testedAt = new Date().toISOString();
    const endpointTested = this.apiConfig.buildEndpointUrl('/auth/me');

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

    if (!forceAuthMeCall && !this.authService.isAuthenticatedUser()) {
      const healthOnlyResult: AuthIntegrationDiagnosticResult = {
        testedAt,
        endpointTested,
        apiReachable: true,
        healthData,
        tokenVerificationStatus: 'unauthorized_401',
        httpStatusCode: 401,
        errorCode: 'SIGNED_OUT_CLIENT_STATE',
        message:
          'API is reachable (GET /api/health returned HTTP 200). No Firebase user is currently signed in; click "Run API Check" to test GET /api/auth/me rejection (HTTP 401) or sign in first.',
        authenticatedUser: null,
      };
      this.lastDiagnosticSignal.set(healthOnlyResult);
      this.isTestingSignal.set(false);
      return healthOnlyResult;
    }

    try {
      const authMe = await firstValueFrom(this.getAuthMe());
      const successResult: AuthIntegrationDiagnosticResult = {
        testedAt,
        endpointTested,
        apiReachable: true,
        healthData,
        tokenVerificationStatus: 'verified',
        httpStatusCode: 200,
        errorCode: null,
        message:
          'Firebase ID token verified by Private REST API (GET /api/auth/me returned HTTP 200).',
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
            ? 'HTTP 401 Unauthorized: Missing, invalid, or expired Firebase ID token.'
            : err.status === 503
            ? 'HTTP 503 Service Unavailable: Trusted server-side Firebase Admin credentials are not configured in this environment.'
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
        authenticatedUser: null,
      };
      this.lastDiagnosticSignal.set(fallbackResult);
      this.isTestingSignal.set(false);
      return fallbackResult;
    }
  }
}
