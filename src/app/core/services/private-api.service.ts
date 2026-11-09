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

export interface FirestorePublicProfileDto {
  uid: string;
  displayName: string;
  biography: string;
  profilePhotoUrl: string | null;
  profileTag: 'client' | 'provider';
  availability: string;
  serviceAreaMunicipalityIds: string[];
  publicPhone: string | null;
  publicFacebookUrl: string | null;
  visibilityState: 'public' | 'hidden';
  authorAccountState: string;
  publicVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FirestorePrivateProfileDto {
  uid: string;
  registrationEmail: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  facebookUrl: string | null;
  showPhonePublicly: boolean;
  showFacebookPublicly: boolean;
  mapConsent: boolean;
  mapMunicipalityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirestorePublicMapMarkerDto {
  uid: string;
  displayName: string;
  profileTag: 'client' | 'provider';
  municipalityId: string;
  municipalityName: string;
  approximateLat: number;
  approximateLng: number;
  mapConsent: boolean;
  authorAccountState: string;
  publicVisible: boolean;
  updatedAt: string;
}

export interface FirestorePostDto {
  id: string;
  authorUid: string;
  authorDisplayName: string;
  authorProfileTag: 'client' | 'provider';
  postType: 'request' | 'offer';
  title: string;
  description: string;
  cleaningCategory: string;
  publicationState: 'draft' | 'published';
  lifecycleStatus: 'open' | 'closed' | 'active' | 'archived';
  moderationStatus: 'none' | 'flagged' | 'hidden' | 'removed';
  moderationReferenceId: string | null;
  authorAccountState: string;
  publicVisible: boolean;
  targetMunicipalityId: string | null;
  coverageAreaIds: string[];
  priceOrBudget: string | null;
  photoUrls: string[];
  publicAreaDescription: string | null;
  scheduleNote: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface OwnProfileBundleApiResponse {
  status: 'ok';
  transport: string;
  publicProfile: FirestorePublicProfileDto | null;
  privateProfile: FirestorePrivateProfileDto | null;
  accountState: { state: string } | null;
  mapMarker: FirestorePublicMapMarkerDto | null;
}

export interface UpsertProfilePayload {
  displayName: string;
  biography: string;
  profilePhotoUrl?: string | null;
  profileTag: 'client' | 'provider';
  availability: string;
  serviceAreaMunicipalityIds?: string[];
  phoneNumber?: string | null;
  facebookUrl?: string | null;
  showPhonePublicly?: boolean;
  showFacebookPublicly?: boolean;
  mapConsent?: boolean;
  mapMunicipalityId?: string | null;
}

export interface UpsertPostPayload {
  id?: string;
  postType: 'request' | 'offer';
  title: string;
  description: string;
  cleaningCategory: string;
  publicationState: 'draft' | 'published';
  lifecycleStatus: 'open' | 'closed' | 'active' | 'archived';
  targetMunicipalityId?: string | null;
  coverageAreaIds?: string[];
  priceOrBudget?: string | null;
  photoUrls?: string[];
  publicAreaDescription?: string | null;
  scheduleNote?: string | null;
  authorDisplayName?: string;
  authorProfileTag?: 'client' | 'provider';
}

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
   * Calls `GET /api/profiles/me` to load the signed-in user's public + private profile from Cloud Firestore.
   */
  getOwnProfileBundle(): Observable<OwnProfileBundleApiResponse> {
    return this.http.get<OwnProfileBundleApiResponse>(
      this.apiConfig.buildEndpointUrl('/profiles/me')
    );
  }

  /**
   * Calls `PUT /api/profiles/me` to persist the signed-in user's profile to Cloud Firestore.
   */
  updateOwnProfileBundle(payload: UpsertProfilePayload): Observable<{
    status: 'ok';
    persisted: boolean;
    publicProfile: FirestorePublicProfileDto;
    privateProfile: FirestorePrivateProfileDto;
    mapMarker: FirestorePublicMapMarkerDto | null;
  }> {
    return this.http.put<{
      status: 'ok';
      persisted: boolean;
      publicProfile: FirestorePublicProfileDto;
      privateProfile: FirestorePrivateProfileDto;
      mapMarker: FirestorePublicMapMarkerDto | null;
    }>(this.apiConfig.buildEndpointUrl('/profiles/me'), payload);
  }

  /**
   * Calls `GET /api/posts` to list published public posts.
   */
  listPublicPosts(): Observable<{ status: 'ok'; posts: FirestorePostDto[] }> {
    return this.http.get<{ status: 'ok'; posts: FirestorePostDto[] }>(
      this.apiConfig.buildEndpointUrl('/posts')
    );
  }

  /**
   * Calls `GET /api/profiles/public` to list discoverable public profiles and approximate map markers.
   */
  listPublicProfiles(): Observable<{
    status: 'ok';
    profiles: FirestorePublicProfileDto[];
    mapMarkers: FirestorePublicMapMarkerDto[];
  }> {
    return this.http.get<{
      status: 'ok';
      profiles: FirestorePublicProfileDto[];
      mapMarkers: FirestorePublicMapMarkerDto[];
    }>(this.apiConfig.buildEndpointUrl('/profiles/public'));
  }

  /**
   * Calls `GET /api/posts/mine` to list all posts authored by the signed-in user (including drafts/closed/archived).
   */
  listOwnPosts(): Observable<{ status: 'ok'; posts: FirestorePostDto[] }> {
    return this.http.get<{ status: 'ok'; posts: FirestorePostDto[] }>(
      this.apiConfig.buildEndpointUrl('/posts/mine')
    );
  }

  /**
   * Calls `POST /api/posts` to create or update a signed-in user's post in Cloud Firestore.
   */
  upsertOwnPost(payload: UpsertPostPayload): Observable<{
    status: 'ok';
    persisted: boolean;
    post: FirestorePostDto;
  }> {
    return this.http.post<{
      status: 'ok';
      persisted: boolean;
      post: FirestorePostDto;
    }>(this.apiConfig.buildEndpointUrl('/posts'), payload);
  }

  /**
   * Calls `PATCH /api/posts/:postId/lifecycle` to close/open a request, archive/restore an offer, or publish a draft.
   */
  updateOwnPostLifecycle(
    postId: string,
    lifecycleStatus: 'open' | 'closed' | 'active' | 'archived',
    publicationState?: 'draft' | 'published'
  ): Observable<{
    status: 'ok';
    persisted: boolean;
    post: FirestorePostDto;
  }> {
    return this.http.patch<{
      status: 'ok';
      persisted: boolean;
      post: FirestorePostDto;
    }>(this.apiConfig.buildEndpointUrl(`/posts/${encodeURIComponent(postId)}/lifecycle`), {
      lifecycleStatus,
      publicationState,
    });
  }

  /**
   * Waits for Firebase Authentication initialization to complete, checks `GET /api/health`,
   * and ONLY calls `GET /api/auth/me` if a Firebase user is currently signed in
   * (or if `forceUnauthenticatedRequest === true` is explicitly passed for a negative security test).
   */
  async runAuthIntegrationDiagnostic(
    forceUnauthenticatedRequest = false
  ): Promise<AuthIntegrationDiagnosticResult> {
    this.isTestingSignal.set(true);
    const testedAt = new Date().toISOString();
    const endpointTested = this.apiConfig.buildEndpointUrl('/auth/me');

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
