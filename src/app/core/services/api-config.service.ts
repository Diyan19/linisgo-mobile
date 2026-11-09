import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const ALLOWED_LOCAL_API_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

@Injectable({
  providedIn: 'root',
})
export class ApiConfigService {
  /**
   * Returns the effective base URL for the Private REST API.
   * Uses `/api` (proxied to `http://127.0.0.1:3001/api` in development)
   * so requests work both on localhost:3000 and over HTTPS preview hosts.
   */
  get baseUrl(): string {
    return environment.apiBaseUrl || '/api';
  }

  /**
   * Returns the direct local Node.js Express server base URL (`http://localhost:3001/api`).
   */
  get localDirectBaseUrl(): string {
    return environment.localDirectApiBaseUrl || 'http://localhost:3001/api';
  }

  /**
   * Builds a full endpoint URL for a relative API path (e.g. `/health` or `/auth/me`).
   */
  buildEndpointUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  /**
   * Security boundary check: determines whether a request URL belongs to our
   * Private REST API (`/api/*` or `http://localhost:3001/api/*`).
   * Ensures Firebase ID tokens are NEVER attached to third-party external URLs.
   */
  isPrivateApiUrl(url: string): boolean {
    if (!url) return false;
    const trimmed = url.trim();

    if (trimmed.startsWith('/api/') || trimmed === '/api') {
      return true;
    }

    try {
      const parsed = new URL(trimmed);
      const origin = `${parsed.protocol}//${parsed.host}`;
      const isLocalApiOrigin = ALLOWED_LOCAL_API_ORIGINS.includes(origin);
      const isSameOrigin =
        typeof window !== 'undefined' && window.location && origin === window.location.origin;

      return (
        (isLocalApiOrigin || isSameOrigin) &&
        (parsed.pathname.startsWith('/api/') || parsed.pathname === '/api')
      );
    } catch {
      return false;
    }
  }
}
