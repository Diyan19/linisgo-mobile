import { Filter, Firestore } from 'firebase-admin/firestore';
import {
  getFirebaseAdminDiagnostics,
  getFirebaseAdminFirestore,
} from '../config/firebase-admin.js';
import {
  ORIENTAL_MINDORO_MUNICIPALITIES,
  OrientalMindoroMunicipalityRecord,
} from '../config/oriental-mindoro-locations.js';
import { computePostPublicVisibility } from '../services/schema-validation.service.js';
import { ApiHttpError } from '../types/auth.types.js';
import {
  AccountStateDocument,
  AdminAuditLogDocument,
  AppealDocument,
  AppealWorkflowStatus,
  NotificationDocument,
  PostDocument,
  PostLifecycleStatus,
  PostModerationStatus,
  PostPublicationState,
  PostType,
  PrivateProfileDocument,
  PublicMapMarkerDocument,
  PublicProfileDocument,
  ReportDocument,
  ReportWorkflowStatus,
  ResolvedSavedPostView,
  ResolvedSavedUserView,
  SavedPostDocument,
  SavedUserDocument,
} from '../types/firestore-schema.types.js';

/**
 * Firestore enforces a hard limit of 500 document writes per transaction/batch.
 * Reserving 50 writes for accountState, publicProfile, publicMapMarker, and adminAuditLog
 * leaves a safe per-transaction post update ceiling of 450 documents.
 */
export const MAX_TRANSACTION_POST_UPDATES = 450;

/**
 * Canonical 11 Top-Level Firestore Collections.
 */
export const FIRESTORE_COLLECTIONS = {
  PUBLIC_PROFILES: 'publicProfiles',
  PRIVATE_PROFILES: 'privateProfiles',
  ACCOUNT_STATES: 'accountStates',
  POSTS: 'posts',
  SAVED_USERS: 'savedUsers',
  SAVED_POSTS: 'savedPosts',
  REPORTS: 'reports',
  APPEALS: 'appeals',
  NOTIFICATIONS: 'notifications',
  PUBLIC_MAP_MARKERS: 'publicMapMarkers',
  ADMIN_AUDIT_LOGS: 'adminAuditLogs',
} as const;

export interface ProfilesRepository {
  getPublicProfileByUid(uid: string): Promise<PublicProfileDocument | null>;
  listPublicProfiles(serviceAreaMunicipalityId?: string): Promise<PublicProfileDocument[]>;
  getPrivateProfileByUid(uid: string): Promise<PrivateProfileDocument | null>;
  upsertUserProfile(
    publicProfile: PublicProfileDocument,
    privateProfile: PrivateProfileDocument,
    mapMarker: PublicMapMarkerDocument | null
  ): Promise<{ publicProfile: PublicProfileDocument; privateProfile: PrivateProfileDocument }>;
}

export interface AccountStatesRepository {
  getAccountStateByUid(uid: string): Promise<AccountStateDocument | null>;
  upsertAccountState(
    accountState: AccountStateDocument,
    auditLog?: AdminAuditLogDocument,
    actorIsAdmin?: boolean
  ): Promise<AccountStateDocument>;
}

export interface PostsQueryFilter {
  postType?: PostType;
  cleaningCategory?: string;
  targetMunicipalityId?: string;
  coverageMunicipalityId?: string;
  authorUid?: string;
  includeNonPublicForOwnerOrAdmin?: boolean;
  limit?: number;
}

/**
 * Describes the reconciled Firestore query predicates for public post discovery,
 * including the explicit OR predicate for Request (`open`) and Offer (`active`) lifecycles.
 */
export interface ReconciledPublicPostsQueryPlan {
  isPublicDiscovery: boolean;
  requiredEqualityFilters: Record<string, string | boolean>;
  lifecyclePredicateMode:
    | 'single_request_open'
    | 'single_offer_active'
    | 'composite_or_request_open_offer_active'
    | 'owner_or_admin_unrestricted';
  satisfiesFirestoreSecurityRules: boolean;
}

export function buildPublicPostsQueryPlan(filter: PostsQueryFilter): ReconciledPublicPostsQueryPlan {
  if (filter.includeNonPublicForOwnerOrAdmin) {
    return {
      isPublicDiscovery: false,
      requiredEqualityFilters: filter.authorUid ? { authorUid: filter.authorUid } : {},
      lifecyclePredicateMode: 'owner_or_admin_unrestricted',
      satisfiesFirestoreSecurityRules: false,
    };
  }

  const baseFilters: Record<string, string | boolean> = {
    publicVisible: true,
    publicationState: 'published',
    moderationStatus: 'none',
    authorAccountState: 'active',
  };

  if (filter.postType === 'request') {
    return {
      isPublicDiscovery: true,
      requiredEqualityFilters: {
        ...baseFilters,
        postType: 'request',
        lifecycleStatus: 'open',
      },
      lifecyclePredicateMode: 'single_request_open',
      satisfiesFirestoreSecurityRules: true,
    };
  }

  if (filter.postType === 'offer') {
    return {
      isPublicDiscovery: true,
      requiredEqualityFilters: {
        ...baseFilters,
        postType: 'offer',
        lifecycleStatus: 'active',
      },
      lifecyclePredicateMode: 'single_offer_active',
      satisfiesFirestoreSecurityRules: true,
    };
  }

  return {
    isPublicDiscovery: true,
    requiredEqualityFilters: baseFilters,
    lifecyclePredicateMode: 'composite_or_request_open_offer_active',
    satisfiesFirestoreSecurityRules: true,
  };
}

/**
 * Pure helper computing the atomic visibility cascade across an account's public profile,
 * map marker, and authored posts whenever an account state changes (e.g., suspended or deactivated).
 *
 * Transaction Safety Guarantees:
 * 1. Enforces authoritative stored account state so a non-admin cannot bypass an existing
 *    `'suspended'` state in Firestore even if they supply a forged `currentState: 'active'`.
 * 2. Chunks post updates into safe slices of at most `MAX_TRANSACTION_POST_UPDATES` (450)
 *    to respect Firestore's 500-write transaction limit.
 * 3. Guarantees that when an account is non-active, every post's `publicVisible` is forced `false`.
 */
export function computeAccountStateVisibilityCascade(params: {
  accountState: AccountStateDocument;
  storedAccountState?: AccountStateDocument | null;
  actorIsAdmin?: boolean;
  existingProfile: PublicProfileDocument | null;
  existingMarker: PublicMapMarkerDocument | null;
  existingPosts: PostDocument[];
  maxPostsPerTransaction?: number;
}): {
  updatedProfilePatch: Partial<PublicProfileDocument> | null;
  updatedMarkerPatch: Partial<PublicMapMarkerDocument> | null;
  updatedPostPatches: Array<{
    postId: string;
    authorAccountState: AccountStateDocument['state'];
    publicVisible: boolean;
    updatedAt: string;
  }>;
  overflowPostChunks: Array<
    Array<{
      postId: string;
      authorAccountState: AccountStateDocument['state'];
      publicVisible: boolean;
      updatedAt: string;
    }>
  >;
  requiresFollowUpChunks: boolean;
} {
  const actorIsAdmin = Boolean(params.actorIsAdmin);
  const storedState = params.storedAccountState?.state;

  // Fail-closed server check: if the stored Firestore state is 'suspended' and actor is not admin, abort!
  if (storedState === 'suspended' && !actorIsAdmin) {
    throw new ApiHttpError(
      'FORBIDDEN_ACCOUNT_SUSPENDED',
      'Stored account state is suspended. Suspended accounts cannot self-reactivate or bypass administrative restrictions.',
      403
    );
  }

  if (
    (storedState === 'pending_deletion' ||
      storedState === 'deletion_processing' ||
      storedState === 'deleted') &&
    !actorIsAdmin
  ) {
    throw new ApiHttpError(
      'FORBIDDEN_ACCOUNT_DELETION_PENDING',
      'Stored account is undergoing permanent deletion and cannot be modified by the user.',
      403
    );
  }

  const isActive = params.accountState.state === 'active';
  const nowIso = params.accountState.updatedAt;
  const chunkLimit = params.maxPostsPerTransaction ?? MAX_TRANSACTION_POST_UPDATES;

  const updatedProfilePatch: Partial<PublicProfileDocument> | null = params.existingProfile
    ? {
        authorAccountState: params.accountState.state,
        visibilityState: isActive ? 'public' : 'hidden',
        publicVisible: isActive,
        updatedAt: nowIso,
      }
    : null;

  const updatedMarkerPatch: Partial<PublicMapMarkerDocument> | null = params.existingMarker
    ? {
        authorAccountState: params.accountState.state,
        publicVisible: isActive && Boolean(params.existingMarker.mapConsent),
        updatedAt: nowIso,
      }
    : null;

  const allPostPatches = params.existingPosts.map(post => ({
    postId: post.id,
    authorAccountState: params.accountState.state,
    publicVisible: computePostPublicVisibility({
      postType: post.postType,
      publicationState: post.publicationState,
      lifecycleStatus: post.lifecycleStatus,
      moderationStatus: post.moderationStatus,
      authorAccountState: params.accountState.state,
    }),
    updatedAt: nowIso,
  }));

  const updatedPostPatches = allPostPatches.slice(0, chunkLimit);
  const overflowPostChunks: Array<typeof updatedPostPatches> = [];

  for (let i = chunkLimit; i < allPostPatches.length; i += chunkLimit) {
    overflowPostChunks.push(allPostPatches.slice(i, i + chunkLimit));
  }

  return {
    updatedProfilePatch,
    updatedMarkerPatch,
    updatedPostPatches,
    overflowPostChunks,
    requiresFollowUpChunks: overflowPostChunks.length > 0,
  };
}

/**
 * Enforces that a client-side post upsert or lifecycle change cannot overwrite
 * an existing administrative moderation restriction (`hidden`, `removed`, `flagged`)
 * or publish while the author's stored account state is not `'active'`.
 */
export function reconcilePostMutationWithStoredAuthority(params: {
  incomingPost: PostDocument;
  storedPost: PostDocument | null;
  storedAccountState: AccountStateDocument | null;
  actorUid: string;
  actorIsAdmin?: boolean;
}): PostDocument {
  const actorIsAdmin = Boolean(params.actorIsAdmin);
  const authoritativeAccountState =
    params.storedAccountState?.state ?? params.incomingPost.authorAccountState;

  if (authoritativeAccountState !== 'active' && !actorIsAdmin) {
    throw new ApiHttpError(
      authoritativeAccountState === 'suspended'
        ? 'FORBIDDEN_ACCOUNT_SUSPENDED'
        : 'FORBIDDEN_ACCOUNT_NOT_ACTIVE',
      `Account is currently "${authoritativeAccountState}" and cannot publish or mutate posts.`,
      403
    );
  }

  if (params.storedPost && params.storedPost.authorUid !== params.actorUid && !actorIsAdmin) {
    throw new ApiHttpError(
      'FORBIDDEN_NOT_OWNER',
      'You cannot modify a post authored by another user.',
      403
    );
  }

  // Preserve authoritative server-side moderationStatus & moderationReferenceId unless actor is admin
  const authoritativeModerationStatus: PostModerationStatus =
    !actorIsAdmin && params.storedPost
      ? params.storedPost.moderationStatus
      : params.incomingPost.moderationStatus;

  const authoritativeModerationRef: string | null =
    !actorIsAdmin && params.storedPost
      ? params.storedPost.moderationReferenceId
      : params.incomingPost.moderationReferenceId;

  const recomputedPublicVisible = computePostPublicVisibility({
    postType: params.incomingPost.postType,
    publicationState: params.incomingPost.publicationState,
    lifecycleStatus: params.incomingPost.lifecycleStatus,
    moderationStatus: authoritativeModerationStatus,
    authorAccountState: authoritativeAccountState,
  });

  return {
    ...params.incomingPost,
    authorAccountState: authoritativeAccountState,
    moderationStatus: authoritativeModerationStatus,
    moderationReferenceId: authoritativeModerationRef,
    publicVisible: recomputedPublicVisible,
  };
}

export interface PostsRepository {
  listPosts(filter: PostsQueryFilter): Promise<PostDocument[]>;
  getPostById(postId: string): Promise<PostDocument | null>;
  upsertPost(post: PostDocument): Promise<PostDocument>;
  updatePostLifecycle(
    postId: string,
    publicationState: PostPublicationState,
    lifecycleStatus: PostLifecycleStatus,
    publicVisible: boolean
  ): Promise<void>;
  updatePostModeration(
    postId: string,
    moderationStatus: PostModerationStatus,
    moderationReferenceId: string | null,
    publicVisible: boolean,
    auditLog: AdminAuditLogDocument
  ): Promise<void>;
  deletePost(postId: string): Promise<void>;
}

export interface BookmarksRepository {
  listSavedUsers(ownerUid: string): Promise<ResolvedSavedUserView[]>;
  saveUser(bookmark: SavedUserDocument): Promise<SavedUserDocument>;
  unsaveUser(ownerUid: string, targetUid: string): Promise<void>;
  listSavedPosts(ownerUid: string): Promise<ResolvedSavedPostView[]>;
  savePost(bookmark: SavedPostDocument): Promise<SavedPostDocument>;
  unsavePost(ownerUid: string, postId: string): Promise<void>;
}

export interface LocationsRepository {
  listMunicipalities(): readonly OrientalMindoroMunicipalityRecord[];
}

export interface MapMarkersRepository {
  listPublicMapMarkers(municipalityId?: string): Promise<PublicMapMarkerDocument[]>;
  upsertMapMarker(uid: string, marker: PublicMapMarkerDocument | null): Promise<void>;
}

export interface ReportsRepository {
  createReport(report: ReportDocument): Promise<ReportDocument>;
  listReportsByStatus(status?: ReportWorkflowStatus): Promise<ReportDocument[]>;
  updateReportDecision(
    reportId: string,
    status: ReportWorkflowStatus,
    decision: NonNullable<ReportDocument['adminDecision']>,
    auditLog: AdminAuditLogDocument
  ): Promise<void>;
}

export interface AppealsRepository {
  createAppeal(appeal: AppealDocument): Promise<AppealDocument>;
  listAppealsByUser(appellantUid: string): Promise<AppealDocument[]>;
  listAppealsByStatus(status?: AppealWorkflowStatus): Promise<AppealDocument[]>;
  updateAppealDecision(
    appealId: string,
    status: AppealWorkflowStatus,
    decision: NonNullable<AppealDocument['decisionDetails']>,
    auditLog: AdminAuditLogDocument
  ): Promise<void>;
}

export interface NotificationsRepository {
  listUserNotifications(recipientUid: string): Promise<NotificationDocument[]>;
  markNotificationRead(recipientUid: string, notificationId: string): Promise<void>;
  createNotification(notification: NotificationDocument): Promise<NotificationDocument>;
}

export interface AdminAuditLogsRepository {
  appendAuditLog(log: AdminAuditLogDocument): Promise<AdminAuditLogDocument>;
  listAuditLogs(limit?: number): Promise<AdminAuditLogDocument[]>;
}

export interface FirestoreRepositoryBundle {
  isFirestoreReady(): Promise<boolean>;
  readonly locations: LocationsRepository;
  readonly profiles: ProfilesRepository;
  readonly accountStates: AccountStatesRepository;
  readonly posts: PostsRepository;
  readonly bookmarks: BookmarksRepository;
  readonly mapMarkers: MapMarkersRepository;
  readonly reports: ReportsRepository;
  readonly appeals: AppealsRepository;
  readonly notifications: NotificationsRepository;
  readonly adminAuditLogs: AdminAuditLogsRepository;
}

async function requireAuthorizedFirestoreInstance(): Promise<Firestore> {
  const diag = await getFirebaseAdminDiagnostics();
  if (
    diag.firestoreServerOperations !== 'working' ||
    !diag.credentialsAvailable ||
    !diag.connectionValidated
  ) {
    throw new ApiHttpError(
      'FIRESTORE_CREDENTIALS_BLOCKED',
      'Cloud Firestore server operations on "(default)" in project "linisgo-mobile" are BLOCKED until trusted backend credentials (e.g., keyless ADC with service-account impersonation and roles/datastore.user) are configured. No Firestore data was read or written.',
      503
    );
  }
  return getFirebaseAdminFirestore();
}

export class FirebaseAdminRepositoryBundle implements FirestoreRepositoryBundle {
  async isFirestoreReady(): Promise<boolean> {
    const diag = await getFirebaseAdminDiagnostics();
    return (
      diag.firestoreServerOperations === 'working' &&
      diag.credentialsAvailable &&
      diag.connectionValidated
    );
  }

  readonly locations: LocationsRepository = {
    listMunicipalities(): readonly OrientalMindoroMunicipalityRecord[] {
      return ORIENTAL_MINDORO_MUNICIPALITIES;
    },
  };

  readonly profiles: ProfilesRepository = {
    async getPublicProfileByUid(uid: string): Promise<PublicProfileDocument | null> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db.collection(FIRESTORE_COLLECTIONS.PUBLIC_PROFILES).doc(uid).get();
      if (!snap.exists) return null;
      const data = snap.data() as PublicProfileDocument;
      return data.publicVisible &&
        data.visibilityState === 'public' &&
        data.authorAccountState === 'active'
        ? data
        : null;
    },

    async listPublicProfiles(serviceAreaMunicipalityId?: string): Promise<PublicProfileDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      let query: FirebaseFirestore.Query = db
        .collection(FIRESTORE_COLLECTIONS.PUBLIC_PROFILES)
        .where('publicVisible', '==', true)
        .where('visibilityState', '==', 'public')
        .where('authorAccountState', '==', 'active');

      if (serviceAreaMunicipalityId) {
        query = query.where(
          'serviceAreaMunicipalityIds',
          'array-contains',
          serviceAreaMunicipalityId
        );
      }

      const snap = await query.orderBy('updatedAt', 'desc').limit(50).get();
      return snap.docs.map(d => d.data() as PublicProfileDocument);
    },

    async getPrivateProfileByUid(uid: string): Promise<PrivateProfileDocument | null> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db.collection(FIRESTORE_COLLECTIONS.PRIVATE_PROFILES).doc(uid).get();
      return snap.exists ? (snap.data() as PrivateProfileDocument) : null;
    },

    async upsertUserProfile(
      publicProfile: PublicProfileDocument,
      privateProfile: PrivateProfileDocument,
      mapMarker: PublicMapMarkerDocument | null
    ): Promise<{ publicProfile: PublicProfileDocument; privateProfile: PrivateProfileDocument }> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.runTransaction(async tx => {
        const stateRef = db
          .collection(FIRESTORE_COLLECTIONS.ACCOUNT_STATES)
          .doc(publicProfile.uid);
        const pubRef = db.collection(FIRESTORE_COLLECTIONS.PUBLIC_PROFILES).doc(publicProfile.uid);
        const privRef = db
          .collection(FIRESTORE_COLLECTIONS.PRIVATE_PROFILES)
          .doc(privateProfile.uid);
        const markerRef = db
          .collection(FIRESTORE_COLLECTIONS.PUBLIC_MAP_MARKERS)
          .doc(publicProfile.uid);

        // Phase 1: All reads before writes
        const stateSnap = await tx.get(stateRef);
        const storedState = stateSnap.exists
          ? (stateSnap.data() as AccountStateDocument).state
          : 'active';

        if (storedState !== 'active') {
          throw new ApiHttpError(
            storedState === 'suspended'
              ? 'FORBIDDEN_ACCOUNT_SUSPENDED'
              : 'FORBIDDEN_ACCOUNT_NOT_ACTIVE',
            `Profile updates are blocked while account state is "${storedState}".`,
            403
          );
        }

        // Phase 2: All writes
        tx.set(pubRef, publicProfile, { merge: true });
        tx.set(privRef, privateProfile, { merge: true });
        if (mapMarker && mapMarker.publicVisible && mapMarker.mapConsent) {
          tx.set(markerRef, mapMarker, { merge: true });
        } else {
          tx.delete(markerRef);
        }
      });
      return { publicProfile, privateProfile };
    },
  };

  readonly accountStates: AccountStatesRepository = {
    async getAccountStateByUid(uid: string): Promise<AccountStateDocument | null> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db.collection(FIRESTORE_COLLECTIONS.ACCOUNT_STATES).doc(uid).get();
      return snap.exists ? (snap.data() as AccountStateDocument) : null;
    },

    /**
     * Transaction-safe Account State & Visibility Cascade:
     * 1. Executes all `tx.get(...)` reads strictly before any write.
     * 2. Verifies authoritative stored `AccountStateDocument` inside the transaction so a client
     *    cannot bypass an administrative suspension.
     * 3. Updates up to `MAX_TRANSACTION_POST_UPDATES` (450) posts inside the primary transaction.
     * 4. If the author has more than 450 posts, processes remaining chunks in bounded batches of 450
     *    and performs a final verification query ensuring 0 publicly visible posts remain when
     *    the account is non-active (failing closed if any remain).
     */
    async upsertAccountState(
      accountState: AccountStateDocument,
      auditLog?: AdminAuditLogDocument,
      actorIsAdmin = false
    ): Promise<AccountStateDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      let overflowChunks: Array<
        Array<{
          postId: string;
          authorAccountState: AccountStateDocument['state'];
          publicVisible: boolean;
          updatedAt: string;
        }>
      > = [];

      await db.runTransaction(async tx => {
        const stateRef = db
          .collection(FIRESTORE_COLLECTIONS.ACCOUNT_STATES)
          .doc(accountState.uid);
        const pubRef = db
          .collection(FIRESTORE_COLLECTIONS.PUBLIC_PROFILES)
          .doc(accountState.uid);
        const markerRef = db
          .collection(FIRESTORE_COLLECTIONS.PUBLIC_MAP_MARKERS)
          .doc(accountState.uid);
        const authorPostsQuery = db
          .collection(FIRESTORE_COLLECTIONS.POSTS)
          .where('authorUid', '==', accountState.uid);

        // Phase 1: ALL transaction reads MUST happen before any transaction writes
        const [storedStateSnap, pubSnap, markerSnap, postsSnap] = await Promise.all([
          tx.get(stateRef),
          tx.get(pubRef),
          tx.get(markerRef),
          tx.get(authorPostsQuery),
        ]);

        const storedAccountState = storedStateSnap.exists
          ? (storedStateSnap.data() as AccountStateDocument)
          : null;
        const existingProfile = pubSnap.exists
          ? (pubSnap.data() as PublicProfileDocument)
          : null;
        const existingMarker = markerSnap.exists
          ? (markerSnap.data() as PublicMapMarkerDocument)
          : null;
        const existingPosts = postsSnap.docs.map(d => d.data() as PostDocument);

        const cascade = computeAccountStateVisibilityCascade({
          accountState,
          storedAccountState,
          actorIsAdmin,
          existingProfile,
          existingMarker,
          existingPosts,
          maxPostsPerTransaction: MAX_TRANSACTION_POST_UPDATES,
        });

        overflowChunks = cascade.overflowPostChunks;

        // Phase 2: All writes within the 500-write transaction ceiling
        tx.set(stateRef, accountState, { merge: true });

        if (cascade.updatedProfilePatch) {
          tx.set(pubRef, cascade.updatedProfilePatch, { merge: true });
        }

        if (cascade.updatedMarkerPatch) {
          tx.set(markerRef, cascade.updatedMarkerPatch, { merge: true });
        }

        for (const postPatch of cascade.updatedPostPatches) {
          const postRef = db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(postPatch.postId);
          tx.update(postRef, {
            authorAccountState: postPatch.authorAccountState,
            publicVisible: postPatch.publicVisible,
            updatedAt: postPatch.updatedAt,
          });
        }

        if (auditLog) {
          const auditRef = db.collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOGS).doc(auditLog.id);
          tx.create(auditRef, auditLog);
        }
      });

      // Phase 3: Handle overflow chunks (> 450 posts) in bounded batches
      for (const chunk of overflowChunks) {
        const batch = db.batch();
        for (const postPatch of chunk) {
          const postRef = db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(postPatch.postId);
          batch.update(postRef, {
            authorAccountState: postPatch.authorAccountState,
            publicVisible: postPatch.publicVisible,
            updatedAt: postPatch.updatedAt,
          });
        }
        await batch.commit();
      }

      // Phase 4: Fail-closed verification when account is non-active
      if (accountState.state !== 'active') {
        const lingeringVisibleSnap = await db
          .collection(FIRESTORE_COLLECTIONS.POSTS)
          .where('authorUid', '==', accountState.uid)
          .where('publicVisible', '==', true)
          .limit(1)
          .get();

        if (!lingeringVisibleSnap.empty) {
          throw new ApiHttpError(
            'VISIBILITY_CASCADE_INCOMPLETE',
            'Account state transition failed closed because one or more authored posts remained publicly visible.',
            500
          );
        }
      }

      return accountState;
    },
  };

  readonly posts: PostsRepository = {
    async listPosts(filter: PostsQueryFilter): Promise<PostDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      let query: FirebaseFirestore.Query = db.collection(FIRESTORE_COLLECTIONS.POSTS);

      if (!filter.includeNonPublicForOwnerOrAdmin) {
        query = query
          .where('publicVisible', '==', true)
          .where('publicationState', '==', 'published')
          .where('moderationStatus', '==', 'none')
          .where('authorAccountState', '==', 'active');

        if (filter.postType === 'request') {
          query = query
            .where('postType', '==', 'request')
            .where('lifecycleStatus', '==', 'open');
        } else if (filter.postType === 'offer') {
          query = query
            .where('postType', '==', 'offer')
            .where('lifecycleStatus', '==', 'active');
        } else {
          query = query.where(
            Filter.or(
              Filter.and(
                Filter.where('postType', '==', 'request'),
                Filter.where('lifecycleStatus', '==', 'open')
              ),
              Filter.and(
                Filter.where('postType', '==', 'offer'),
                Filter.where('lifecycleStatus', '==', 'active')
              )
            )
          );
        }
      } else if (filter.postType) {
        query = query.where('postType', '==', filter.postType);
      }

      if (filter.cleaningCategory) {
        query = query.where('cleaningCategory', '==', filter.cleaningCategory);
      }
      if (filter.targetMunicipalityId) {
        query = query.where('targetMunicipalityId', '==', filter.targetMunicipalityId);
      }
      if (filter.coverageMunicipalityId) {
        query = query.where('coverageAreaIds', 'array-contains', filter.coverageMunicipalityId);
      }
      if (filter.authorUid) {
        query = query.where('authorUid', '==', filter.authorUid);
      }

      const snap = await query
        .orderBy('createdAt', 'desc')
        .limit(filter.limit ?? 50)
        .get();
      return snap.docs.map(d => d.data() as PostDocument);
    },

    async getPostById(postId: string): Promise<PostDocument | null> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(postId).get();
      return snap.exists ? (snap.data() as PostDocument) : null;
    },

    /**
     * Transactionally reads the author's stored AccountState and any existing PostDocument
     * before writing, ensuring no client payload can bypass administrative post hiding
     * or account suspension.
     */
    async upsertPost(post: PostDocument): Promise<PostDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      let reconciledPost = post;

      await db.runTransaction(async tx => {
        const stateRef = db
          .collection(FIRESTORE_COLLECTIONS.ACCOUNT_STATES)
          .doc(post.authorUid);
        const postRef = db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(post.id);

        // Phase 1: All reads before writes
        const [stateSnap, postSnap] = await Promise.all([tx.get(stateRef), tx.get(postRef)]);

        const storedAccountState = stateSnap.exists
          ? (stateSnap.data() as AccountStateDocument)
          : null;
        const storedPost = postSnap.exists ? (postSnap.data() as PostDocument) : null;

        reconciledPost = reconcilePostMutationWithStoredAuthority({
          incomingPost: post,
          storedPost,
          storedAccountState,
          actorUid: post.authorUid,
          actorIsAdmin: false,
        });

        // Phase 2: Write reconciled post
        tx.set(postRef, reconciledPost, { merge: true });
      });

      return reconciledPost;
    },

    async updatePostLifecycle(
      postId: string,
      publicationState: PostPublicationState,
      lifecycleStatus: PostLifecycleStatus,
      _requestedPublicVisible: boolean
    ): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.runTransaction(async tx => {
        const postRef = db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(postId);

        // Phase 1: Read existing post and author account state first
        const postSnap = await tx.get(postRef);
        if (!postSnap.exists) {
          throw new ApiHttpError('NOT_FOUND', 'Post not found.', 404);
        }
        const storedPost = postSnap.data() as PostDocument;
        const stateRef = db
          .collection(FIRESTORE_COLLECTIONS.ACCOUNT_STATES)
          .doc(storedPost.authorUid);
        const stateSnap = await tx.get(stateRef);
        const storedAccountState = stateSnap.exists
          ? (stateSnap.data() as AccountStateDocument)
          : null;

        const reconciled = reconcilePostMutationWithStoredAuthority({
          incomingPost: {
            ...storedPost,
            publicationState,
            lifecycleStatus,
            updatedAt: new Date().toISOString(),
          },
          storedPost,
          storedAccountState,
          actorUid: storedPost.authorUid,
          actorIsAdmin: false,
        });

        // Phase 2: Write lifecycle update preserving authoritative moderationStatus
        tx.update(postRef, {
          publicationState: reconciled.publicationState,
          lifecycleStatus: reconciled.lifecycleStatus,
          moderationStatus: reconciled.moderationStatus,
          authorAccountState: reconciled.authorAccountState,
          publicVisible: reconciled.publicVisible,
          updatedAt: reconciled.updatedAt,
        });
      });
    },

    async updatePostModeration(
      postId: string,
      moderationStatus: PostModerationStatus,
      moderationReferenceId: string | null,
      publicVisible: boolean,
      auditLog: AdminAuditLogDocument
    ): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.runTransaction(async tx => {
        const postRef = db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(postId);
        const auditRef = db.collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOGS).doc(auditLog.id);

        // Phase 1: Read before write
        const postSnap = await tx.get(postRef);
        if (!postSnap.exists) {
          throw new ApiHttpError('NOT_FOUND', 'Target post not found.', 404);
        }

        // Phase 2: Writes
        tx.update(postRef, {
          moderationStatus,
          moderationReferenceId,
          publicVisible,
          updatedAt: auditLog.timestamp,
        });
        tx.create(auditRef, auditLog);
      });
    },

    async deletePost(postId: string): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(postId).delete();
    },
  };

  readonly bookmarks: BookmarksRepository = {
    async listSavedUsers(ownerUid: string): Promise<ResolvedSavedUserView[]> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db
        .collection(FIRESTORE_COLLECTIONS.SAVED_USERS)
        .where('ownerUid', '==', ownerUid)
        .orderBy('createdAt', 'desc')
        .get();

      const bookmarks = snap.docs.map(d => d.data() as SavedUserDocument);
      const resolved: ResolvedSavedUserView[] = [];

      for (const b of bookmarks) {
        const pubSnap = await db
          .collection(FIRESTORE_COLLECTIONS.PUBLIC_PROFILES)
          .doc(b.targetUid)
          .get();
        if (!pubSnap.exists) {
          resolved.push({
            ...b,
            targetAvailable: false,
            unavailableReason: 'not_found',
            publicProfile: null,
          });
          continue;
        }
        const profile = pubSnap.data() as PublicProfileDocument;
        if (!profile.publicVisible || profile.authorAccountState !== 'active') {
          resolved.push({
            ...b,
            targetAvailable: false,
            unavailableReason:
              profile.authorAccountState === 'suspended'
                ? 'suspended'
                : 'hidden_or_deactivated',
            publicProfile: null,
          });
          continue;
        }
        resolved.push({
          ...b,
          targetAvailable: true,
          unavailableReason: null,
          publicProfile: profile,
        });
      }

      return resolved;
    },

    async saveUser(bookmark: SavedUserDocument): Promise<SavedUserDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      const docRef = db.collection(FIRESTORE_COLLECTIONS.SAVED_USERS).doc(bookmark.id);
      await docRef.set(bookmark);
      return bookmark;
    },

    async unsaveUser(ownerUid: string, targetUid: string): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      await db
        .collection(FIRESTORE_COLLECTIONS.SAVED_USERS)
        .doc(`${ownerUid}_${targetUid}`)
        .delete();
    },

    async listSavedPosts(ownerUid: string): Promise<ResolvedSavedPostView[]> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db
        .collection(FIRESTORE_COLLECTIONS.SAVED_POSTS)
        .where('ownerUid', '==', ownerUid)
        .orderBy('createdAt', 'desc')
        .get();

      const bookmarks = snap.docs.map(d => d.data() as SavedPostDocument);
      const resolved: ResolvedSavedPostView[] = [];

      for (const b of bookmarks) {
        const postSnap = await db.collection(FIRESTORE_COLLECTIONS.POSTS).doc(b.postId).get();
        if (!postSnap.exists) {
          resolved.push({
            ...b,
            postAvailable: false,
            unavailableReason: 'not_found',
            post: null,
          });
          continue;
        }
        const post = postSnap.data() as PostDocument;
        if (!post.publicVisible) {
          resolved.push({
            ...b,
            postAvailable: false,
            unavailableReason:
              post.authorAccountState !== 'active'
                ? 'author_unavailable'
                : post.moderationStatus !== 'none'
                ? 'admin_hidden'
                : 'closed_or_archived_or_draft',
            post: null,
          });
          continue;
        }
        resolved.push({
          ...b,
          postAvailable: true,
          unavailableReason: null,
          post,
        });
      }

      return resolved;
    },

    async savePost(bookmark: SavedPostDocument): Promise<SavedPostDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      const docRef = db.collection(FIRESTORE_COLLECTIONS.SAVED_POSTS).doc(bookmark.id);
      await docRef.set(bookmark);
      return bookmark;
    },

    async unsavePost(ownerUid: string, postId: string): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      await db
        .collection(FIRESTORE_COLLECTIONS.SAVED_POSTS)
        .doc(`${ownerUid}_${postId}`)
        .delete();
    },
  };

  readonly mapMarkers: MapMarkersRepository = {
    async listPublicMapMarkers(municipalityId?: string): Promise<PublicMapMarkerDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      let query: FirebaseFirestore.Query = db
        .collection(FIRESTORE_COLLECTIONS.PUBLIC_MAP_MARKERS)
        .where('publicVisible', '==', true)
        .where('mapConsent', '==', true)
        .where('authorAccountState', '==', 'active');
      if (municipalityId) {
        query = query.where('municipalityId', '==', municipalityId);
      }
      const snap = await query.orderBy('updatedAt', 'desc').get();
      return snap.docs.map(d => d.data() as PublicMapMarkerDocument);
    },

    async upsertMapMarker(uid: string, marker: PublicMapMarkerDocument | null): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      const ref = db.collection(FIRESTORE_COLLECTIONS.PUBLIC_MAP_MARKERS).doc(uid);
      if (!marker || !marker.mapConsent || !marker.publicVisible) {
        await ref.delete();
        return;
      }
      await ref.set(marker, { merge: true });
    },
  };

  readonly reports: ReportsRepository = {
    async createReport(report: ReportDocument): Promise<ReportDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.collection(FIRESTORE_COLLECTIONS.REPORTS).doc(report.id).create(report);
      return report;
    },

    async listReportsByStatus(status?: ReportWorkflowStatus): Promise<ReportDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      let query: FirebaseFirestore.Query = db.collection(FIRESTORE_COLLECTIONS.REPORTS);
      if (status) {
        query = query.where('status', '==', status);
      }
      const snap = await query.orderBy('createdAt', 'desc').get();
      return snap.docs.map(d => d.data() as ReportDocument);
    },

    async updateReportDecision(
      reportId: string,
      status: ReportWorkflowStatus,
      decision: NonNullable<ReportDocument['adminDecision']>,
      auditLog: AdminAuditLogDocument
    ): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.runTransaction(async tx => {
        const repRef = db.collection(FIRESTORE_COLLECTIONS.REPORTS).doc(reportId);
        const auditRef = db.collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOGS).doc(auditLog.id);
        const repSnap = await tx.get(repRef);
        if (!repSnap.exists) {
          throw new ApiHttpError('NOT_FOUND', 'Report not found.', 404);
        }
        tx.update(repRef, {
          status,
          adminDecision: decision,
          updatedAt: decision.decidedAt,
        });
        tx.create(auditRef, auditLog);
      });
    },
  };

  readonly appeals: AppealsRepository = {
    async createAppeal(appeal: AppealDocument): Promise<AppealDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.collection(FIRESTORE_COLLECTIONS.APPEALS).doc(appeal.id).create(appeal);
      return appeal;
    },

    async listAppealsByUser(appellantUid: string): Promise<AppealDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db
        .collection(FIRESTORE_COLLECTIONS.APPEALS)
        .where('appellantUid', '==', appellantUid)
        .orderBy('createdAt', 'desc')
        .get();
      return snap.docs.map(d => d.data() as AppealDocument);
    },

    async listAppealsByStatus(status?: AppealWorkflowStatus): Promise<AppealDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      let query: FirebaseFirestore.Query = db.collection(FIRESTORE_COLLECTIONS.APPEALS);
      if (status) {
        query = query.where('status', '==', status);
      }
      const snap = await query.orderBy('createdAt', 'desc').get();
      return snap.docs.map(d => d.data() as AppealDocument);
    },

    async updateAppealDecision(
      appealId: string,
      status: AppealWorkflowStatus,
      decision: NonNullable<AppealDocument['decisionDetails']>,
      auditLog: AdminAuditLogDocument
    ): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.runTransaction(async tx => {
        const appRef = db.collection(FIRESTORE_COLLECTIONS.APPEALS).doc(appealId);
        const auditRef = db.collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOGS).doc(auditLog.id);
        const appSnap = await tx.get(appRef);
        if (!appSnap.exists) {
          throw new ApiHttpError('NOT_FOUND', 'Appeal not found.', 404);
        }
        tx.update(appRef, {
          status,
          decisionDetails: decision,
          updatedAt: decision.decidedAt,
        });
        tx.create(auditRef, auditLog);
      });
    },
  };

  readonly notifications: NotificationsRepository = {
    async listUserNotifications(recipientUid: string): Promise<NotificationDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db
        .collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS)
        .where('recipientUid', '==', recipientUid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      return snap.docs.map(d => d.data() as NotificationDocument);
    },

    async markNotificationRead(_recipientUid: string, notificationId: string): Promise<void> {
      const db = await requireAuthorizedFirestoreInstance();
      const nowIso = new Date().toISOString();
      await db
        .collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS)
        .doc(notificationId)
        .update({ read: true, readAt: nowIso });
    },

    async createNotification(notification: NotificationDocument): Promise<NotificationDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      await db
        .collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS)
        .doc(notification.id)
        .create(notification);
      return notification;
    },
  };

  readonly adminAuditLogs: AdminAuditLogsRepository = {
    async appendAuditLog(log: AdminAuditLogDocument): Promise<AdminAuditLogDocument> {
      const db = await requireAuthorizedFirestoreInstance();
      await db.collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOGS).doc(log.id).create(log);
      return log;
    },

    async listAuditLogs(limit = 50): Promise<AdminAuditLogDocument[]> {
      const db = await requireAuthorizedFirestoreInstance();
      const snap = await db
        .collection(FIRESTORE_COLLECTIONS.ADMIN_AUDIT_LOGS)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      return snap.docs.map(d => d.data() as AdminAuditLogDocument);
    },
  };
}

export const defaultFirestoreRepositories: FirestoreRepositoryBundle =
  new FirebaseAdminRepositoryBundle();
