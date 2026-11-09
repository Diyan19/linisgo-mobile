/**
 * LinisGo Finder — Task 1.2A (Final Reviewed & Corrected) Cloud Firestore Schema Models
 *
 * Canonical Top-Level Collections (11 — no duplicate subcollections):
 * 1. publicProfiles          (/publicProfiles/{uid})
 * 2. privateProfiles         (/privateProfiles/{uid})
 * 3. accountStates           (/accountStates/{uid})
 * 4. posts                   (/posts/{postId})
 * 5. savedUsers              (/savedUsers/{ownerUid}_{targetUid})
 * 6. savedPosts              (/savedPosts/{ownerUid}_{postId})
 * 7. reports                 (/reports/{reportId})
 * 8. appeals                 (/appeals/{appealId})
 * 9. notifications           (/notifications/{notificationId})
 * 10. publicMapMarkers       (/publicMapMarkers/{uid})
 * 11. adminAuditLogs         (/adminAuditLogs/{logId})
 */

export type DescriptiveProfileTag = 'client' | 'provider';

/**
 * 6. Account Lifecycle States:
 * Supports active accounts, self-deactivation/reactivation, temporary & indefinite suspension,
 * and permanent deletion processing & cleanup tracking.
 */
export type AccountLifecycleState =
  | 'active'
  | 'deactivated'
  | 'suspended'
  | 'pending_deletion'
  | 'deletion_processing'
  | 'deleted';

export type SuspensionType = 'none' | 'temporary' | 'indefinite';

export type AccountDeletionCleanupStatus =
  | 'not_requested'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed';

export interface AccountDeletionCleanupTracker {
  status: AccountDeletionCleanupStatus;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  publicProfileRemoved: boolean;
  privateProfileRemoved: boolean;
  postsHiddenOrRemoved: boolean;
  bookmarksRemoved: boolean;
  mapMarkerRemoved: boolean;
  notificationsRemoved: boolean;
}

export type PostType = 'request' | 'offer';

/**
 * 4. Post Status Separation:
 * - `publicationState`: 'draft' | 'published' (posts publish immediately after backend validation without admin preapproval)
 * - `lifecycleStatus`:
 *     - Service Requests ('request'): 'open' | 'closed'
 *     - Service Offers ('offer'): 'active' | 'archived'
 * - `moderationStatus`: 'none' | 'flagged' | 'hidden' | 'removed' (after-publication administrative moderation)
 */
export type PostPublicationState = 'draft' | 'published';
export type RequestLifecycleStatus = 'open' | 'closed';
export type OfferLifecycleStatus = 'active' | 'archived';
export type PostLifecycleStatus = RequestLifecycleStatus | OfferLifecycleStatus;
export type PostModerationStatus = 'none' | 'flagged' | 'hidden' | 'removed';

export type CleaningServiceCategory =
  | 'General House Cleaning'
  | 'Deep Cleaning'
  | 'Laundry & Ironing'
  | 'Move-In / Move-Out'
  | 'Kitchen & Bath Focus'
  | 'Outdoor / Yard Sweeping';

export type ReportTargetType = 'post' | 'user';

export type ReportReasonCategory =
  | 'spam_or_fake'
  | 'inappropriate_content'
  | 'harassment_or_safety'
  | 'scam_or_fraud'
  | 'privacy_violation'
  | 'other';

/**
 * 1. Approved Report Workflow Status Model:
 * - pending
 * - under_review
 * - resolved
 * - dismissed
 */
export type ReportWorkflowStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';

/**
 * 2. Appeals Model:
 * Supports appeals for:
 * - Administrator account suspensions ('account_suspension')
 * - Administrator-hidden posts ('post_hidden')
 */
export type AppealTargetModerationAction = 'account_suspension' | 'post_hidden';

export type AppealWorkflowStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export type NotificationEventType =
  | 'account_status'
  | 'moderation_update'
  | 'appeal_decision'
  | 'report_update'
  | 'post_status'
  | 'system_announcement';

export type AdminAuditActionType =
  | 'hide_post'
  | 'restore_post'
  | 'suspend_user'
  | 'reactivate_user'
  | 'resolve_report'
  | 'dismiss_report'
  | 'approve_appeal'
  | 'reject_appeal';

/**
 * 1. publicProfiles (/publicProfiles/{uid})
 * Contains ONLY publicly discoverable profile fields.
 * - Never exposes Firebase registration email or unconsented contact methods.
 * - Never requires or publicly reveals a user's personal home municipality.
 * - Uses separately selected public service areas (`serviceAreaMunicipalityIds`).
 */
export interface PublicProfileDocument {
  uid: string;
  displayName: string;
  biography: string;
  profilePhotoUrl: string | null;
  /** Descriptive only ('client' | 'provider'); never determines permissions or security roles. */
  profileTag: DescriptiveProfileTag;
  availability: string;
  /** Separately selected public service area municipalities in Oriental Mindoro (never personal home address). */
  serviceAreaMunicipalityIds: string[];
  /** Populated ONLY when PrivateProfileDocument.showPhonePublicly === true. */
  publicPhone: string | null;
  /** Populated ONLY when PrivateProfileDocument.showFacebookPublicly === true. */
  publicFacebookUrl: string | null;
  visibilityState: 'public' | 'hidden';
  authorAccountState: AccountLifecycleState;
  /** Server-controlled boolean: true ONLY when visibilityState === 'public' && authorAccountState === 'active'. */
  publicVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 2. privateProfiles (/privateProfiles/{uid})
 * Strictly private to the account owner via the Private REST API.
 * Never readable directly from the browser.
 * Does not require a user's personal home municipality; keeps optional map consent (`mapConsent`, `mapMunicipalityId`)
 * completely independent of public service areas and post coverage.
 */
export interface PrivateProfileDocument {
  uid: string;
  registrationEmail: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  facebookUrl: string | null;
  showPhonePublicly: boolean;
  showFacebookPublicly: boolean;
  /** Defaults to false (independent opt-in required for approximate map discovery). */
  mapConsent: boolean;
  /** Optional municipality ID used strictly for approximate map marker placement when mapConsent === true. */
  mapMunicipalityId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 3. accountStates (/accountStates/{uid})
 * Trusted server-managed account lifecycle, suspension, and permanent deletion cleanup record.
 * Never editable directly by clients; suspended users cannot self-reactivate.
 */
export interface AccountStateDocument {
  uid: string;
  state: AccountLifecycleState;
  suspensionType: SuspensionType;
  suspendedAt: string | null;
  suspensionExpiresAt: string | null;
  deactivatedAt: string | null;
  reactivatedAt: string | null;
  administrativeReason: string | null;
  moderationReferenceId: string | null;
  deletionCleanup: AccountDeletionCleanupTracker;
  updatedByUid: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 4. posts (/posts/{postId})
 * Shared collection for both Service Requests ('request') and Service Offers ('offer').
 * Separates `publicationState`, `lifecycleStatus`, and `moderationStatus`.
 * Publishes immediately after backend validation (`publicationState === 'published'`, `moderationStatus === 'none'`)
 * without requiring administrator preapproval.
 */
export interface PostDocument {
  id: string;
  authorUid: string;
  authorDisplayName: string;
  authorProfileTag: DescriptiveProfileTag;
  postType: PostType;
  title: string;
  description: string;
  cleaningCategory: CleaningServiceCategory | string;
  /** Author-controlled publication state ('draft' | 'published'). */
  publicationState: PostPublicationState;
  /** Request ('open' | 'closed') or Offer ('active' | 'archived') lifecycle state. */
  lifecycleStatus: PostLifecycleStatus;
  /** After-publication administrator moderation state ('none' | 'flagged' | 'hidden' | 'removed'). */
  moderationStatus: PostModerationStatus;
  /** Reference ID of the active administrative moderation action (if hidden/removed). */
  moderationReferenceId: string | null;
  /** Synchronized from `/accountStates/{authorUid}`. */
  authorAccountState: AccountLifecycleState;
  /**
   * Trusted backend-controlled visibility flag.
   * True if and only if:
   * - `publicationState === 'published'`
   * - `lifecycleStatus` is 'open' (for 'request') or 'active' (for 'offer')
   * - `moderationStatus === 'none'`
   * - `authorAccountState === 'active'`
   */
  publicVisible: boolean;
  /** Required valid Oriental Mindoro municipality ID when publishing a Service Request. */
  targetMunicipalityId: string | null;
  /** Required 1..15 valid Oriental Mindoro municipality IDs when publishing a Service Offer. */
  coverageAreaIds: string[];
  priceOrBudget: string | null;
  photoUrls: string[];
  /** General barangay or landmark note — never exact personal home coordinates. */
  publicAreaDescription: string | null;
  scheduleNote: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

/**
 * 5. savedUsers (/savedUsers/{ownerUid}_{targetUid})
 * Canonical single-collection bookmark model. Deterministic ID prevents duplicate bookmarks.
 */
export interface SavedUserDocument {
  id: string;
  ownerUid: string;
  targetUid: string;
  createdAt: string;
}

export interface ResolvedSavedUserView extends SavedUserDocument {
  targetAvailable: boolean;
  unavailableReason: 'hidden_or_deactivated' | 'suspended' | 'not_found' | null;
  publicProfile: PublicProfileDocument | null;
}

/**
 * 6. savedPosts (/savedPosts/{ownerUid}_{postId})
 * Canonical single-collection bookmark model. Deterministic ID prevents duplicate bookmarks.
 */
export interface SavedPostDocument {
  id: string;
  ownerUid: string;
  postId: string;
  createdAt: string;
}

export interface ResolvedSavedPostView extends SavedPostDocument {
  postAvailable: boolean;
  unavailableReason:
    | 'closed_or_archived_or_draft'
    | 'admin_hidden'
    | 'author_unavailable'
    | 'not_found'
    | null;
  post: PostDocument | null;
}

/**
 * 7. reports (/reports/{reportId})
 * Private moderation report record using the approved status model:
 * 'pending' | 'under_review' | 'resolved' | 'dismissed'.
 */
export interface ReportDocument {
  id: string;
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReasonCategory;
  explanation: string;
  status: ReportWorkflowStatus;
  adminDecision: {
    decidedByUid: string;
    actionTaken: string;
    notes: string;
    decidedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 8. appeals (/appeals/{appealId})
 * Supports appeals for administrator account suspensions ('account_suspension')
 * and administrator-hidden posts ('post_hidden').
 * Stores `targetModerationAction`, `targetId`, and `moderationReferenceId`.
 */
export interface AppealDocument {
  id: string;
  appellantUid: string;
  targetModerationAction: AppealTargetModerationAction;
  targetId: string;
  moderationReferenceId: string;
  reason: string;
  status: AppealWorkflowStatus;
  decisionDetails: {
    decidedByUid: string;
    decision: 'approved' | 'rejected';
    notes: string;
    decidedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 9. notifications (/notifications/{notificationId})
 * Canonical single-collection private in-app notification record.
 */
export interface NotificationDocument {
  id: string;
  recipientUid: string;
  title: string;
  message: string;
  eventType: NotificationEventType;
  read: boolean;
  relatedRecordType: 'post' | 'report' | 'appeal' | 'account' | null;
  relatedRecordId: string | null;
  createdAt: string;
  readAt: string | null;
}

/**
 * 10. publicMapMarkers (/publicMapMarkers/{uid})
 * Opt-in approximate municipality map discovery marker.
 * Coordinates are strictly pinned to Oriental Mindoro municipal center coordinates.
 * Personal-location consent (`mapConsent`, `mapMunicipalityId`) is independent of post coverage.
 */
export interface PublicMapMarkerDocument {
  uid: string;
  displayName: string;
  profileTag: DescriptiveProfileTag;
  municipalityId: string;
  municipalityName: string;
  approximateLat: number;
  approximateLng: number;
  mapConsent: boolean;
  authorAccountState: AccountLifecycleState;
  publicVisible: boolean;
  updatedAt: string;
}

/**
 * 11. adminAuditLogs (/adminAuditLogs/{logId})
 * Immutable administrator audit trail. Never editable or deletable.
 */
export interface AdminAuditLogDocument {
  id: string;
  adminUid: string;
  actionType: AdminAuditActionType;
  targetType: 'post' | 'user' | 'report' | 'appeal';
  targetId: string;
  moderationReferenceId?: string | null;
  reason: string;
  result: 'success' | 'failure';
  metadata?: Record<string, string | number | boolean | null>;
  timestamp: string;
}

/**
 * Request Input DTOs for Validation
 */
export interface UpsertPostInput {
  id?: string;
  postType: PostType;
  title?: string;
  description?: string;
  cleaningCategory?: string;
  publicationState?: PostPublicationState;
  lifecycleStatus?: PostLifecycleStatus;
  targetMunicipalityId?: string | null;
  coverageAreaIds?: string[];
  priceOrBudget?: string | null;
  photoUrls?: string[];
  publicAreaDescription?: string | null;
  scheduleNote?: string | null;
}

export interface UpdateProfileInput {
  displayName?: string;
  biography?: string;
  profilePhotoUrl?: string | null;
  profileTag?: DescriptiveProfileTag;
  availability?: string;
  serviceAreaMunicipalityIds?: string[];
  phoneNumber?: string | null;
  facebookUrl?: string | null;
  showPhonePublicly?: boolean;
  showFacebookPublicly?: boolean;
  mapConsent?: boolean;
  mapMunicipalityId?: string | null;
}

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReasonCategory;
  explanation: string;
}

export interface CreateAppealInput {
  targetModerationAction: AppealTargetModerationAction;
  targetId: string;
  moderationReferenceId: string;
  reason: string;
}

export interface SchemaValidationResult<T> {
  valid: boolean;
  errors: string[];
  value?: T;
}
