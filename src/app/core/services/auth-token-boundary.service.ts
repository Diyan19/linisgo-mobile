import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export interface AuthorizedRequestHeaders {
  Authorization: string;
  'Content-Type': string;
}

/**
 * Task 1.0 Preparation for Private REST API (Task 1.1 Boundary):
 * Provides a clean, reusable frontend token-acquisition interface so the upcoming
 * Node.js + Express backend can receive real Firebase ID tokens over HTTPS and verify
 * them using the Firebase Admin SDK on the server.
 *
 * Security Rules:
 * - Never hardcodes or mocks tokens.
 * - Never performs direct Firestore writes or privileged mutations in the frontend.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthTokenBoundaryService {
  private readonly authService = inject(AuthService);

  readonly apiBaseUrl = environment.apiBaseUrl;

  /**
   * Returns the current authenticated Firebase user's JWT ID token, or null if signed out.
   */
  async getBearerToken(forceRefresh = false): Promise<string | null> {
    return this.authService.getIdToken(forceRefresh);
  }

  /**
   * Builds standard HTTP headers containing `Authorization: Bearer <firebaseIdToken>`
   * for authenticated requests to the future Task 1.1 Private REST API.
   */
  async buildAuthorizedHeaders(forceRefresh = false): Promise<AuthorizedRequestHeaders | null> {
    const idToken = await this.getBearerToken(forceRefresh);
    if (!idToken) {
      return null;
    }
    return {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    };
  }
}
