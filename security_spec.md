# LinisGo Finder — Task 1.2A Firestore Security Specification (Final Reviewed & Corrected)

## 1. Core Data & Security Invariants

1. **Default-Deny & Zero Client-Side Writes:** All direct client-side Firestore writes (`create`, `update`, `delete`) are strictly denied (`if false`) across every collection. All application mutations must pass through the standalone Node.js + Express Private REST API (`/api/*`), where Firebase ID tokens (`verifyIdToken`), account states, ownership, and input schemas are verified before any database write.
2. **Public vs. Private Profile Split & Location Privacy:**
   - `/publicProfiles/{uid}` contains only public discovery fields (`uid`, `displayName`, `biography`, `profilePhotoUrl`, `profileTag`, `availability`, `serviceAreaMunicipalityIds`, `publicPhone`, `publicFacebookUrl`, `visibilityState`, `authorAccountState`, `publicVisible`, `createdAt`, `updatedAt`). It NEVER stores the user's Firebase registration email, hidden contact details, or personal home municipality.
   - `/privateProfiles/{uid}` stores registration email, raw contact details, contact visibility toggles, and independent opt-in map preferences (`mapConsent`, `mapMunicipalityId`). It is completely inaccessible to browser reads (`allow read, write: if false;`).
3. **Separated Post Status Model (`/posts/{postId}`):**
   - `publicationState`: `'draft' | 'published'` (posts publish immediately after backend validation without requiring administrator preapproval).
   - `lifecycleStatus`: Service Requests support `'open' | 'closed'`; Service Offers support `'active' | 'archived'`.
   - `moderationStatus`: `'none' | 'flagged' | 'hidden' | 'removed'` (administrative moderation is strictly an after-publication process; newly validated posts start at `'none'`).
   - A post is publicly visible (`publicVisible == true`) if and only if:
     - `publicationState == 'published'`
     - `lifecycleStatus` is `'open'` (for `'request'`) or `'active'` (for `'offer'`)
     - `moderationStatus == 'none'`
     - `authorAccountState == 'active'`
4. **Canonical Top-Level Bookmarks (`/savedUsers/{bookmarkId}` & `/savedPosts/{bookmarkId}`):**
   - Uses a single canonical top-level persistence structure with deterministic IDs (`${ownerUid}_${targetUid}` and `${ownerUid}_${postId}`). Duplicate subcollections under `/privateProfiles/{uid}` have been removed.
5. **Approved Report & Appeal Models:**
   - `/reports/{reportId}` uses the approved status model: `'pending' | 'under_review' | 'resolved' | 'dismissed'`.
   - `/appeals/{appealId}` supports appeals for both administrator account suspensions (`targetModerationAction: 'account_suspension'`) and administrator-hidden posts (`targetModerationAction: 'post_hidden'`), storing `targetId` and `moderationReferenceId`.
   - An approved appeal reverses only the eligible moderation action matching `targetModerationAction` + `moderationReferenceId` and never automatically overrides unrelated restrictions.
6. **Account Lifecycle & Deletion Cleanup (`/accountStates/{uid}`):**
   - Supports `'active'`, `'deactivated'`, `'suspended'` (`'temporary'` and `'indefinite'`), `'pending_deletion'`, `'deletion_processing'`, and `'deleted'`, with structured `deletionCleanup` tracking.
   - Suspended accounts cannot self-reactivate.
7. **Independent Opt-In Approximate Map Markers (`/publicMapMarkers/{uid}`):**
   - Map visibility defaults to `false` (`mapConsent: false`) and uses `mapMunicipalityId` independent of `serviceAreaMunicipalityIds` and post coverage.
   - Coordinates (`approximateLat`, `approximateLng`) snap strictly to Oriental Mindoro municipal center coordinates.

---

## 2. The "Dirty Dozen" Adversarial Test Payloads

1. **Payload 1 (Unauthenticated Post Creation):** Guest client attempts `create` on `/posts/post_attack_1` -> `PERMISSION_DENIED`.
2. **Payload 2 (Authenticated Direct Client Post Write):** Signed-in user (`uid: 'user_1'`) attempts direct Firestore `create` on `/posts/post_attack_2` bypassing REST API -> `PERMISSION_DENIED`.
3. **Payload 3 (Private Profile Scraping):** Public or non-owner user attempts `get` or `list` on `/privateProfiles/user_1` -> `PERMISSION_DENIED`.
4. **Payload 4 (Draft Post Public Read):** Client attempts `get` on `/posts/draft_post_1` where `publicationState: 'draft', publicVisible: false` -> `PERMISSION_DENIED`.
5. **Payload 5 (Admin-Hidden Post Public Read):** Client attempts `get` on `/posts/hidden_post_1` where `publicationState: 'published', lifecycleStatus: 'open', moderationStatus: 'hidden', publicVisible: false` -> `PERMISSION_DENIED`.
6. **Payload 6 (Suspended Author Post Read):** Client attempts `get` on `/posts/suspended_author_post` where `authorAccountState: 'suspended', publicVisible: false` -> `PERMISSION_DENIED`.
7. **Payload 7 (Self-Reactivation from Suspended State):** Suspended user attempts `PATCH /api/profiles/me/account-state` with `{ requestedState: 'active' }` -> `HTTP 403 FORBIDDEN_ACCOUNT_SUSPENDED`.
8. **Payload 8 (Published Request Missing Municipality):** User submits `POST /api/posts` with `postType: 'request', publicationState: 'published', lifecycleStatus: 'open', targetMunicipalityId: null` -> `HTTP 400 VALIDATION_ERROR`.
9. **Payload 9 (Published Offer Empty Coverage Areas):** User submits `POST /api/posts` with `postType: 'offer', publicationState: 'published', lifecycleStatus: 'active', coverageAreaIds: []` -> `HTTP 400 VALIDATION_ERROR`.
10. **Payload 10 (Unknown Municipality ID):** User submits `POST /api/posts` with `targetMunicipalityId: 'manila-city'` -> `HTTP 400 VALIDATION_ERROR`.
11. **Payload 11 (Reports & Appeals Public Read):** Client attempts `get` or `list` on `/reports/rep_1` or `/appeals/app_1` -> `PERMISSION_DENIED`.
12. **Payload 12 (Admin Audit Log Tampering & Read):** Authenticated user attempts `get`, `list`, `update`, or `delete` on `/adminAuditLogs/log_1` -> `PERMISSION_DENIED`.
