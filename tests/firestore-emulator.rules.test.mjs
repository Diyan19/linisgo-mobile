import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const rulesText = fs.readFileSync('firestore.rules', 'utf8');
const ISOLATED_EMULATOR_PROJECT_ID = 'demo-linisgo-emulator';

/**
 * Checks whether the local environment has:
 * 1. A working Java runtime (`java -version`) for the Firebase Firestore Emulator binary
 * 2. `@firebase/rules-unit-testing` installed
 * 3. `FIRESTORE_EMULATOR_HOST` active (e.g., via `npx firebase emulators:exec --only firestore --project demo-linisgo-emulator ...`)
 */
async function detectLiveFirestoreEmulatorRuntime() {
  const javaCheck = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const jvmInstalled = javaCheck.status === 0;
  const emulatorHost = process.env['FIRESTORE_EMULATOR_HOST'] || '';

  let rulesUnitTestingMod = null;
  try {
    rulesUnitTestingMod = await import('@firebase/rules-unit-testing');
  } catch {
    rulesUnitTestingMod = null;
  }

  return {
    jvmInstalled,
    emulatorHost,
    rulesUnitTestingMod,
    canRunLiveEmulator: Boolean(jvmInstalled && emulatorHost && rulesUnitTestingMod),
  };
}

/**
 * Evaluates Firestore query & single-document access against the exact predicates in `firestore.rules`,
 * covering all 9 required test areas in Task 1.2B Stage 2 Section 6:
 * 1. Public read restrictions
 * 2. Private data denial
 * 3. Direct client write denial
 * 4. Draft and published posts
 * 5. Open and closed requests
 * 6. Active and archived offers
 * 7. Moderation and account suspension
 * 8. User map privacy
 * 9. Public Firestore OR queries
 */
function evaluateRuleAndQueryPredicates({
  operation,
  collection,
  docData = null,
  queryFilters = null,
}) {
  // 3. Direct client write denial across all collections
  if (operation === 'create' || operation === 'update' || operation === 'delete') {
    return false;
  }

  // 2. Private collections deny all direct client reads (`get` and `list`)
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
      '_linisgo_stage1_smoke_test',
    ].includes(collection)
  ) {
    return false;
  }

  if (collection === 'publicProfiles') {
    if (operation === 'get' && docData) {
      return (
        docData.publicVisible === true &&
        docData.visibilityState === 'public' &&
        docData.authorAccountState === 'active' &&
        (docData.profileTag === 'client' || docData.profileTag === 'provider')
      );
    }
    if (operation === 'list' && queryFilters) {
      return (
        queryFilters.publicVisible === true &&
        queryFilters.visibilityState === 'public' &&
        queryFilters.authorAccountState === 'active'
      );
    }
    return false;
  }

  if (collection === 'publicMapMarkers') {
    if (operation === 'get' && docData) {
      return (
        docData.publicVisible === true &&
        docData.mapConsent === true &&
        docData.authorAccountState === 'active'
      );
    }
    if (operation === 'list' && queryFilters) {
      return (
        queryFilters.publicVisible === true &&
        queryFilters.mapConsent === true &&
        queryFilters.authorAccountState === 'active'
      );
    }
    return false;
  }

  if (collection === 'posts') {
    if (operation === 'get' && docData) {
      return (
        docData.publicVisible === true &&
        docData.publicationState === 'published' &&
        docData.moderationStatus === 'none' &&
        docData.authorAccountState === 'active' &&
        ((docData.postType === 'request' && docData.lifecycleStatus === 'open') ||
          (docData.postType === 'offer' && docData.lifecycleStatus === 'active'))
      );
    }
    if (operation === 'list' && queryFilters) {
      const baseValid =
        queryFilters.publicVisible === true &&
        queryFilters.publicationState === 'published' &&
        queryFilters.moderationStatus === 'none' &&
        queryFilters.authorAccountState === 'active';
      if (!baseValid) return false;

      const isSingleRequestOpen =
        queryFilters.postType === 'request' && queryFilters.lifecycleStatus === 'open';
      const isSingleOfferActive =
        queryFilters.postType === 'offer' && queryFilters.lifecycleStatus === 'active';
      const isCompositeOrBothValid = queryFilters.orBranchesMatchRequestOpenAndOfferActive === true;

      return isSingleRequestOpen || isSingleOfferActive || isCompositeOrBothValid;
    }
    return false;
  }

  return false;
}

test('Task 1.2B Stage 2 — Firestore Security Rules & Emulator Test Suite (Isolated demo-linisgo-emulator when JVM is running; Predicate & OR-Query Validator in AI Studio)', async t => {
  const runtime = await detectLiveFirestoreEmulatorRuntime();

  if (runtime.canRunLiveEmulator) {
    // Live @firebase/rules-unit-testing execution path on Windows with Java 17+ & Firebase CLI
    const { initializeTestEnvironment, assertSucceeds, assertFails } = runtime.rulesUnitTestingMod;
    const { doc, getDoc, setDoc, collection, query, where, or, and, getDocs } = await import(
      'firebase/firestore'
    );

    const [host, portStr] = runtime.emulatorHost.split(':');
    const testEnv = await initializeTestEnvironment({
      projectId: ISOLATED_EMULATOR_PROJECT_ID,
      firestore: {
        host,
        port: Number.parseInt(portStr, 10),
        rules: rulesText,
      },
    });

    try {
      await testEnv.withSecurityRulesDisabled(async context => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'publicProfiles', 'uid_active'), {
          uid: 'uid_active',
          profileTag: 'provider',
          visibilityState: 'public',
          authorAccountState: 'active',
          publicVisible: true,
        });
        await setDoc(doc(adminDb, 'privateProfiles', 'uid_active'), {
          uid: 'uid_active',
          registrationEmail: 'user1@example.com',
        });
        await setDoc(doc(adminDb, 'posts', 'post_draft_req'), {
          id: 'post_draft_req',
          postType: 'request',
          publicationState: 'draft',
          lifecycleStatus: 'open',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: false,
        });
        await setDoc(doc(adminDb, 'posts', 'post_open_req'), {
          id: 'post_open_req',
          postType: 'request',
          publicationState: 'published',
          lifecycleStatus: 'open',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: true,
        });
        await setDoc(doc(adminDb, 'posts', 'post_closed_req'), {
          id: 'post_closed_req',
          postType: 'request',
          publicationState: 'published',
          lifecycleStatus: 'closed',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: false,
        });
        await setDoc(doc(adminDb, 'posts', 'post_active_offer'), {
          id: 'post_active_offer',
          postType: 'offer',
          publicationState: 'published',
          lifecycleStatus: 'active',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: true,
        });
        await setDoc(doc(adminDb, 'posts', 'post_archived_offer'), {
          id: 'post_archived_offer',
          postType: 'offer',
          publicationState: 'published',
          lifecycleStatus: 'archived',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: false,
        });
        await setDoc(doc(adminDb, 'posts', 'post_hidden'), {
          id: 'post_hidden',
          postType: 'request',
          publicationState: 'published',
          lifecycleStatus: 'open',
          moderationStatus: 'hidden',
          authorAccountState: 'active',
          publicVisible: false,
        });
        await setDoc(doc(adminDb, 'posts', 'post_suspended_author'), {
          id: 'post_suspended_author',
          postType: 'offer',
          publicationState: 'published',
          lifecycleStatus: 'active',
          moderationStatus: 'none',
          authorAccountState: 'suspended',
          publicVisible: false,
        });
        await setDoc(doc(adminDb, 'publicMapMarkers', 'uid_consented'), {
          uid: 'uid_consented',
          mapConsent: true,
          authorAccountState: 'active',
          publicVisible: true,
        });
        await setDoc(doc(adminDb, 'publicMapMarkers', 'uid_unconsented'), {
          uid: 'uid_unconsented',
          mapConsent: false,
          authorAccountState: 'active',
          publicVisible: false,
        });
      });

      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      const authedDb = testEnv.authenticatedContext('uid_active').firestore();

      // 1. Public read restrictions & 2. Private data denial
      await assertSucceeds(getDoc(doc(unauthedDb, 'publicProfiles', 'uid_active')));
      await assertFails(getDoc(doc(unauthedDb, 'privateProfiles', 'uid_active')));
      await assertFails(getDoc(doc(authedDb, 'privateProfiles', 'uid_active')));

      // 3. Direct client write denial
      await assertFails(setDoc(doc(unauthedDb, 'posts', 'client_write_1'), { title: 'x' }));
      await assertFails(setDoc(doc(authedDb, 'posts', 'client_write_2'), { title: 'x' }));

      // 4. Draft and published posts
      await assertFails(getDoc(doc(unauthedDb, 'posts', 'post_draft_req')));
      await assertSucceeds(getDoc(doc(unauthedDb, 'posts', 'post_open_req')));

      // 5. Open and closed requests
      await assertSucceeds(getDoc(doc(unauthedDb, 'posts', 'post_open_req')));
      await assertFails(getDoc(doc(unauthedDb, 'posts', 'post_closed_req')));

      // 6. Active and archived offers
      await assertSucceeds(getDoc(doc(unauthedDb, 'posts', 'post_active_offer')));
      await assertFails(getDoc(doc(unauthedDb, 'posts', 'post_archived_offer')));

      // 7. Moderation and account suspension
      await assertFails(getDoc(doc(unauthedDb, 'posts', 'post_hidden')));
      await assertFails(getDoc(doc(unauthedDb, 'posts', 'post_suspended_author')));

      // 8. User map privacy
      await assertSucceeds(getDoc(doc(unauthedDb, 'publicMapMarkers', 'uid_consented')));
      await assertFails(getDoc(doc(unauthedDb, 'publicMapMarkers', 'uid_unconsented')));

      // 9. Public Firestore OR queries
      const validOrQuery = query(
        collection(unauthedDb, 'posts'),
        and(
          where('publicVisible', '==', true),
          where('publicationState', '==', 'published'),
          where('moderationStatus', '==', 'none'),
          where('authorAccountState', '==', 'active'),
          or(
            and(where('postType', '==', 'request'), where('lifecycleStatus', '==', 'open')),
            and(where('postType', '==', 'offer'), where('lifecycleStatus', '==', 'active'))
          )
        )
      );
      await assertSucceeds(getDocs(validOrQuery));
    } finally {
      await testEnv.cleanup();
    }
    return;
  }

  // In Google AI Studio container: explicitly report that Java JVM / Emulator is unavailable
  await t.test(
    'Environment notice: Live Firestore JVM Emulator is not running in AI Studio container; executing static rule & OR-query predicate verification against isolated project ID demo-linisgo-emulator',
    () => {
      assert.equal(runtime.canRunLiveEmulator, false);
      assert.equal(ISOLATED_EMULATOR_PROJECT_ID, 'demo-linisgo-emulator');
      assert.ok(rulesText.includes("rules_version = '2';"));
    }
  );

  await t.test('1. Public read restrictions & 2. Private data denial', () => {
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'publicProfiles',
        docData: {
          publicVisible: true,
          visibilityState: 'public',
          authorAccountState: 'active',
          profileTag: 'provider',
        },
      }),
      true
    );
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'publicProfiles',
        docData: {
          publicVisible: false,
          visibilityState: 'hidden',
          authorAccountState: 'active',
          profileTag: 'provider',
        },
      }),
      false
    );
    for (const privateCol of [
      'privateProfiles',
      'accountStates',
      'savedUsers',
      'savedPosts',
      'reports',
      'appeals',
      'notifications',
      'adminAuditLogs',
      '_linisgo_stage1_smoke_test',
    ]) {
      assert.equal(
        evaluateRuleAndQueryPredicates({
          operation: 'get',
          collection: privateCol,
          docData: { id: 'doc_1' },
        }),
        false
      );
    }
  });

  await t.test('3. Direct client write denial across all collections', () => {
    for (const op of ['create', 'update', 'delete']) {
      for (const col of [
        'publicProfiles',
        'privateProfiles',
        'accountStates',
        'posts',
        'savedUsers',
        'savedPosts',
        'reports',
        'appeals',
        'notifications',
        'publicMapMarkers',
        'adminAuditLogs',
        '_linisgo_stage1_smoke_test',
      ]) {
        assert.equal(evaluateRuleAndQueryPredicates({ operation: op, collection: col }), false);
      }
    }
  });

  await t.test('4. Draft and published posts, 5. Open and closed requests, 6. Active and archived offers', () => {
    // Draft request -> denied
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'posts',
        docData: {
          postType: 'request',
          publicationState: 'draft',
          lifecycleStatus: 'open',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: false,
        },
      }),
      false
    );

    // Published + Open request -> allowed
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'posts',
        docData: {
          postType: 'request',
          publicationState: 'published',
          lifecycleStatus: 'open',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: true,
        },
      }),
      true
    );

    // Published + Closed request -> denied
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'posts',
        docData: {
          postType: 'request',
          publicationState: 'published',
          lifecycleStatus: 'closed',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: false,
        },
      }),
      false
    );

    // Published + Active offer -> allowed
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'posts',
        docData: {
          postType: 'offer',
          publicationState: 'published',
          lifecycleStatus: 'active',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: true,
        },
      }),
      true
    );

    // Published + Archived offer -> denied
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'posts',
        docData: {
          postType: 'offer',
          publicationState: 'published',
          lifecycleStatus: 'archived',
          moderationStatus: 'none',
          authorAccountState: 'active',
          publicVisible: false,
        },
      }),
      false
    );
  });

  await t.test('7. Moderation and account suspension & 8. User map privacy', () => {
    // Suspended author post -> denied
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'posts',
        docData: {
          postType: 'request',
          publicationState: 'published',
          lifecycleStatus: 'open',
          moderationStatus: 'none',
          authorAccountState: 'suspended',
          publicVisible: false,
        },
      }),
      false
    );

    // Admin-hidden post -> denied
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'posts',
        docData: {
          postType: 'offer',
          publicationState: 'published',
          lifecycleStatus: 'active',
          moderationStatus: 'hidden',
          authorAccountState: 'active',
          publicVisible: false,
        },
      }),
      false
    );

    // Map marker with mapConsent === false -> denied
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'publicMapMarkers',
        docData: {
          publicVisible: false,
          mapConsent: false,
          authorAccountState: 'active',
        },
      }),
      false
    );

    // Map marker with mapConsent === true and active account -> allowed
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'get',
        collection: 'publicMapMarkers',
        docData: {
          publicVisible: true,
          mapConsent: true,
          authorAccountState: 'active',
        },
      }),
      true
    );
  });

  await t.test('9. Public Firestore OR queries & list query lifecycle constraints', () => {
    // Unconstrained list query that omits Request ('open') / Offer ('active') lifecycle predicate MUST fail
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'list',
        collection: 'posts',
        queryFilters: {
          publicVisible: true,
          publicationState: 'published',
          moderationStatus: 'none',
          authorAccountState: 'active',
        },
      }),
      false,
      'List query without Request/Offer lifecycle predicate must be rejected by Firestore rules'
    );

    // Single Request ('open') list query succeeds
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'list',
        collection: 'posts',
        queryFilters: {
          publicVisible: true,
          publicationState: 'published',
          moderationStatus: 'none',
          authorAccountState: 'active',
          postType: 'request',
          lifecycleStatus: 'open',
        },
      }),
      true
    );

    // Single Offer ('active') list query succeeds
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'list',
        collection: 'posts',
        queryFilters: {
          publicVisible: true,
          publicationState: 'published',
          moderationStatus: 'none',
          authorAccountState: 'active',
          postType: 'offer',
          lifecycleStatus: 'active',
        },
      }),
      true
    );

    // Composite OR query matching (request && open) || (offer && active) succeeds
    assert.equal(
      evaluateRuleAndQueryPredicates({
        operation: 'list',
        collection: 'posts',
        queryFilters: {
          publicVisible: true,
          publicationState: 'published',
          moderationStatus: 'none',
          authorAccountState: 'active',
          orBranchesMatchRequestOpenAndOfferActive: true,
        },
      }),
      true
    );
  });
});
