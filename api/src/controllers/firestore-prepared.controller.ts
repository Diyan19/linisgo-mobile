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
  defaultFirestoreUserRestService,
  FirestoreUserRestService,
} from '../services/firestore-user-rest.service.js';
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
  DescriptiveProfileTag,
  PostLifecycleStatus,
  PostModerationStatus,
  PostPublicationState,
  PostType,
  UpdateProfileInput,
  UpsertPostInput,
} from '../types/firestore-schema.types.js';

export function createFirestorePreparedControllers(
  repos: FirestoreRepositoryBundle = defaultFirestoreRepositories,
  userRestService: FirestoreUserRestService = defaultFirestoreUserRestService
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
     * Reports Firestore schema preparation, database metadata, canonical top-level collections,
     * user-token REST transport status, and security trade-offs.
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
        firestoreUserTokenRestEnabled: true,
        firestoreSecurityTradeOff:
          'User-token Firestore REST requests are governed by Firestore Security Rules under request.auth.uid rather than privileged Admin SDK IAM credentials. This does not enforce an exclusive backend-only write boundary; firestore.rules independently enforces ownership, field allowlists, moderation locks, and account-state restrictions.',
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
          : 'Privileged Firebase Admin SDK server writes remain blocked in Google AI Studio because the hosting identity does not hold IAM roles on "linisgo-mobile". Core user profiles and posts use the authenticated Firestore v1 REST API governed by least-privilege firestore.rules.',
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
     * GET /api/profiles/me
     * Loads the signed-in user's publicProfile, privateProfile, accountState, and mapMarker.
     */
    async getOwnProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const adminReady = await repos.isFirestoreReady();

      if (adminReady) {
        const [publicProfile, privateProfile, accountState] = await Promise.all([
          repos.profiles.getPublicProfileByUid(user.uid),
          repos.profiles.getPrivateProfileByUid(user.uid),
          repos.accountStates.getAccountStateByUid(user.uid),
        ]);
        res.status(200).json({
          status: 'ok',
          transport: 'admin_sdk',
          publicProfile,
          privateProfile,
          accountState,
          mapMarker: null,
        });
        return;
      }

      if (!req.verifiedBearerToken) {
        throw new ApiHttpError(
          'FIRESTORE_CREDENTIALS_BLOCKED',
          'Missing verified Firebase user ID token for Firestore REST access.',
          503
        );
      }

      const bundle = await userRestService.getOwnProfileBundle(user.uid, req.verifiedBearerToken);
      res.status(200).json({
        status: 'ok',
        transport: 'firestore_user_rest',
        ...bundle,
      });
    },

    /**
     * GET /api/profiles/public
     * Lists publicly discoverable user profiles and opt-in approximate map markers.
     */
    async listPublicProfiles(_req: Request, res: Response): Promise<void> {
      const adminReady = await repos.isFirestoreReady();
      if (adminReady) {
        const profiles = await repos.profiles.listPublicProfiles();
        res.status(200).json({
          status: 'ok',
          transport: 'admin_sdk',
          profiles,
          mapMarkers: [],
        });
        return;
      }

      const [profiles, mapMarkers] = await Promise.all([
        userRestService.getPublicProfilesList(50),
        userRestService.getPublicMapMarkersList(50),
      ]);
      res.status(200).json({
        status: 'ok',
        transport: 'firestore_user_rest',
        profiles,
        mapMarkers,
      });
    },

    /**
     * PUT /api/profiles/me
     * Validates public/private profile split and independent opt-in map consent before persisting
     * via Admin SDK (if ready) or authenticated Firestore v1 REST API.
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

      const adminReady = await repos.isFirestoreReady();
      if (adminReady || !req.verifiedBearerToken) {
        const result = await repos.profiles.upsertUserProfile(
          validation.value.publicProfile,
          validation.value.privateProfile,
          validation.value.mapMarker
        );
        res.status(200).json({
          status: 'ok',
          persisted: true,
          transport: 'admin_sdk',
          ...result,
        });
        return;
      }

      const result = await userRestService.upsertOwnProfileBundle({
        uid: user.uid,
        bearerToken: req.verifiedBearerToken,
        publicProfile: validation.value.publicProfile,
        privateProfile: validation.value.privateProfile,
        mapMarker: validation.value.mapMarker,
      });
      res.status(200).json({
        status: 'ok',
        persisted: true,
        transport: 'firestore_user_rest',
        ...result,
      });
    },

    /**
     * GET /api/posts
     * Public post discovery endpoint with Oriental Mindoro location validation.
     */
    async listPublicPosts(req: Request, res: Response): Promise<void> {
      const postType = req.query['postType'] as PostType | undefined;
      const targetMunicipalityId = req.query['targetMunicipalityId'] as string | undefined;
      const coverageMunicipalityId = req.query['coverageMunicipalityId'] as string | undefined;
      const cleaningCategory = req.query['cleaningCategory'] as string | undefined;

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

      const adminReady = await repos.isFirestoreReady();
      if (adminReady) {
        const posts = await repos.posts.listPosts({
          postType,
          targetMunicipalityId,
          coverageMunicipalityId,
          cleaningCategory,
          includeNonPublicForOwnerOrAdmin: false,
        });
        res.status(200).json({ status: 'ok', transport: 'admin_sdk', posts });
        return;
      }

      const posts = await userRestService.listPublicPosts({
        postType,
        targetMunicipalityId,
        coverageMunicipalityId,
        cleaningCategory,
        limit: 50,
      });
      res.status(200).json({ status: 'ok', transport: 'firestore_user_rest', posts });
    },

    /**
     * GET /api/posts/mine
     * Lists all posts authored by the signed-in user (including drafts, closed requests, archived offers).
     */
    async listOwnPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const adminReady = await repos.isFirestoreReady();

      if (adminReady) {
        const posts = await repos.posts.listPosts({
          authorUid: user.uid,
          includeNonPublicForOwnerOrAdmin: true,
        });
        res.status(200).json({ status: 'ok', transport: 'admin_sdk', posts });
        return;
      }

      if (!req.verifiedBearerToken) {
        throw new ApiHttpError(
          'FIRESTORE_CREDENTIALS_BLOCKED',
          'Missing verified Firebase user ID token for Firestore REST access.',
          503
        );
      }

      const posts = await userRestService.listOwnPosts(user.uid, req.verifiedBearerToken, 50);
      res.status(200).json({ status: 'ok', transport: 'firestore_user_rest', posts });
    },

    /**
     * GET /api/posts/:postId
     * Fetches a single post by ID.
     */
    async getPostById(req: AuthenticatedRequest, res: Response): Promise<void> {
      const postId = String(req.params['postId'] || '').trim();
      if (!postId) {
        throw new ApiHttpError('VALIDATION_ERROR', 'postId is required.', 400);
      }

      const adminReady = await repos.isFirestoreReady();
      if (adminReady) {
        const post = await repos.posts.getPostById(postId);
        if (!post) {
          throw new ApiHttpError('NOT_FOUND', `Post "${postId}" was not found.`, 404);
        }
        res.status(200).json({ status: 'ok', transport: 'admin_sdk', post });
        return;
      }

      const post = await userRestService.getPostById(postId, req.verifiedBearerToken);
      if (!post) {
        throw new ApiHttpError('NOT_FOUND', `Post "${postId}" was not found.`, 404);
      }
      res.status(200).json({ status: 'ok', transport: 'firestore_user_rest', post });
    },

    /**
     * POST /api/posts
     * Validates Service Request / Service Offer / Draft schema first, then persists via Admin SDK
     * or authenticated Firestore v1 REST API.
     */
    async createOrUpdatePost(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const input = (req.body || {}) as UpsertPostInput & {
        authorDisplayName?: string;
        authorProfileTag?: DescriptiveProfileTag;
      };

      const effectiveAccountState: AccountLifecycleState = 'active';
      assertAccountStatePermitsAction(effectiveAccountState, 'publish_or_mutate');

      const authorProfileTag: DescriptiveProfileTag =
        input.authorProfileTag === 'provider' ? 'provider' : 'client';
      const authorDisplayName =
        (typeof input.authorDisplayName === 'string' && input.authorDisplayName.trim()) ||
        user.displayName ||
        'LinisGo User';

      const validation = validateAndBuildPostDocument({
        authorUid: user.uid,
        authorDisplayName,
        authorProfileTag,
        authorAccountState: effectiveAccountState,
        input,
      });

      if (!validation.valid || !validation.value) {
        throw new ApiHttpError('VALIDATION_ERROR', validation.errors.join(' '), 400);
      }

      const adminReady = await repos.isFirestoreReady();
      if (adminReady || !req.verifiedBearerToken) {
        const saved = await repos.posts.upsertPost(validation.value);
        res.status(201).json({
          status: 'ok',
          persisted: true,
          transport: 'admin_sdk',
          post: saved,
        });
        return;
      }

      const saved = await userRestService.upsertOwnPost({
        uid: user.uid,
        bearerToken: req.verifiedBearerToken,
        post: validation.value,
      });
      res.status(201).json({
        status: 'ok',
        persisted: true,
        transport: 'firestore_user_rest',
        post: saved,
      });
    },

    /**
     * PATCH /api/posts/:postId/lifecycle
     * Updates an owner's post lifecycle ('open' | 'closed' for Request; 'active' | 'archived' for Offer)
     * or publishes a draft ('publicationState': 'published').
     */
    async updateOwnPostLifecycle(req: AuthenticatedRequest, res: Response): Promise<void> {
      const user = requireVerifiedIdentity(req);
      const postId = String(req.params['postId'] || '').trim();
      const body = (req.body || {}) as {
        lifecycleStatus?: PostLifecycleStatus;
        publicationState?: PostPublicationState;
      };

      if (!postId || !body.lifecycleStatus) {
        throw new ApiHttpError(
          'VALIDATION_ERROR',
          'postId and lifecycleStatus are required.',
          400
        );
      }

      const adminReady = await repos.isFirestoreReady();
      if (adminReady || !req.verifiedBearerToken) {
        await repos.posts.updatePostLifecycle(
          postId,
          body.publicationState ?? 'published',
          body.lifecycleStatus,
          body.lifecycleStatus === 'open' || body.lifecycleStatus === 'active'
        );
        const updated = await repos.posts.getPostById(postId);
        res.status(200).json({
          status: 'ok',
          persisted: true,
          transport: 'admin_sdk',
          post: updated,
        });
        return;
      }

      const updated = await userRestService.updateOwnPostLifecycle({
        uid: user.uid,
        bearerToken: req.verifiedBearerToken,
        postId,
        publicationState: body.publicationState,
        lifecycleStatus: body.lifecycleStatus,
      });
      res.status(200).json({
        status: 'ok',
        persisted: true,
        transport: 'firestore_user_rest',
        post: updated,
      });
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
