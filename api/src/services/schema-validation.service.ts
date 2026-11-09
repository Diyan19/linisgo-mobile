import {
  getOrientalMindoroMunicipalityById,
  isValidOrientalMindoroMunicipalityId,
  validateAndDeduplicateCoverageAreas,
} from '../config/oriental-mindoro-locations.js';
import {
  AccountDeletionCleanupTracker,
  AccountLifecycleState,
  AccountStateDocument,
  AppealDocument,
  AppealTargetModerationAction,
  AppealWorkflowStatus,
  CreateAppealInput,
  CreateReportInput,
  DescriptiveProfileTag,
  OfferLifecycleStatus,
  PostDocument,
  PostLifecycleStatus,
  PostModerationStatus,
  PostPublicationState,
  PrivateProfileDocument,
  PublicMapMarkerDocument,
  PublicProfileDocument,
  ReportDocument,
  ReportReasonCategory,
  ReportWorkflowStatus,
  RequestLifecycleStatus,
  SavedPostDocument,
  SavedUserDocument,
  SchemaValidationResult,
  SuspensionType,
  UpdateProfileInput,
  UpsertPostInput,
} from '../types/firestore-schema.types.js';

const VALID_PROFILE_TAGS = new Set<DescriptiveProfileTag>(['client', 'provider']);
const VALID_PUBLICATION_STATES = new Set<PostPublicationState>(['draft', 'published']);
const VALID_REQUEST_LIFECYCLE_STATUSES = new Set<RequestLifecycleStatus>(['open', 'closed']);
const VALID_OFFER_LIFECYCLE_STATUSES = new Set<OfferLifecycleStatus>(['active', 'archived']);
const VALID_POST_MODERATION_STATUSES = new Set<PostModerationStatus>([
  'none',
  'flagged',
  'hidden',
  'removed',
]);

const VALID_REPORT_REASONS = new Set<ReportReasonCategory>([
  'spam_or_fake',
  'inappropriate_content',
  'harassment_or_safety',
  'scam_or_fraud',
  'privacy_violation',
  'other',
]);

export const APPROVED_REPORT_WORKFLOW_STATUSES = new Set<ReportWorkflowStatus>([
  'pending',
  'under_review',
  'resolved',
  'dismissed',
]);

export const APPROVED_APPEAL_WORKFLOW_STATUSES = new Set<AppealWorkflowStatus>([
  'pending',
  'under_review',
  'approved',
  'rejected',
]);

export const VALID_APPEAL_TARGET_ACTIONS = new Set<AppealTargetModerationAction>([
  'account_suspension',
  'post_hidden',
]);

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidFirestoreDocumentId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID_REGEX.test(id);
}

export function createInitialDeletionCleanupTracker(): AccountDeletionCleanupTracker {
  return {
    status: 'not_requested',
    requestedAt: null,
    startedAt: null,
    completedAt: null,
    publicProfileRemoved: false,
    privateProfileRemoved: false,
    postsHiddenOrRemoved: false,
    bookmarksRemoved: false,
    mapMarkerRemoved: false,
    notificationsRemoved: false,
  };
}

/**
 * Computes whether a user's public profile should be publicly discoverable (`publicVisible`).
 * A profile is publicly visible ONLY when `accountState === 'active'` and `visibilityState === 'public'`.
 */
export function computeProfilePublicVisibility(
  accountState: AccountLifecycleState,
  visibilityState: 'public' | 'hidden' = 'public'
): boolean {
  return accountState === 'active' && visibilityState === 'public';
}

/**
 * Computes the trusted server-side `publicVisible` boolean for a PostDocument.
 * Separates:
 * 1. `publicationState` ('draft' | 'published')
 * 2. `lifecycleStatus` ('open' | 'closed' for requests; 'active' | 'archived' for offers)
 * 3. `moderationStatus` ('none' | 'flagged' | 'hidden' | 'removed' — after-publication moderation)
 * 4. `authorAccountState` ('active' | 'deactivated' | 'suspended' | 'pending_deletion' | 'deletion_processing' | 'deleted')
 *
 * Posts publish immediately when `publicationState === 'published'` and `moderationStatus === 'none'`
 * without requiring administrator preapproval.
 */
export function computePostPublicVisibility(params: {
  postType: 'request' | 'offer';
  publicationState: PostPublicationState;
  lifecycleStatus: PostLifecycleStatus;
  moderationStatus: PostModerationStatus;
  authorAccountState: AccountLifecycleState;
}): boolean {
  if (params.authorAccountState !== 'active') {
    return false;
  }
  if (params.publicationState !== 'published') {
    return false;
  }
  if (params.moderationStatus !== 'none') {
    return false;
  }
  if (params.postType === 'request') {
    return params.lifecycleStatus === 'open';
  }
  if (params.postType === 'offer') {
    return params.lifecycleStatus === 'active';
  }
  return false;
}

/**
 * Computes the trusted server-side `publicVisible` boolean and municipality town-center coordinates
 * for an opt-in PublicMapMarkerDocument.
 * - Never exposes exact personal home coordinates.
 * - Keeps personal-location map consent (`mapConsent`, `mapMunicipalityId`) completely independent
 *   of public service areas (`serviceAreaMunicipalityIds`) and post coverage.
 */
export function buildValidatedPublicMapMarker(params: {
  uid: string;
  displayName: string;
  profileTag: DescriptiveProfileTag;
  mapConsent: boolean;
  mapMunicipalityId: string | null | undefined;
  authorAccountState: AccountLifecycleState;
  nowIso?: string;
}): SchemaValidationResult<PublicMapMarkerDocument | null> {
  const nowIso = params.nowIso ?? new Date().toISOString();

  // Map visibility defaults to OFF; if consent is false, marker is not created or publicly visible
  if (!params.mapConsent) {
    return {
      valid: true,
      errors: [],
      value: null,
    };
  }

  if (!params.mapMunicipalityId || !isValidOrientalMindoroMunicipalityId(params.mapMunicipalityId)) {
    return {
      valid: false,
      errors: [
        'Opt-in public map discovery requires a valid Oriental Mindoro mapMunicipalityId independent of post coverage.',
      ],
    };
  }

  const municipality = getOrientalMindoroMunicipalityById(params.mapMunicipalityId)!;
  const publicVisible = params.mapConsent === true && params.authorAccountState === 'active';

  return {
    valid: true,
    errors: [],
    value: {
      uid: params.uid,
      displayName: params.displayName.trim() || 'LinisGo User',
      profileTag: VALID_PROFILE_TAGS.has(params.profileTag) ? params.profileTag : 'client',
      municipalityId: municipality.id,
      municipalityName: municipality.name,
      // Strictly pinned to municipal hall / town-center reference coordinates
      approximateLat: municipality.centerLat,
      approximateLng: municipality.centerLng,
      mapConsent: true,
      authorAccountState: params.authorAccountState,
      publicVisible,
      updatedAt: nowIso,
    },
  };
}

/**
 * Validates and constructs a PostDocument (Service Request, Service Offer, or Draft).
 * Enforces:
 * - Separation of `publicationState` ('draft' | 'published'), `lifecycleStatus` ('open' | 'closed' for Request;
 *   'active' | 'archived' for Offer), and `moderationStatus` ('none' | 'flagged' | 'hidden' | 'removed').
 * - Immediate publication upon backend validation (`publicationState === 'published'`, default `moderationStatus === 'none'`)
 *   without requiring administrator preapproval.
 * - Service Requests require 1 valid Oriental Mindoro `targetMunicipalityId` before publication.
 * - Service Offers require 1..15 valid Oriental Mindoro `coverageAreaIds` before publication.
 * - Drafts (`publicationState === 'draft'`) may have incomplete title/description/location fields, but `publicVisible` is forced `false`.
 */
export function validateAndBuildPostDocument(params: {
  authorUid: string;
  authorDisplayName: string;
  authorProfileTag: DescriptiveProfileTag;
  authorAccountState: AccountLifecycleState;
  moderationStatus?: PostModerationStatus;
  moderationReferenceId?: string | null;
  input: UpsertPostInput;
  nowIso?: string;
}): SchemaValidationResult<PostDocument> {
  const errors: string[] = [];
  const { input } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (!isValidFirestoreDocumentId(params.authorUid)) {
    errors.push('Invalid author Firebase UID.');
  }

  if (input.postType !== 'request' && input.postType !== 'offer') {
    errors.push('postType must be either "request" (Service Request) or "offer" (Service Offer).');
  }

  const publicationState: PostPublicationState = input.publicationState ?? 'published';
  if (!VALID_PUBLICATION_STATES.has(publicationState)) {
    errors.push(`Invalid publicationState "${publicationState}". Allowed: draft, published.`);
  }

  const defaultLifecycleStatus: PostLifecycleStatus =
    input.postType === 'offer' ? 'active' : 'open';
  const lifecycleStatus: PostLifecycleStatus = input.lifecycleStatus ?? defaultLifecycleStatus;

  if (
    input.postType === 'request' &&
    !VALID_REQUEST_LIFECYCLE_STATUSES.has(lifecycleStatus as RequestLifecycleStatus)
  ) {
    errors.push(
      `Invalid lifecycleStatus "${lifecycleStatus}" for Service Request. Allowed: open, closed.`
    );
  }
  if (
    input.postType === 'offer' &&
    !VALID_OFFER_LIFECYCLE_STATUSES.has(lifecycleStatus as OfferLifecycleStatus)
  ) {
    errors.push(
      `Invalid lifecycleStatus "${lifecycleStatus}" for Service Offer. Allowed: active, archived.`
    );
  }

  const moderationStatus: PostModerationStatus = params.moderationStatus ?? 'none';
  if (!VALID_POST_MODERATION_STATUSES.has(moderationStatus)) {
    errors.push(
      `Invalid moderationStatus "${moderationStatus}". Allowed: none, flagged, hidden, removed.`
    );
  }

  const isDraft = publicationState === 'draft';
  const cleanTitle = (input.title || '').trim();
  const cleanDescription = (input.description || '').trim();
  const cleanCategory = (input.cleaningCategory || '').trim() || 'General House Cleaning';

  if (!isDraft) {
    if (cleanTitle.length < 3 || cleanTitle.length > 120) {
      errors.push('Published post title is required and must be between 3 and 120 characters.');
    }
    if (cleanDescription.length < 10 || cleanDescription.length > 2000) {
      errors.push(
        'Published post description is required and must be between 10 and 2000 characters.'
      );
    }
  } else {
    if (cleanTitle.length > 120) {
      errors.push('Draft title cannot exceed 120 characters.');
    }
    if (cleanDescription.length > 2000) {
      errors.push('Draft description cannot exceed 2000 characters.');
    }
  }

  let validatedTargetMunicipalityId: string | null = null;
  let validatedCoverageAreaIds: string[] = [];

  if (input.postType === 'request') {
    const rawTarget = input.targetMunicipalityId ? String(input.targetMunicipalityId).trim() : '';
    if (rawTarget) {
      if (!isValidOrientalMindoroMunicipalityId(rawTarget)) {
        errors.push(`Unknown Oriental Mindoro municipality identifier: "${rawTarget}".`);
      } else {
        validatedTargetMunicipalityId = rawTarget;
      }
    } else if (!isDraft) {
      errors.push(
        'Service Requests require one valid target municipality in Oriental Mindoro before publication.'
      );
    }
  } else if (input.postType === 'offer') {
    const { validIds, unknownIds } = validateAndDeduplicateCoverageAreas(
      input.coverageAreaIds ?? []
    );
    if (unknownIds.length > 0) {
      errors.push(
        `Unknown Oriental Mindoro coverage municipality identifier(s): ${unknownIds.join(', ')}.`
      );
    }
    if (!isDraft && validIds.length === 0) {
      errors.push(
        'Service Offers require one or more valid coverage municipalities in Oriental Mindoro before publication.'
      );
    }
    validatedCoverageAreaIds = validIds;
  }

  const photoUrls = Array.isArray(input.photoUrls)
    ? input.photoUrls
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        .slice(0, 5)
    : [];

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const publicVisible = computePostPublicVisibility({
    postType: input.postType,
    publicationState,
    lifecycleStatus,
    moderationStatus,
    authorAccountState: params.authorAccountState,
  });

  const postId =
    input.id && isValidFirestoreDocumentId(input.id)
      ? input.id
      : `post_${params.authorUid}_${Date.now()}`;

  const doc: PostDocument = {
    id: postId,
    authorUid: params.authorUid,
    authorDisplayName: params.authorDisplayName.trim() || 'LinisGo User',
    authorProfileTag: VALID_PROFILE_TAGS.has(params.authorProfileTag)
      ? params.authorProfileTag
      : 'client',
    postType: input.postType,
    title: cleanTitle || 'Untitled Draft',
    description: cleanDescription,
    cleaningCategory: cleanCategory,
    publicationState,
    lifecycleStatus,
    moderationStatus,
    moderationReferenceId:
      moderationStatus === 'hidden' || moderationStatus === 'removed'
        ? params.moderationReferenceId ?? null
        : null,
    authorAccountState: params.authorAccountState,
    publicVisible,
    targetMunicipalityId: validatedTargetMunicipalityId,
    coverageAreaIds: validatedCoverageAreaIds,
    priceOrBudget: input.priceOrBudget ? String(input.priceOrBudget).trim().slice(0, 80) : null,
    photoUrls,
    publicAreaDescription: input.publicAreaDescription
      ? String(input.publicAreaDescription).trim().slice(0, 160)
      : null,
    scheduleNote: input.scheduleNote ? String(input.scheduleNote).trim().slice(0, 120) : null,
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: publicationState === 'published' ? nowIso : null,
  };

  return { valid: true, errors: [], value: doc };
}

/**
 * Validates and splits a user profile update into separated `PublicProfileDocument`
 * and `PrivateProfileDocument` records:
 * - Never exposes registrationEmail or unconsented contact details in `publicProfiles`.
 * - Never requires or publicly reveals a user's home municipality.
 * - Uses separately selected `serviceAreaMunicipalityIds` for public discovery.
 * - Keeps personal map consent (`mapConsent`, `mapMunicipalityId`) strictly independent of service areas and post coverage.
 */
export function validateAndSplitUserProfile(params: {
  uid: string;
  registrationEmail: string;
  emailVerified: boolean;
  accountState: AccountLifecycleState;
  input: UpdateProfileInput;
  nowIso?: string;
}): SchemaValidationResult<{
  publicProfile: PublicProfileDocument;
  privateProfile: PrivateProfileDocument;
  mapMarker: PublicMapMarkerDocument | null;
}> {
  const errors: string[] = [];
  const { input } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (!isValidFirestoreDocumentId(params.uid)) {
    errors.push('Invalid Firebase UID for profile.');
  }

  const displayName = (input.displayName ?? 'LinisGo User').trim();
  if (displayName.length < 2 || displayName.length > 80) {
    errors.push('displayName must be between 2 and 80 characters.');
  }

  const profileTag: DescriptiveProfileTag = input.profileTag ?? 'client';
  if (!VALID_PROFILE_TAGS.has(profileTag)) {
    errors.push('profileTag must be either "client" or "provider" (descriptive only).');
  }

  const { validIds: serviceAreaMunicipalityIds, unknownIds } = validateAndDeduplicateCoverageAreas(
    input.serviceAreaMunicipalityIds ?? []
  );
  if (unknownIds.length > 0) {
    errors.push(
      `Unknown Oriental Mindoro serviceAreaMunicipalityIds: ${unknownIds.join(', ')}.`
    );
  }

  const mapConsent = Boolean(input.mapConsent);
  // Personal map location is strictly independent of serviceAreaMunicipalityIds and post coverage
  const mapMunicipalityId = input.mapMunicipalityId
    ? String(input.mapMunicipalityId).trim()
    : null;

  if (mapMunicipalityId && !isValidOrientalMindoroMunicipalityId(mapMunicipalityId)) {
    errors.push(`Unknown Oriental Mindoro mapMunicipalityId: "${mapMunicipalityId}".`);
  }

  const markerCheck = buildValidatedPublicMapMarker({
    uid: params.uid,
    displayName,
    profileTag,
    mapConsent,
    mapMunicipalityId: mapConsent ? mapMunicipalityId : null,
    authorAccountState: params.accountState,
    nowIso,
  });

  if (!markerCheck.valid) {
    errors.push(...markerCheck.errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const showPhonePublicly = Boolean(input.showPhonePublicly);
  const showFacebookPublicly = input.showFacebookPublicly ?? true;
  const rawPhone = input.phoneNumber ? String(input.phoneNumber).trim().slice(0, 32) : null;
  const rawFacebook = input.facebookUrl ? String(input.facebookUrl).trim().slice(0, 250) : null;

  const visibilityState: 'public' | 'hidden' =
    params.accountState === 'active' ? 'public' : 'hidden';
  const publicVisible = computeProfilePublicVisibility(params.accountState, visibilityState);

  const publicProfile: PublicProfileDocument = {
    uid: params.uid,
    displayName,
    biography: (input.biography || '').trim().slice(0, 600),
    profilePhotoUrl: input.profilePhotoUrl
      ? String(input.profilePhotoUrl).trim().slice(0, 500)
      : null,
    profileTag,
    availability: (input.availability || 'Available by inquiry').trim().slice(0, 120),
    serviceAreaMunicipalityIds,
    // Strictly omit phone/Facebook unless explicitly enabled for public display
    publicPhone: showPhonePublicly ? rawPhone : null,
    publicFacebookUrl: showFacebookPublicly ? rawFacebook : null,
    visibilityState,
    authorAccountState: params.accountState,
    publicVisible,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const privateProfile: PrivateProfileDocument = {
    uid: params.uid,
    registrationEmail: params.registrationEmail,
    emailVerified: params.emailVerified,
    phoneNumber: rawPhone,
    facebookUrl: rawFacebook,
    showPhonePublicly,
    showFacebookPublicly,
    mapConsent,
    mapMunicipalityId: mapConsent ? mapMunicipalityId : null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    valid: true,
    errors: [],
    value: {
      publicProfile,
      privateProfile,
      mapMarker: markerCheck.value ?? null,
    },
  };
}

/**
 * Validates account lifecycle state transitions:
 * - Active accounts ('active')
 * - Deactivation ('deactivated') and reactivation ('active')
 * - Temporary ('temporary') and indefinite ('indefinite') suspension ('suspended')
 * - Permanent deletion processing ('pending_deletion' -> 'deletion_processing' -> 'deleted') and cleanup tracking
 * - Rule: Suspended accounts CANNOT self-reactivate!
 */
export function validateAccountStateTransition(params: {
  actorUid: string;
  actorIsAdmin: boolean;
  targetUid: string;
  currentState: AccountLifecycleState;
  requestedState: AccountLifecycleState;
  suspensionType?: SuspensionType;
  suspensionExpiresAt?: string | null;
  administrativeReason?: string | null;
  moderationReferenceId?: string | null;
  deletionCleanup?: Partial<AccountDeletionCleanupTracker>;
  nowIso?: string;
}): SchemaValidationResult<AccountStateDocument> {
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (!params.actorIsAdmin) {
    if (params.actorUid !== params.targetUid) {
      return {
        valid: false,
        errors: ['You are not authorized to modify another user’s account state.'],
      };
    }

    if (params.currentState === 'suspended') {
      return {
        valid: false,
        errors: [
          'Suspended accounts cannot reactivate or modify their own state. Submit a formal suspension appeal instead.',
        ],
      };
    }

    if (
      params.currentState === 'pending_deletion' ||
      params.currentState === 'deletion_processing' ||
      params.currentState === 'deleted'
    ) {
      return {
        valid: false,
        errors: [
          'Accounts undergoing permanent deletion cannot be self-reactivated or modified.',
        ],
      };
    }

    if (
      params.requestedState !== 'active' &&
      params.requestedState !== 'deactivated' &&
      params.requestedState !== 'pending_deletion'
    ) {
      return {
        valid: false,
        errors: [
          'Regular users may only toggle their own account between active and deactivated, or request permanent deletion (pending_deletion).',
        ],
      };
    }
  }

  const suspensionType: SuspensionType =
    params.requestedState === 'suspended' ? params.suspensionType || 'temporary' : 'none';

  if (
    params.requestedState === 'suspended' &&
    suspensionType !== 'temporary' &&
    suspensionType !== 'indefinite'
  ) {
    return {
      valid: false,
      errors: ['Suspensions must specify suspensionType as "temporary" or "indefinite".'],
    };
  }

  if (
    params.requestedState === 'suspended' &&
    suspensionType === 'temporary' &&
    !params.suspensionExpiresAt
  ) {
    return {
      valid: false,
      errors: ['Temporary suspensions require a valid suspensionExpiresAt timestamp.'],
    };
  }

  const baseCleanup = createInitialDeletionCleanupTracker();
  let deletionCleanup: AccountDeletionCleanupTracker = {
    ...baseCleanup,
    ...(params.deletionCleanup || {}),
  };

  if (params.requestedState === 'pending_deletion') {
    deletionCleanup = {
      ...deletionCleanup,
      status: 'pending',
      requestedAt: deletionCleanup.requestedAt ?? nowIso,
    };
  } else if (params.requestedState === 'deletion_processing') {
    deletionCleanup = {
      ...deletionCleanup,
      status: 'in_progress',
      requestedAt: deletionCleanup.requestedAt ?? nowIso,
      startedAt: deletionCleanup.startedAt ?? nowIso,
    };
  } else if (params.requestedState === 'deleted') {
    deletionCleanup = {
      status: 'completed',
      requestedAt: deletionCleanup.requestedAt ?? nowIso,
      startedAt: deletionCleanup.startedAt ?? nowIso,
      completedAt: nowIso,
      publicProfileRemoved: true,
      privateProfileRemoved: true,
      postsHiddenOrRemoved: true,
      bookmarksRemoved: true,
      mapMarkerRemoved: true,
      notificationsRemoved: true,
    };
  }

  return {
    valid: true,
    errors: [],
    value: {
      uid: params.targetUid,
      state: params.requestedState,
      suspensionType,
      suspendedAt: params.requestedState === 'suspended' ? nowIso : null,
      suspensionExpiresAt:
        params.requestedState === 'suspended' && suspensionType === 'temporary'
          ? params.suspensionExpiresAt ?? null
          : null,
      deactivatedAt: params.requestedState === 'deactivated' ? nowIso : null,
      reactivatedAt:
        params.currentState !== 'active' && params.requestedState === 'active' ? nowIso : null,
      administrativeReason:
        params.requestedState === 'suspended'
          ? params.administrativeReason ?? 'Policy violation'
          : null,
      moderationReferenceId:
        params.requestedState === 'suspended'
          ? params.moderationReferenceId ?? `mod_susp_${params.targetUid}_${Date.now()}`
          : null,
      deletionCleanup,
      updatedByUid: params.actorUid,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

/**
 * Deterministic bookmark ID generator & validator for canonical top-level `savedUsers` and `savedPosts`.
 * Prevents duplicate bookmarks per user without dual-collection redundancy.
 */
export function buildDeterministicSavedUserBookmark(params: {
  ownerUid: string;
  targetUid: string;
  nowIso?: string;
}): SchemaValidationResult<SavedUserDocument> {
  if (
    !isValidFirestoreDocumentId(params.ownerUid) ||
    !isValidFirestoreDocumentId(params.targetUid)
  ) {
    return { valid: false, errors: ['Invalid ownerUid or targetUid for saved user bookmark.'] };
  }
  if (params.ownerUid === params.targetUid) {
    return { valid: false, errors: ['Users cannot bookmark their own profile.'] };
  }
  const nowIso = params.nowIso ?? new Date().toISOString();
  return {
    valid: true,
    errors: [],
    value: {
      id: `${params.ownerUid}_${params.targetUid}`,
      ownerUid: params.ownerUid,
      targetUid: params.targetUid,
      createdAt: nowIso,
    },
  };
}

export function buildDeterministicSavedPostBookmark(params: {
  ownerUid: string;
  postId: string;
  nowIso?: string;
}): SchemaValidationResult<SavedPostDocument> {
  if (!isValidFirestoreDocumentId(params.ownerUid) || !isValidFirestoreDocumentId(params.postId)) {
    return { valid: false, errors: ['Invalid ownerUid or postId for saved post bookmark.'] };
  }
  const nowIso = params.nowIso ?? new Date().toISOString();
  return {
    valid: true,
    errors: [],
    value: {
      id: `${params.ownerUid}_${params.postId}`,
      ownerUid: params.ownerUid,
      postId: params.postId,
      createdAt: nowIso,
    },
  };
}

/**
 * Validates a user-submitted moderation report using the approved status model:
 * 'pending' | 'under_review' | 'resolved' | 'dismissed'.
 */
export function validateAndBuildReportDocument(params: {
  reporterUid: string;
  input: CreateReportInput;
  nowIso?: string;
}): SchemaValidationResult<ReportDocument> {
  const errors: string[] = [];
  const { input } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (!isValidFirestoreDocumentId(params.reporterUid)) {
    errors.push('Invalid reporterUid.');
  }
  if (input.targetType !== 'post' && input.targetType !== 'user') {
    errors.push('targetType must be "post" or "user".');
  }
  if (!isValidFirestoreDocumentId(input.targetId)) {
    errors.push('Invalid targetId.');
  }
  if (input.targetType === 'user' && input.targetId === params.reporterUid) {
    errors.push('Users cannot submit a report against their own account.');
  }
  if (!VALID_REPORT_REASONS.has(input.reason)) {
    errors.push('Invalid report reason category.');
  }
  const explanation = (input.explanation || '').trim();
  if (explanation.length < 10 || explanation.length > 1000) {
    errors.push('Report explanation must be between 10 and 1000 characters.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    value: {
      id: `rep_${params.reporterUid}_${Date.now()}`,
      reporterUid: params.reporterUid,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      explanation,
      status: 'pending',
      adminDecision: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

/**
 * Validates a report workflow status transition (`pending` -> `under_review` -> `resolved` | `dismissed`).
 */
export function validateReportStatusTransition(params: {
  currentStatus: ReportWorkflowStatus;
  nextStatus: ReportWorkflowStatus;
}): SchemaValidationResult<ReportWorkflowStatus> {
  if (!APPROVED_REPORT_WORKFLOW_STATUSES.has(params.nextStatus)) {
    return {
      valid: false,
      errors: [
        `Invalid report status "${params.nextStatus}". Allowed: pending, under_review, resolved, dismissed.`,
      ],
    };
  }
  if (params.currentStatus === 'resolved' || params.currentStatus === 'dismissed') {
    return {
      valid: false,
      errors: [`Completed report in "${params.currentStatus}" status cannot be reopened.`],
    };
  }
  return { valid: true, errors: [], value: params.nextStatus };
}

/**
 * Validates a moderation appeal for either:
 * 1. Administrator account suspension (`targetModerationAction: 'account_suspension'`)
 * 2. Administrator-hidden post (`targetModerationAction: 'post_hidden'`)
 *
 * Submitting an appeal sets `status: 'pending'` and NEVER automatically reverses
 * account suspension or restores a hidden post.
 */
export function validateAndBuildAppealDocument(params: {
  appellantUid: string;
  currentAccountState: AccountLifecycleState;
  currentPostModerationStatus?: PostModerationStatus;
  postAuthorUid?: string;
  input: CreateAppealInput;
  nowIso?: string;
}): SchemaValidationResult<{
  appeal: AppealDocument;
  accountStateAfterSubmission: AccountLifecycleState;
  postModerationStatusAfterSubmission: PostModerationStatus | null;
}> {
  const errors: string[] = [];
  const { input } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  if (!isValidFirestoreDocumentId(params.appellantUid)) {
    errors.push('Invalid appellantUid.');
  }

  if (!VALID_APPEAL_TARGET_ACTIONS.has(input.targetModerationAction)) {
    errors.push(
      'targetModerationAction must be either "account_suspension" or "post_hidden".'
    );
  }

  if (!isValidFirestoreDocumentId(input.targetId)) {
    errors.push('targetId is required and must be a valid document ID.');
  }

  const modRef = (input.moderationReferenceId || '').trim();
  if (!modRef || modRef.length > 128) {
    errors.push('moderationReferenceId is required.');
  }

  const reason = (input.reason || '').trim();
  if (reason.length < 10 || reason.length > 1500) {
    errors.push('Appeal explanation must be between 10 and 1500 characters.');
  }

  if (input.targetModerationAction === 'account_suspension') {
    if (params.currentAccountState !== 'suspended') {
      errors.push(
        'Account suspension appeals can only be submitted while the account is suspended.'
      );
    }
    if (input.targetId !== params.appellantUid) {
      errors.push('Users may only appeal a suspension on their own account.');
    }
  } else if (input.targetModerationAction === 'post_hidden') {
    if (params.postAuthorUid && params.postAuthorUid !== params.appellantUid) {
      errors.push('Users may only submit a hidden-post appeal for a post they authored.');
    }
    if (
      params.currentPostModerationStatus !== undefined &&
      params.currentPostModerationStatus !== 'hidden'
    ) {
      errors.push('Hidden-post appeals can only be submitted for posts with moderationStatus "hidden".');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    value: {
      appeal: {
        id: `app_${params.appellantUid}_${Date.now()}`,
        appellantUid: params.appellantUid,
        targetModerationAction: input.targetModerationAction,
        targetId: input.targetId,
        moderationReferenceId: modRef,
        reason,
        status: 'pending',
        decisionDetails: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      // Invariants: Submitting an appeal NEVER automatically reverses suspension or restores a hidden post!
      accountStateAfterSubmission: params.currentAccountState,
      postModerationStatusAfterSubmission:
        input.targetModerationAction === 'post_hidden'
          ? params.currentPostModerationStatus ?? 'hidden'
          : null,
    },
  };
}

/**
 * Evaluates the exact scope of an administrator's appeal decision (`approved` vs `rejected`).
 * Invariant:
 * - An approved appeal reverses ONLY the eligible moderation action matching `targetModerationAction`
 *   and `moderationReferenceId`, and NEVER automatically overrides unrelated restrictions!
 *   - Approving a `post_hidden` appeal restores that post's `moderationStatus` to `'none'` ONLY if
 *     its `moderationReferenceId` matches, and NEVER lifts an unrelated `'suspended'` account state.
 *   - Approving an `account_suspension` appeal reactivates the account to `'active'` ONLY if the account
 *     is currently `'suspended'` under that `moderationReferenceId` (never overriding `'pending_deletion'`,
 *     `'deletion_processing'`, `'deleted'`, or a different suspension reference), and NEVER automatically
 *     restores separately hidden posts.
 */
export function evaluateAppealDecisionReversal(params: {
  appeal: AppealDocument;
  decision: 'approved' | 'rejected';
  currentAccountState: AccountLifecycleState;
  currentAccountModerationRef: string | null;
  currentPostModerationStatus?: PostModerationStatus;
  currentPostModerationRef?: string | null;
}): {
  newAppealStatus: AppealWorkflowStatus;
  accountStateChanged: boolean;
  resultingAccountState: AccountLifecycleState;
  postModerationChanged: boolean;
  resultingPostModerationStatus: PostModerationStatus | null;
} {
  if (params.decision === 'rejected') {
    return {
      newAppealStatus: 'rejected',
      accountStateChanged: false,
      resultingAccountState: params.currentAccountState,
      postModerationChanged: false,
      resultingPostModerationStatus: params.currentPostModerationStatus ?? null,
    };
  }

  if (params.appeal.targetModerationAction === 'account_suspension') {
    const isEligibleAccountSuspension =
      params.currentAccountState === 'suspended' &&
      params.currentAccountModerationRef === params.appeal.moderationReferenceId;

    return {
      newAppealStatus: 'approved',
      accountStateChanged: isEligibleAccountSuspension,
      resultingAccountState: isEligibleAccountSuspension ? 'active' : params.currentAccountState,
      // Approving an account suspension appeal never automatically overrides hidden posts
      postModerationChanged: false,
      resultingPostModerationStatus: params.currentPostModerationStatus ?? null,
    };
  }

  // targetModerationAction === 'post_hidden'
  const isEligibleHiddenPost =
    params.currentPostModerationStatus === 'hidden' &&
    params.currentPostModerationRef === params.appeal.moderationReferenceId;

  return {
    newAppealStatus: 'approved',
    // Approving a hidden-post appeal never automatically lifts an account suspension
    accountStateChanged: false,
    resultingAccountState: params.currentAccountState,
    postModerationChanged: isEligibleHiddenPost,
    resultingPostModerationStatus: isEligibleHiddenPost
      ? 'none'
      : params.currentPostModerationStatus ?? null,
  };
}
