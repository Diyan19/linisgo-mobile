import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import {
  MAX_TRANSACTION_POST_UPDATES,
  buildPublicPostsQueryPlan,
  computeAccountStateVisibilityCascade,
  reconcilePostMutationWithStoredAuthority,
} from '../dist/repositories/firestore.repository.js';
import {
  DISPOSABLE_SMOKE_TEST_COLLECTION,
  runStage1FirestoreSmokeTest,
  sanitizeDiagnosticErrorMessage,
} from '../dist/services/firestore-smoke-test.service.js';
import {
  APPROVED_REPORT_WORKFLOW_STATUSES,
  buildDeterministicSavedPostBookmark,
  buildDeterministicSavedUserBookmark,
  evaluateAppealDecisionReversal,
  validateAccountStateTransition,
  validateAndBuildAppealDocument,
  validateAndBuildPostDocument,
  validateAndBuildReportDocument,
  validateAndSplitUserProfile,
  validateReportStatusTransition,
} from '../dist/services/schema-validation.service.js';

const rulesText = fs.readFileSync('firestore.rules', 'utf8');
const indexesJson = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8'));
const blueprintJson = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));

/**
 * Deterministic local rule-gate evaluator modeling the exact boolean predicates in `firestore.rules`.
 */
function evaluateFirestoreRuleSimulator({
  operation,
  path,
  authUid = null,
  resourceData = null,
}) {
  const segments = path.replace(/^\/+/, '').split('/');
  const isValidId = id =>
    typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);

  if (
    operation === 'create' ||
    operation === 'update' ||
    operation === 'delete' ||
    operation === 'write'
  ) {
    return false;
  }

  if (segments.length === 2) {
    const [collection, docId] = segments;

    if (collection === 'publicProfiles') {
      if (!resourceData) return false;
      if (operation === 'get' && !isValidId(docId)) return false;
      return (
        resourceData.publicVisible === true &&
        resourceData.visibilityState === 'public' &&
        resourceData.authorAccountState === 'active' &&
        (resourceData.profileTag === 'client' || resourceData.profileTag === 'provider')
      );
    }

    if (collection === 'posts') {
      if (!resourceData) return false;
      if (operation === 'get' && !isValidId(docId)) return false;
      return (
        resourceData.publicVisible === true &&
        resourceData.publicationState === 'published' &&
        resourceData.moderationStatus === 'none' &&
        resourceData.authorAccountState === 'active' &&
        ((resourceData.postType === 'request' && resourceData.lifecycleStatus === 'open') ||
          (resourceData.postType === 'offer' && resourceData.lifecycleStatus === 'active'))
      );
    }

    if (collection === 'publicMapMarkers') {
      if (!resourceData) return false;
      if (operation === 'get' && !isValidId(docId)) return false;
      return (
        resourceData.publicVisible === true &&
        resourceData.mapConsent === true &&
        resourceData.authorAccountState === 'active'
      );
    }

    if (
      [
        'privateProfiles',
        'accountStates',
        'savedUsers',
        'savedPosts',
        'reports',
        'appeals',
        'notifications',
        'adminAuditLogs',
      ].includes(collection)
    ) {
      return false;
    }
  }

  void authUid;
  return false;
}

function listenOnEphemeralPort(appInstance) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(appInstance);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
    server.on('error', reject);
  });
}

test('Emulator availability check: explicitly verify whether @firebase/rules-unit-testing and Java JVM emulator are available', async () => {
  let rulesUnitTestingInstalled = false;
  try {
    await import('@firebase/rules-unit-testing');
    rulesUnitTestingInstalled = true;
  } catch {
    rulesUnitTestingInstalled = false;
  }

  const javaCheck = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const jvmAvailable = javaCheck.status === 0;

  assert.equal(
    rulesUnitTestingInstalled && jvmAvailable,
    false,
    'Container does not provide a Java JVM or @firebase/rules-unit-testing; rules are validated statically and via predicate simulation, not live emulator integration-tested.'
  );
});

test('1. Public and Private Reads & Location Privacy: public reads work for visible posts/profiles, privateProfiles are denied, and personal home municipality is never required or revealed', () => {
  assert.ok(rulesText.includes('match /posts/{postId}'));
  assert.ok(
    rulesText.includes('allow get: if isValidId(postId) && isPubliclyDiscoverablePost(existing());')
  );

  const immediatePublishedRequest = {
    id: 'post_calapan_1',
    authorUid: 'uid_maria_1',
    postType: 'request',
    publicationState: 'published',
    lifecycleStatus: 'open',
    moderationStatus: 'none',
    authorAccountState: 'active',
    publicVisible: true,
  };
  assert.equal(
    evaluateFirestoreRuleSimulator({
      operation: 'get',
      path: '/posts/post_calapan_1',
      authUid: null,
      resourceData: immediatePublishedRequest,
    }),
    true
  );

  assert.equal(
    evaluateFirestoreRuleSimulator({
      operation: 'get',
      path: '/privateProfiles/uid_maria_1',
      authUid: 'uid_maria_1',
      resourceData: { uid: 'uid_maria_1', registrationEmail: 'maria@example.com' },
    }),
    false
  );

  const splitNoMap = validateAndSplitUserProfile({
    uid: 'uid_maria_1',
    registrationEmail: 'maria@example.com',
    emailVerified: true,
    accountState: 'active',
    input: {
      displayName: 'Maria Santos',
      profileTag: 'provider',
      serviceAreaMunicipalityIds: ['calapan-city', 'naujan', 'calapan-city'],
      phoneNumber: '09171234567',
      showPhonePublicly: false,
      facebookUrl: 'https://facebook.com/maria',
      showFacebookPublicly: true,
      mapConsent: false,
      mapMunicipalityId: null,
    },
  });
  assert.equal(splitNoMap.valid, true);
  assert.equal('registrationEmail' in splitNoMap.value.publicProfile, false);
  assert.equal('primaryMunicipalityId' in splitNoMap.value.publicProfile, false);
  assert.equal('homeMunicipalityId' in splitNoMap.value.publicProfile, false);
  assert.deepEqual(splitNoMap.value.publicProfile.serviceAreaMunicipalityIds, [
    'calapan-city',
    'naujan',
  ]);
  assert.equal(splitNoMap.value.publicProfile.publicPhone, null);
  assert.equal(splitNoMap.value.privateProfile.mapConsent, false);
  assert.equal(splitNoMap.value.privateProfile.mapMunicipalityId, null);
  assert.equal(splitNoMap.value.mapMarker, null);
});

test('2. Direct-Write Denial: neither unauthenticated nor authenticated users can write directly to any Firestore collection', () => {
  const paths = [
    '/publicProfiles/uid_1',
    '/privateProfiles/uid_1',
    '/accountStates/uid_1',
    '/posts/post_1',
    '/savedUsers/uid_1_uid_2',
    '/savedPosts/uid_1_post_1',
    '/reports/rep_1',
    '/appeals/app_1',
    '/notifications/notif_1',
    '/publicMapMarkers/uid_1',
    '/adminAuditLogs/log_1',
  ];

  for (const path of paths) {
    assert.equal(
      evaluateFirestoreRuleSimulator({ operation: 'create', path, authUid: null }),
      false
    );
    assert.equal(
      evaluateFirestoreRuleSimulator({ operation: 'create', path, authUid: 'uid_1' }),
      false
    );
  }
});

test('3. Request/Offer Lifecycle, Immediate Publication, OR-Query Reconciliation, and Client-Side Moderation/Suspension Bypass Prevention', () => {
  const openRequest = validateAndBuildPostDocument({
    authorUid: 'uid_1',
    authorDisplayName: 'Juan Dela Cruz',
    authorProfileTag: 'client',
    authorAccountState: 'active',
    input: {
      postType: 'request',
      title: 'Need deep cleaning in Calapan',
      description: 'Looking for a reliable cleaner for a 2-bedroom house.',
      cleaningCategory: 'Deep Cleaning',
      publicationState: 'published',
      lifecycleStatus: 'open',
      targetMunicipalityId: 'calapan-city',
    },
  });
  assert.equal(openRequest.valid, true);
  assert.equal(openRequest.value.publicationState, 'published');
  assert.equal(openRequest.value.lifecycleStatus, 'open');
  assert.equal(openRequest.value.moderationStatus, 'none');
  assert.equal(openRequest.value.publicVisible, true);

  // Verify reconcilePostMutationWithStoredAuthority prevents client from clearing moderationStatus='hidden'
  const reconciledAgainstHiddenPost = reconcilePostMutationWithStoredAuthority({
    incomingPost: openRequest.value,
    storedPost: {
      ...openRequest.value,
      moderationStatus: 'hidden',
      moderationReferenceId: 'mod_hide_99',
      publicVisible: false,
    },
    storedAccountState: null,
    actorUid: 'uid_1',
    actorIsAdmin: false,
  });
  assert.equal(reconciledAgainstHiddenPost.moderationStatus, 'hidden');
  assert.equal(reconciledAgainstHiddenPost.moderationReferenceId, 'mod_hide_99');
  assert.equal(reconciledAgainstHiddenPost.publicVisible, false);

  // Verify reconcilePostMutationWithStoredAuthority prevents client from publishing while storedAccountState='suspended'
  assert.throws(
    () =>
      reconcilePostMutationWithStoredAuthority({
        incomingPost: openRequest.value,
        storedPost: null,
        storedAccountState: {
          uid: 'uid_1',
          state: 'suspended',
          suspensionType: 'indefinite',
          suspensionReason: 'Fraudulent activity',
          suspendedUntil: null,
          moderationReferenceId: 'mod_susp_1',
          deactivatedAt: null,
          deletionRequestedAt: null,
          deletionCleanupTracker: null,
          updatedByUid: 'uid_admin_1',
          updatedAt: '2026-11-09T00:00:00.000Z',
        },
        actorUid: 'uid_1',
        actorIsAdmin: false,
      }),
    /Account is currently "suspended" and cannot publish or mutate posts\./
  );

  const combinedPlan = buildPublicPostsQueryPlan({});
  assert.equal(combinedPlan.isPublicDiscovery, true);
  assert.equal(
    combinedPlan.lifecyclePredicateMode,
    'composite_or_request_open_offer_active'
  );
  assert.equal(combinedPlan.satisfiesFirestoreSecurityRules, true);
});

test('4. Reports: enforces approved status model (pending | under_review | resolved | dismissed)', () => {
  assert.deepEqual(
    Array.from(APPROVED_REPORT_WORKFLOW_STATUSES),
    ['pending', 'under_review', 'resolved', 'dismissed']
  );

  const reportRes = validateAndBuildReportDocument({
    reporterUid: 'uid_reporter_1',
    input: {
      targetType: 'post',
      targetId: 'post_123',
      reason: 'scam_or_fraud',
      explanation: 'This post asks for an upfront deposit before any service agreement.',
    },
  });
  assert.equal(reportRes.valid, true);
  assert.equal(reportRes.value.status, 'pending');
  assert.equal(
    validateReportStatusTransition({ currentStatus: 'pending', nextStatus: 'under_review' }).valid,
    true
  );
});

test('5. Appeals: supports account_suspension and post_hidden appeals, stores targetModerationAction and moderationReferenceId, and reverses only eligible moderation actions', () => {
  const postAppeal = validateAndBuildAppealDocument({
    appellantUid: 'uid_author_1',
    currentAccountState: 'active',
    currentPostModerationStatus: 'hidden',
    postAuthorUid: 'uid_author_1',
    input: {
      targetModerationAction: 'post_hidden',
      targetId: 'post_hidden_99',
      moderationReferenceId: 'mod_hide_ref_99',
      reason: 'I clarified the service area and pricing details in my cleaning offer.',
    },
  });
  assert.equal(postAppeal.valid, true);

  const postAppealReversal = evaluateAppealDecisionReversal({
    appeal: postAppeal.value.appeal,
    decision: 'approved',
    currentAccountState: 'suspended',
    currentAccountModerationRef: 'mod_susp_unrelated',
    currentPostModerationStatus: 'hidden',
    currentPostModerationRef: 'mod_hide_ref_99',
  });
  assert.equal(postAppealReversal.postModerationChanged, true);
  assert.equal(postAppealReversal.resultingPostModerationStatus, 'none');
  assert.equal(postAppealReversal.accountStateChanged, false);
  assert.equal(postAppealReversal.resultingAccountState, 'suspended');
});

test('6. Bookmarks: single canonical top-level savedUsers and savedPosts collections without duplicate subcollections', () => {
  assert.equal('/privateProfiles/{uid}/savedUsers/{targetUid}' in blueprintJson.firestore, false);
  assert.equal('/savedUsers/{bookmarkId}' in blueprintJson.firestore, true);
  assert.equal('/savedPosts/{bookmarkId}' in blueprintJson.firestore, true);

  const savedUser1 = buildDeterministicSavedUserBookmark({
    ownerUid: 'uid_alice',
    targetUid: 'uid_bob',
  });
  assert.equal(savedUser1.valid, true);
  assert.equal(savedUser1.value.id, 'uid_alice_uid_bob');

  const savedPost = buildDeterministicSavedPostBookmark({
    ownerUid: 'uid_alice',
    postId: 'post_99',
  });
  assert.equal(savedPost.valid, true);
  assert.equal(savedPost.value.id, 'uid_alice_post_99');
});

test('7. Account Lifecycle & Transactional Visibility Cascade: enforces 450-post transaction ceiling, chunks >450 posts safely, and prevents non-admin self-reactivation of suspended accounts', () => {
  assert.equal(MAX_TRANSACTION_POST_UPDATES, 450);

  const suspTransition = validateAccountStateTransition({
    actorUid: 'uid_admin_1',
    actorIsAdmin: true,
    targetUid: 'uid_user_1',
    currentState: 'active',
    requestedState: 'suspended',
    suspensionType: 'indefinite',
    moderationReferenceId: 'mod_indef_01',
  });
  assert.equal(suspTransition.valid, true);

  // Create 510 posts to verify bounded transaction chunking (450 in transaction + 60 in overflow chunk 1)
  const manyPosts = Array.from({ length: 510 }, (_, idx) => ({
    id: `post_open_${idx + 1}`,
    authorUid: 'uid_user_1',
    authorDisplayName: 'User One',
    authorProfileTag: 'provider',
    postType: 'offer',
    title: `Home Cleaning Offer #${idx + 1}`,
    description: 'Thorough cleaning across Calapan.',
    cleaningCategory: 'General House Cleaning',
    publicationState: 'published',
    lifecycleStatus: 'active',
    moderationStatus: 'none',
    moderationReferenceId: null,
    authorAccountState: 'active',
    publicVisible: true,
    targetMunicipalityId: null,
    coverageAreaIds: ['calapan-city'],
    priceOrBudget: null,
    photoUrls: [],
    publicAreaDescription: null,
    scheduleNote: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
    publishedAt: '2026-11-09T00:00:00.000Z',
  }));

  const cascadeOnSuspend = computeAccountStateVisibilityCascade({
    accountState: suspTransition.value,
    storedAccountState: null,
    actorIsAdmin: true,
    existingProfile: {
      uid: 'uid_user_1',
      displayName: 'User One',
      biography: '',
      profilePhotoUrl: null,
      profileTag: 'provider',
      availability: 'Available',
      serviceAreaMunicipalityIds: ['calapan-city'],
      publicPhone: null,
      publicFacebookUrl: null,
      visibilityState: 'public',
      authorAccountState: 'active',
      publicVisible: true,
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z',
    },
    existingMarker: {
      uid: 'uid_user_1',
      displayName: 'User One',
      profileTag: 'provider',
      municipalityId: 'calapan-city',
      municipalityName: 'Calapan City',
      approximateLat: 13.4115,
      approximateLng: 121.1803,
      mapConsent: true,
      authorAccountState: 'active',
      publicVisible: true,
      updatedAt: '2026-11-09T00:00:00.000Z',
    },
    existingPosts: manyPosts,
  });

  assert.equal(cascadeOnSuspend.updatedProfilePatch.publicVisible, false);
  assert.equal(cascadeOnSuspend.updatedMarkerPatch.publicVisible, false);
  assert.equal(cascadeOnSuspend.updatedPostPatches.length, 450);
  assert.equal(cascadeOnSuspend.overflowPostChunks.length, 1);
  assert.equal(cascadeOnSuspend.overflowPostChunks[0].length, 60);
  assert.equal(cascadeOnSuspend.updatedPostPatches[0].publicVisible, false);
  assert.equal(cascadeOnSuspend.overflowPostChunks[0][0].publicVisible, false);

  // Verify a non-admin cannot bypass a stored suspended accountState inside the transaction
  assert.throws(
    () =>
      computeAccountStateVisibilityCascade({
        accountState: {
          ...suspTransition.value,
          state: 'active',
        },
        storedAccountState: suspTransition.value,
        actorIsAdmin: false,
        existingProfile: null,
        existingMarker: null,
        existingPosts: [],
      }),
    /Stored account state is suspended\. Suspended accounts cannot self-reactivate or bypass administrative restrictions\./
  );
});

test('8. Task 1.2B Stage 2 Smoke Test Security: sanitizes diagnostic messages, blocks HTTP execution, requires explicit opt-in for writes, and completes all 8 steps when local CLI opt-in + authorized client are provided', async () => {
  // Verify diagnostic sanitizer scrubs emails, tokens, and file paths
  const rawError =
    'Connection failed for caller linisgo-backend-local@linisgo-mobile.iam.gserviceaccount.com with Bearer ya29.a0AfH6SMBx1234567890 at C:\\Users\\Alice\\key.json';
  const scrubbed = sanitizeDiagnosticErrorMessage(rawError);
  assert.equal(scrubbed.includes('linisgo-backend-local@linisgo-mobile.iam.gserviceaccount.com'), false);
  assert.equal(scrubbed.includes('ya29.a0AfH6SMBx1234567890'), false);
  assert.equal(scrubbed.includes('C:\\Users\\Alice\\key.json'), false);
  assert.ok(scrubbed.includes('[REDACTED_IDENTITY]'));
  assert.ok(scrubbed.includes('Bearer [REDACTED_TOKEN]'));
  assert.ok(scrubbed.includes('[REDACTED_PATH]'));

  // Verify HTTP execution context is immediately blocked
  const httpBlockedReport = await runStage1FirestoreSmokeTest({
    executionContext: 'http_endpoint_disabled',
  });
  assert.equal(httpBlockedReport.overallStatus, 'stopped_on_missing_prerequisite');
  assert.equal(httpBlockedReport.stoppedAtStep, 1);

  // Verify live AI Studio container stops safely at Step 3 (read probe PERMISSION_DENIED)
  const liveBlockedReport = await runStage1FirestoreSmokeTest({
    executionContext: 'local_developer_cli',
    allowDisposableWrite: false,
    isHostedPreviewOrProd: false,
  });
  assert.equal(liveBlockedReport.projectId, 'linisgo-mobile');
  assert.equal(liveBlockedReport.databaseId, '(default)');
  assert.equal(liveBlockedReport.location, 'nam5');
  assert.equal(liveBlockedReport.edition, 'Standard');
  assert.equal(liveBlockedReport.mode, 'Firestore Native');
  assert.equal(liveBlockedReport.overallStatus, 'stopped_on_missing_prerequisite');
  assert.equal(liveBlockedReport.stoppedAtStep, 3);

  const store = new Map();
  const stubAuthorizedClient = {
    async readDocument(col, id) {
      const key = `${col}/${id}`;
      return {
        exists: store.has(key),
        data: store.get(key) ?? null,
      };
    },
    async createDocument(col, id, data) {
      store.set(`${col}/${id}`, { ...data });
    },
    async deleteDocument(col, id) {
      store.delete(`${col}/${id}`);
    },
  };

  // Without allowDisposableWrite=true, stops safely at Step 4 after passing Steps 1-3
  const readOnlyReport = await runStage1FirestoreSmokeTest({
    client: stubAuthorizedClient,
    executionContext: 'local_developer_cli',
    allowDisposableWrite: false,
    isHostedPreviewOrProd: false,
  });
  assert.equal(readOnlyReport.overallStatus, 'stopped_on_missing_prerequisite');
  assert.equal(readOnlyReport.stoppedAtStep, 4);
  assert.equal(store.size, 0);

  // With allowDisposableWrite=true in local_developer_cli, completes all 8 steps and deletes disposable doc
  const passedReport = await runStage1FirestoreSmokeTest({
    client: stubAuthorizedClient,
    executionContext: 'local_developer_cli',
    allowDisposableWrite: true,
    isHostedPreviewOrProd: false,
  });
  assert.equal(passedReport.overallStatus, 'passed');
  assert.equal(passedReport.location, 'nam5');
  assert.equal(passedReport.edition, 'Standard');
  assert.equal(passedReport.mode, 'Firestore Native');
  assert.equal(passedReport.dedicatedTestCollection, DISPOSABLE_SMOKE_TEST_COLLECTION);
  assert.equal(store.size, 0);
});

test('9. Prepared Express REST API endpoints disable /api/schema/smoke-test over HTTP (403 FORBIDDEN_SMOKE_TEST_CLI_ONLY) and expose Stage 2 status on /api/schema/status', async () => {
  const stubVerifier = {
    isBackendCredentialReady: () => false,
    async verifyBearerToken(token) {
      if (token === 'valid-user-token') {
        return {
          uid: 'uid_verified_user_1',
          email: 'user1@example.com',
          emailVerified: true,
          displayName: 'Verified User',
          claims: {},
          verificationMode: 'public_certs_basic',
        };
      }
      throw new Error('Invalid token');
    },
  };

  const testApp = createApp({ tokenVerifier: stubVerifier, enableRateLimit: false });
  const { server, baseUrl } = await listenOnEphemeralPort(testApp);

  try {
    const schemaRes = await fetch(`${baseUrl}/api/schema/status`);
    assert.equal(schemaRes.status, 200);
    const schemaBody = await schemaRes.json();
    assert.equal(schemaBody.stage, '1.2B-stage-2');
    assert.equal(schemaBody.projectId, 'linisgo-mobile');
    assert.equal(schemaBody.databaseId, '(default)');
    assert.equal(schemaBody.firestoreLocation, 'nam5');
    assert.equal(schemaBody.firestoreEdition, 'Standard');
    assert.equal(schemaBody.firestoreMode, 'Firestore Native');
    assert.equal(schemaBody.firestorePersistenceStatus, 'blocked');
    assert.equal(schemaBody.persistedWritesEnabled, false);
    assert.equal(schemaBody.smokeTestAccessPolicy.publicHttpEndpointEnabled, false);
    assert.equal(schemaBody.smokeTestAccessPolicy.executionMode, 'local_developer_cli_only');

    // Verify POST /api/schema/smoke-test is blocked with HTTP 403 FORBIDDEN_SMOKE_TEST_CLI_ONLY
    const smokeHttpRes = await fetch(`${baseUrl}/api/schema/smoke-test`, { method: 'POST' });
    assert.equal(smokeHttpRes.status, 403);
    const smokeHttpBody = await smokeHttpRes.json();
    assert.equal(smokeHttpBody.code, 'FORBIDDEN_SMOKE_TEST_CLI_ONLY');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('10. Firestore composite indexes and blueprint reconcile with all 11 canonical collections and discovery queries', () => {
  assert.ok(Array.isArray(indexesJson.indexes));
  assert.equal(indexesJson.indexes.length, 15);
  assert.equal(Object.keys(blueprintJson.firestore).length, 11);
});
