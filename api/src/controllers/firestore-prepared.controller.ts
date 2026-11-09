import { Request, Response } from 'express';
import { envConfig } from '../config/env.js';
import { getFirebaseAdminDiagnostics } from '../config/firebase-admin.js';
import {
  isValidOrientalMindoroMunicipalityId,
  ORIENTAL_MINDORO_MUNICIPALITIES,
} from '../config/oriental-mindoro-locations.js';
import {
  assertAccountStatePermitsAction,
  isVerifiedAdminIdentity,
  requireVerifiedIdentity,
} from '../middleware/authorize-account.js';
import {
  defaultFirestoreRepositories,
  FIRESTORE_COLLECTIONS,
  FirestoreRepositoryBundle,
} from '../repositories/firestore.repository.js';
import {
  buildDeterministicSavedPostBookmark,
  buildDeterministicSavedUserBookmark,
  validateAccountStateTransition,
  validateAndBuildAppealDocument,
  validateAndBuildPostDocument,
  validateAndBuildReportDocument,
  validateAndSplitUserProfile,
} from '../services/schema-validation.service.js';
import { ApiHttpError, AuthenticatedRequest } from '../types/auth.types.js';
import {
  AccountLifecycleState,
  CreateAppealInput,
  CreateReportInput,
  PostModerationStatus,
  PostType,
  UpdateProfileInput,
  UpsertPostInput,
} from '../types/firestore-schema.types.js';

export function createFirestorePreparedControllers(
  repos: FirestoreRepositoryBundle = defaultFirestoreRepositories
) {
  return {
    /**
     * GET /api/locations
     * Returns the authoritative 15 Oriental Mindoro cities and municipalities catalog.
     */
    getLocationsCatalog(_req: Request, res: Response): void {
      res.status(200).json({
        status: 'ok',
        province: 'Oriental Mindoro',
        totalMunicipalities: ORIENTAL_MINDORO_MUNICIPALITIES.length,
        locations: repos.locations.listMunicipalities(),
      });
    },

    /**
     * GET /api/schema/status
     * Reports Task 1.2A & Task 1.2B Stage 2 Firestore schema preparation, database metadata,
     * canonical top-level collections, security rules, and credential status.
     */
    async getSchemaPreparationStatus(_req: Request, res: Response): Promise<void> {
      const [firestoreReady, diag] = await Promise.all([
        repos.isFirestoreReady(),
        getFirebaseAdminDiagnostics(),
      ]);
      res.status(200).json({
        status: 'ok',
        task: '1.2A',
        stage: '1.2B-stage-2',
        projectId: envConfig.firebaseProjectId,
        databaseId: envConfig.firestoreDatabaseId,
        firestoreLocation: envConfig.firestoreLocation,
        firestoreEdition: envConfig.firestoreEdition,
        firestoreMode: envConfig.firestoreMode,
        billingPlan: 'Spark Free Only',
        firestorePersistenceStatus: firestoreReady ? 'working' : 'blocked',
        firestoreReadProbeErrorCode: diag.firestoreReadProbeErrorCode,
        persistedWritesEnabled: firestoreReady,
        smokeTestAccessPolicy: {
          publicHttpEndpointEnabled: false,
          executionMode: 'local_developer_cli_only',
          cliCommand: 'npx tsx api/src/scripts/run-firestore-smoke-test.ts --allow-disposable-write',
        },
        collections: Object.values(FIRESTORE_COLLECTIONS),
        canonicalBookmarkModel: {
          savedUsersPath: '/savedUsers/{ownerUid}_{targetUid}',
          savedPostsPath: '/savedPosts/{ownerUid}_{postId}',
          duplicateSubcollectionsRemoved: true,
        },
        minimumRequiredIamRoles: {
          firestoreCrudOnly: ['roles/datastore.user'],
          localImpersonationUserRole: ['roles/iam.serviceAccountTokenCreator'],
          separatelyApprovedLaterAuthAdmin: ['roles/firebaseauth.admin'],
        },
        blockerExplanation: firestoreReady
          ? null
          : 'Cloud Firestore server operations remain BLOCKED in Google AI Studio because the hosting identity does not hold privileged IAM access to project "linisgo-mobile". Configure keyless Application Default Credentials with service-account impersonation locally on Windows to enable authorized Firestore access.',
      });
    },

    /**
     * POST /api/schema/smoke-test
     * Disabled over HTTP in Task 1.2B Stage 2 so privileged live smoke tests can never be
     * triggered from a browser or public network endpoint.
     */
    async rejectHttpSmokeTest(_req: Request, _res: Response): Promise<void> {
      throw new ApiHttpError(
        'FORBIDDEN_SMOKE_TEST_CLI_ONLY',
        'Privileged Firestore smoke tests are disabled over HTTP. Execute the local developer CLI command "npx tsx api/src/scripts/run-firestore-smoke-test.ts --allow-disposable-write" on a trusted local workstation.',
        403
      );
    },

    /**
     * GET /api/posts
     * Public post discovery endpoint with Oriental Mindoro location validation.
     */
    async listPublicPosts(req: Request, res: Response): Promise<void> {
      const postType = req.query['postType'] as PostType | undefined;
      const targetMunicipalityId = req.query['targetMunicipalityId'] as string | undefined;
      const coverageMunicipalityId = req.query['coverageMunicipalityId'] as string | undefined;

      if (postType && postType !== 'request' && postType !== 'offer') {
        throw new ApiHttpError(
          'VALIDATION_ERROR',
          'postType filter must be either "request" or "offer".',
          400
        );
      }

      if (targetMunicipalityId && !isValidOrientalMindoroMunicipalityId(targetMunicipalityId)) {
        throw new ApiHttpError(
          'VALIDATION_ERROR',
          `Unknown Oriental Mindoro municipality identifier: "${targetMunicipalityId}".`,
          400
        );
      }
      if (coverageMunicipalityId && !isValidOrientalMindoroMunicipalityId(coverageMunicipalityId)) {
        throw new ApiHttpError(
          'VALIDATION_ERROR',
          `Unknown Oriental Mindoro coverage municipality identifier: "${coverageMunicipalityId}".`,
          400
        );
      }

      const posts = await repos.posts.listPosts({
        postType,
        targetMunicipalityId,
        coverageMunicipalityId,
        includeNonPublicForOwnerOrAdmin: false,
      });
      res.status(200).json({ status: 'ok', posts });
    },

    /**
     * POST /api/posts
     * Validates Service Request / Service Offer / Draft schema first, then delegates to Firestore repository.
     */
    async createOrUpdatePost(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const input = (req.body || {}) as UpsertPostInput & {
        simulatedAccountState?: AccountLifecycleState;
      };

      const effectiveAccountState: AccountLifecycleState = 'active';
      assertAccountStatePermitsAction(effectiveAccountState, 'publish_or_mutate');

      const validation = validateAndBuildPostDocument({
        authorUid: user.uid,
        authorDisplayName: user.displayName || 'LinisGo User',
        authorProfileTag: 'client',
        authorAccountState: effectiveAccountState,
        input,
      });

      if (!validation.valid || !validation.value) {
        throw new ApiHttpError('VALIDATION_ERROR', validation.errors.join(' '), 400);
      }

      const saved = await repos.posts.upsertPost(validation.value);
      res.status(201).json({ status: 'ok', persisted: true, post: saved });
    },

    /**
     * PUT /api/profiles/me
     * Validates public/private profile split and independent opt-in map consent before calling Firestore repository.
     */
    async updateOwnProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const input = (req.body || {}) as UpdateProfileInput;

      const validation = validateAndSplitUserProfile({
        uid: user.uid,
        registrationEmail: user.email || '',
        emailVerified: user.emailVerified,
        accountState: 'active',
        input,
      });

      if (!validation.valid || !validation.value) {
        throw new ApiHttpError('VALIDATION_ERROR', validation.errors.join(' '), 400);
      }

      const result = await repos.profiles.upsertUserProfile(
        validation.value.publicProfile,
        validation.value.privateProfile,
        validation.value.mapMarker
      );
      res.status(200).json({ status: 'ok', persisted: true, ...result });
    },

    /**
     * PATCH /api/profiles/me/account-state
     * Validates self-managed account state transition (blocks suspended users from reactivating themselves).
     */
    async updateOwnAccountState(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const body = (req.body || {}) as {
        currentState?: AccountLifecycleState;
        requestedState?: AccountLifecycleState;
      };

      const currentState: AccountLifecycleState = body.currentState || 'active';
      const requestedState = body.requestedState;

      if (!requestedState) {
        throw new ApiHttpError('VALIDATION_ERROR', 'requestedState is required.', 400);
      }

      const actorIsAdmin = isVerifiedAdminIdentity(user);
      const transition = validateAccountStateTransition({
        actorUid: user.uid,
        actorIsAdmin,
        targetUid: user.uid,
        currentState,
        requestedState,
      });

      if (!transition.valid || !transition.value) {
        const isSuspendedBlock = currentState === 'suspended' && !actorIsAdmin;
        throw new ApiHttpError(
          isSuspendedBlock ? 'FORBIDDEN_ACCOUNT_SUSPENDED' : 'VALIDATION_ERROR',
          transition.errors.join(' '),
          isSuspendedBlock ? 403 : 400
        );
      }

      const updated = await repos.accountStates.upsertAccountState(
        transition.value,
        undefined,
        actorIsAdmin
      );
      res.status(200).json({ status: 'ok', persisted: true, accountState: updated });
    },

    /**
     * POST /api/bookmarks/users/:targetUid
     * Validates deterministic savedUser bookmark creation in canonical `/savedUsers/{ownerUid}_{targetUid}`.
     */
    async saveUserBookmark(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const targetUid = String(req.params['targetUid'] || '').trim();

      const validation = buildDeterministicSavedUserBookmark({
        ownerUid: user.uid,
        targetUid,
      });
      if (!validation.valid || !validation.value) {
        throw new ApiHttpError('VALIDATION_ERROR', validation.errors.join(' '), 400);
      }

      const saved = await repos.bookmarks.saveUser(validation.value);
      res.status(201).json({ status: 'ok', persisted: true, bookmark: saved });
    },

    /**
     * POST /api/bookmarks/posts/:postId
     * Validates deterministic savedPost bookmark creation in canonical `/savedPosts/{ownerUid}_{postId}`.
     */
    async savePostBookmark(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const postId = String(req.params['postId'] || '').trim();

      const validation = buildDeterministicSavedPostBookmark({
        ownerUid: user.uid,
        postId,
      });
      if (!validation.valid || !validation.value) {
        throw new ApiHttpError('VALIDATION_ERROR', validation.errors.join(' '), 400);
      }

      const saved = await repos.bookmarks.savePost(validation.value);
      res.status(201).json({ status: 'ok', persisted: true, bookmark: saved });
    },

    /**
     * POST /api/reports
     * Validates report input using approved workflow status ('pending') before delegating to Firestore repository.
     */
    async submitReport(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const input = (req.body || {}) as CreateReportInput;

      const validation = validateAndBuildReportDocument({
        reporterUid: user.uid,
        input,
      });
      if (!validation.valid || !validation.value) {
        throw new ApiHttpError('VALIDATION_ERROR', validation.errors.join(' '), 400);
      }

      const created = await repos.reports.createReport(validation.value);
      res.status(201).json({ status: 'ok', persisted: true, report: created });
    },

    /**
     * POST /api/appeals
     * Validates appeal input for either 'account_suspension' or 'post_hidden'
     * and guarantees moderation is never automatically reversed upon submission.
     */
    async submitAppeal(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const body = (req.body || {}) as CreateAppealInput & {
        currentAccountState?: AccountLifecycleState;
        currentPostModerationStatus?: PostModerationStatus;
      };

      const targetModerationAction = body.targetModerationAction || 'account_suspension';
      const currentAccountState: AccountLifecycleState =
        body.currentAccountState ||
        (targetModerationAction === 'account_suspension' ? 'suspended' : 'active');

      assertAccountStatePermitsAction(
        currentAccountState,
        'submit_appeal',
        targetModerationAction
      );

      const validation = validateAndBuildAppealDocument({
        appellantUid: user.uid,
        currentAccountState,
        currentPostModerationStatus: body.currentPostModerationStatus,
        postAuthorUid: user.uid,
        input: {
          targetModerationAction,
          targetId:
            body.targetId || (targetModerationAction === 'account_suspension' ? user.uid : ''),
          moderationReferenceId: body.moderationReferenceId,
          reason: body.reason,
        },
      });
      if (!validation.valid || !validation.value) {
        throw new ApiHttpError('VALIDATION_ERROR', validation.errors.join(' '), 400);
      }

      const created = await repos.appeals.createAppeal(validation.value.appeal);
      res.status(201).json({
        status: 'ok',
        persisted: true,
        appeal: created,
        accountStateAfterSubmission: validation.value.accountStateAfterSubmission,
        postModerationStatusAfterSubmission:
          validation.value.postModerationStatusAfterSubmission,
      });
    },

    /**
     * GET /api/notifications
     * Lists in-app notifications for the authenticated user.
     */
    async listOwnNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const items = await repos.notifications.listUserNotifications(user.uid);
      res.status(200).json({ status: 'ok', notifications: items });
    },

    /**
     * GET /api/admin/audit-logs
     * Protected by `authenticate` + `requireAdmin`.
     */
    async listAdminAuditLogs(_req: AuthenticatedRequest, res: Response): Promise<void> {
      const logs = await repos.adminAuditLogs.listAuditLogs(50);
      res.status(200).json({ status: 'ok', auditLogs: logs });
    },
  };
}
