import { NextFunction, Response } from 'express';
import { defaultTokenVerifier } from '../services/auth-verification.service.js';
import {
  ApiHttpError,
  AuthenticatedRequest,
  TokenVerifier,
} from '../types/auth.types.js';

/**
 * Extracts a strict Bearer token from the Authorization header.
 * Rejects missing headers, non-Bearer schemes, empty tokens, or tokens containing whitespace.
 */
export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    throw new ApiHttpError(
      'MISSING_AUTH_HEADER',
      'Authentication required. Missing Authorization header.',
      401
    );
  }

  const trimmed = authorizationHeader.trim();
  if (!trimmed.startsWith('Bearer ')) {
    throw new ApiHttpError(
      'INVALID_AUTH_SCHEME',
      'Invalid Authorization header format. Expected "Authorization: Bearer <FIREBASE_ID_TOKEN>".',
      401
    );
  }

  const token = trimmed.slice('Bearer '.length).trim();
  if (!token || /\s/.test(token)) {
    throw new ApiHttpError(
      'MALFORMED_BEARER_TOKEN',
      'Authorization Bearer token is empty or malformed.',
      401
    );
  }

  return token;
}

/**
 * Creates reusable Express authentication middleware.
 * Accepts an optional `TokenVerifier` for isolated unit testing with test doubles.
 */
export function createAuthenticateMiddleware(
  verifier: TokenVerifier = defaultTokenVerifier
) {
  return async function authenticateMiddleware(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawHeader = req.headers.authorization;
      const idToken = extractBearerToken(rawHeader);
      const verifiedIdentity = await verifier.verifyBearerToken(idToken);

      req.authenticatedUser = verifiedIdentity;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const authenticate = createAuthenticateMiddleware();
