import { Router } from 'express';
import { getAuthenticatedUserMe } from '../controllers/auth.controller.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { defaultTokenVerifier } from '../services/auth-verification.service.js';
import { AuthenticatedRequest, TokenVerifier } from '../types/auth.types.js';

export function createAuthRouter(verifier: TokenVerifier = defaultTokenVerifier): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(verifier);

  // GET /api/auth/me — Protected regular user identity endpoint
  router.get('/me', authenticate, getAuthenticatedUserMe);

  // GET /api/auth/admin-check — Prepared administrator security boundary (Task 1.1 Section 8)
  router.get('/admin-check', authenticate, requireAdmin, (req: AuthenticatedRequest, res) => {
    res.status(200).json({
      status: 'ok',
      adminAuthorized: true,
      uid: req.authenticatedUser?.uid,
    });
  });

  return router;
}

export const authRouter = createAuthRouter();
