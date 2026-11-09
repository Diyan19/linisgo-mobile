import { Router } from 'express';
import { createFirestorePreparedControllers } from '../controllers/firestore-prepared.controller.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/require-admin.js';
import {
  defaultFirestoreRepositories,
  FirestoreRepositoryBundle,
} from '../repositories/firestore.repository.js';
import { defaultTokenVerifier } from '../services/auth-verification.service.js';
import {
  defaultFirestoreUserRestService,
  FirestoreUserRestService,
} from '../services/firestore-user-rest.service.js';
import { TokenVerifier } from '../types/auth.types.js';

export function createFirestorePreparedRouter(
  verifier: TokenVerifier = defaultTokenVerifier,
  repos: FirestoreRepositoryBundle = defaultFirestoreRepositories,
  userRestService: FirestoreUserRestService = defaultFirestoreUserRestService
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(verifier);
  const ctrl = createFirestorePreparedControllers(repos, userRestService);

  // Public discovery & schema readiness endpoints
  router.get('/locations', ctrl.getLocationsCatalog);
  router.get('/schema/status', (req, res, next) => {
    ctrl.getSchemaPreparationStatus(req, res).catch(next);
  });
  // Hardened in Task 1.2B Stage 2: Smoke test is strictly CLI-only and never publicly executable over HTTP
  router.all('/schema/smoke-test', (req, res, next) => {
    ctrl.rejectHttpSmokeTest(req, res).catch(next);
  });
  router.get('/profiles/public', (req, res, next) => {
    ctrl.listPublicProfiles(req, res).catch(next);
  });
  router.get('/posts', (req, res, next) => {
    ctrl.listPublicPosts(req, res).catch(next);
  });

  // Authenticated user profile & post endpoints (backed by Firestore v1 REST API with user ID token)
  router.get('/profiles/me', authenticate, (req, res, next) => {
    ctrl.getOwnProfile(req, res).catch(next);
  });
  router.put('/profiles/me', authenticate, (req, res, next) => {
    ctrl.updateOwnProfile(req, res).catch(next);
  });
  router.patch('/profiles/me/account-state', authenticate, (req, res, next) => {
    ctrl.updateOwnAccountState(req, res).catch(next);
  });
  router.get('/posts/mine', authenticate, (req, res, next) => {
    ctrl.listOwnPosts(req, res).catch(next);
  });
  router.get('/posts/:postId', (req, res, next) => {
    ctrl.getPostById(req, res).catch(next);
  });
  router.post('/posts', authenticate, (req, res, next) => {
    ctrl.createOrUpdatePost(req, res).catch(next);
  });
  router.patch('/posts/:postId/lifecycle', authenticate, (req, res, next) => {
    ctrl.updateOwnPostLifecycle(req, res).catch(next);
  });

  // Privileged server-only endpoints (safely gated until trusted Admin credentials are configured)
  router.post('/bookmarks/users/:targetUid', authenticate, (req, res, next) => {
    ctrl.saveUserBookmark(req, res).catch(next);
  });
  router.post('/bookmarks/posts/:postId', authenticate, (req, res, next) => {
    ctrl.savePostBookmark(req, res).catch(next);
  });
  router.post('/reports', authenticate, (req, res, next) => {
    ctrl.submitReport(req, res).catch(next);
  });
  router.post('/appeals', authenticate, (req, res, next) => {
    ctrl.submitAppeal(req, res).catch(next);
  });
  router.get('/notifications', authenticate, (req, res, next) => {
    ctrl.listOwnNotifications(req, res).catch(next);
  });

  // Administrator endpoints (protected by authenticate + requireAdmin)
  router.get('/admin/audit-logs', authenticate, requireAdmin, (req, res, next) => {
    ctrl.listAdminAuditLogs(req, res).catch(next);
  });

  return router;
}
