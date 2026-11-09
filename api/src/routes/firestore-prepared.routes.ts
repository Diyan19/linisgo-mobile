import { Router } from 'express';
import { createFirestorePreparedControllers } from '../controllers/firestore-prepared.controller.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/require-admin.js';
import {
  defaultFirestoreRepositories,
  FirestoreRepositoryBundle,
} from '../repositories/firestore.repository.js';
import { defaultTokenVerifier } from '../services/auth-verification.service.js';
import { TokenVerifier } from '../types/auth.types.js';

export function createFirestorePreparedRouter(
  verifier: TokenVerifier = defaultTokenVerifier,
  repos: FirestoreRepositoryBundle = defaultFirestoreRepositories
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(verifier);
  const ctrl = createFirestorePreparedControllers(repos);

  // Public discovery & schema readiness endpoints
  router.get('/locations', ctrl.getLocationsCatalog);
  router.get('/schema/status', (req, res, next) => {
    ctrl.getSchemaPreparationStatus(req, res).catch(next);
  });
  // Hardened in Task 1.2B Stage 2: Smoke test is strictly CLI-only and never publicly executable over HTTP
  router.all('/schema/smoke-test', (req, res, next) => {
    ctrl.rejectHttpSmokeTest(req, res).catch(next);
  });
  router.get('/posts', (req, res, next) => {
    ctrl.listPublicPosts(req, res).catch(next);
  });

  // Authenticated user endpoints (validated first; gated by Firestore credentials until authorized)
  router.post('/posts', authenticate, (req, res, next) => {
    ctrl.createOrUpdatePost(req, res).catch(next);
  });
  router.put('/profiles/me', authenticate, (req, res, next) => {
    ctrl.updateOwnProfile(req, res).catch(next);
  });
  router.patch('/profiles/me/account-state', authenticate, (req, res, next) => {
    ctrl.updateOwnAccountState(req, res).catch(next);
  });
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
