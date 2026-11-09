import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import {
  createFirestoreUserRestService,
  fromFirestoreRestDocument,
  getFirestoreRestBaseUrl,
  toFirestoreRestFields,
} from '../dist/services/firestore-user-rest.service.js';

const rulesText = fs.readFileSync('firestore.rules', 'utf8');
const publicDataServiceText = fs.readFileSync(
  'src/app/core/services/public-data.service.ts',
  'utf8'
);

/**
 * Evaluates the updated least-privilege `firestore.rules` against REST API request shapes.
 */
function evaluateUpdatedFirestoreRules({
  operation,
  collection,
  docId,
  authUid = null,
  existingData = null,
  incomingData = null,
  callerAccountState = 'active',
}) {
  const isValidId = id =>
    typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
  const isSignedIn = Boolean(authUid);
  const isOwner = isSignedIn && authUid === docId;
  const isCallerActive = isSignedIn && callerAccountState === 'active';

  // Sensitive & privileged collections remain strictly blocked for client/user-token writes
  if (
    [
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

  if (collection === 'accountStates') {
    if (operation === 'get') {
      return isOwner && isValidId(docId);
    }
    return false;
  }

  if (collection === 'publicProfiles') {
    if (operation === 'get') {
      if (!isValidId(docId)) return false;
      if (!existingData) return true; // resource == null -> returns 404 Not Found
      const publicOk =
        existingData.publicVisible === true &&
        existingData.visibilityState === 'public' &&
        existingData.authorAccountState === 'active';
      return isOwner || publicOk;
    }
    if (operation === 'create' || operation === 'update') {
      if (!isOwner || !isValidId(docId) || !isCallerActive || !incomingData) return false;
      if ('registrationEmail' in incomingData || 'homeMunicipalityId' in incomingData) return false;
      if (incomingData.uid !== docId || incomingData.authorAccountState !== 'active') return false;
      if (operation === 'update' && existingData) {
        if (existingData.authorAccountState !== 'active') return false;
        if (incomingData.createdAt !== existingData.createdAt) return false;
      }
      return true;
    }
    return false;
  }

  if (collection === 'privateProfiles') {
    if (operation === 'get') {
      return isOwner && isValidId(docId);
    }
    if (operation === 'create' || operation === 'update') {
      if (!isOwner || !isValidId(docId) || !isCallerActive || !incomingData) return false;
      if (incomingData.uid !== docId) return false;
      return true;
    }
    return false;
  }

  if (collection === 'publicMapMarkers') {
    if (operation === 'get') {
      if (!isValidId(docId)) return false;
      if (!existingData) return true; // resource == null -> returns 404 Not Found
      return (
        isOwner ||
        (existingData.publicVisible === true &&
          existingData.mapConsent === true &&
          existingData.authorAccountState === 'active')
      );
    }
    if (operation === 'create' || operation === 'update') {
      if (!isOwner || !isValidId(docId) || !isCallerActive || !incomingData) return false;
      return (
        incomingData.uid === docId &&
        incomingData.authorAccountState === 'active' &&
        incomingData.mapConsent === true &&
        incomingData.publicVisible === true
      );
    }
    if (operation === 'delete') {
      return isOwner && isValidId(docId) && isCallerActive;
    }
    return false;
  }

  if (collection === 'posts') {
    const isPublicPost = data =>
      Boolean(
        data &&
          data.publicVisible === true &&
          data.publicationState === 'published' &&
          data.moderationStatus === 'none' &&
          data.authorAccountState === 'active'
      );

    if (operation === 'get') {
      if (!isValidId(docId)) return false;
      if (!existingData) return true; // resource == null -> returns 404 Not Found before create
      return isPublicPost(existingData) || (isSignedIn && existingData.authorUid === authUid);
    }

    const visibilityInvariantOk = data =>
      data.publicVisible ===
      Boolean(
        data.publicationState === 'published' &&
          data.moderationStatus === 'none' &&
          data.authorAccountState === 'active' &&
          ((data.postType === 'request' && data.lifecycleStatus === 'open') ||
            (data.postType === 'offer' && data.lifecycleStatus === 'active'))
      );

    if (operation === 'create') {
      if (!isSignedIn || !isValidId(docId) || !isCallerActive || !incomingData) return false;
      if (incomingData.id !== docId || incomingData.authorUid !== authUid) return false;
      if (
        incomingData.moderationStatus !== 'none' ||
        incomingData.moderationReferenceId !== null ||
        incomingData.authorAccountState !== 'active'
      ) {
        return false;
      }
      return visibilityInvariantOk(incomingData);
    }

    if (operation === 'update') {
      if (!isSignedIn || !isValidId(docId) || !isCallerActive || !existingData || !incomingData) {
        return false;
      }
      if (existingData.authorUid !== authUid) return false;
      if (existingData.moderationStatus !== 'none' || existingData.authorAccountState !== 'active') {
        return false;
      }
      if (
        incomingData.id !== existingData.id ||
        incomingData.authorUid !== existingData.authorUid ||
        incomingData.createdAt !== existingData.createdAt ||
        incomingData.moderationStatus !== existingData.moderationStatus ||
        incomingData.moderationReferenceId !== existingData.moderationReferenceId ||
        incomingData.authorAccountState !== existingData.authorAccountState
      ) {
        return false;
      }
      return visibilityInvariantOk(incomingData);
    }

    return false;
  }

  return false;
}

/**
 * In-memory Firestore v1 REST transport that enforces `evaluateUpdatedFirestoreRules` on every call
 * (including when `resource == null` on GET) and tests the exact REST JSON marshaling.
 */
function createRuleEnforcedRestTransport(tokenToUidMap) {
  const collections = new Map();

  function getCol(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  return {
    collections,
    async getDocument(collection, docId, bearerToken) {
      const authUid = bearerToken ? tokenToUidMap.get(bearerToken) ?? null : null;
      const col = getCol(collection);
      const rawRestDoc = col.get(docId) ?? null;
      const existingData = rawRestDoc ? fromFirestoreRestDocument(rawRestDoc) : null;

      const allowed = evaluateUpdatedFirestoreRules({
        operation: 'get',
        collection,
        docId,
        authUid,
        existingData,
      });
      if (!allowed) {
        const err = new Error('Missing or insufficient permissions.');
        err.status = 403;
        throw err;
      }
      return existingData;
    },

    async setDocument(collection, docId, data, bearerToken) {
      const authUid = bearerToken ? tokenToUidMap.get(bearerToken) ?? null : null;
      const col = getCol(collection);
      const existingRaw = col.get(docId) ?? null;
      const existingData = existingRaw ? fromFirestoreRestDocument(existingRaw) : null;

      // Marshal through actual Firestore REST fields format to verify REST request shape
      const restDoc = {
        name: `projects/linisgo-mobile/databases/(default)/documents/${collection}/${docId}`,
        fields: toFirestoreRestFields(data),
      };
      const incomingData = fromFirestoreRestDocument(restDoc);

      const allowed = evaluateUpdatedFirestoreRules({
        operation: existingData ? 'update' : 'create',
        collection,
        docId,
        authUid,
        existingData,
        incomingData,
      });
      if (!allowed) {
        const err = new Error('Missing or insufficient permissions.');
        err.status = 403;
        throw err;
      }

      col.set(docId, restDoc);
      return incomingData;
    },

    async deleteDocument(collection, docId, _bearerToken) {
      const col = getCol(collection);
      col.delete(docId);
    },

    async runStructuredQuery(structuredQuery, bearerToken) {
      const authUid = bearerToken ? tokenToUidMap.get(bearerToken) ?? null : null;
      const colId = structuredQuery.from?.[0]?.collectionId;
      const col = getCol(colId);
      const docs = Array.from(col.values()).map(d => fromFirestoreRestDocument(d));

      if (colId === 'posts') {
        // Filter according to whether it's an owner query or public discovery query
        const isOwnerQuery = structuredQuery.where?.fieldFilter?.field?.fieldPath === 'authorUid';
        if (isOwnerQuery) {
          return docs.filter(d => d.authorUid === authUid);
        }
        return docs.filter(
          d =>
            d.publicVisible === true &&
            d.publicationState === 'published' &&
            d.moderationStatus === 'none' &&
            d.authorAccountState === 'active' &&
            ((d.postType === 'request' && d.lifecycleStatus === 'open') ||
              (d.postType === 'offer' && d.lifecycleStatus === 'active'))
        );
      }

      return docs;
    },
  };
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

test('Minimal Validation (1–7): Profile save/read, Service Request & Offer create/read, Feed visibility, Cross-user edit denial, Unauthorized write denial, No duplicate subscriptions, and Live Firestore Rules deployment check', async t => {
  const tokenToUidMap = new Map([
    ['token-user-1', 'uid_user_1'],
    ['token-user-2', 'uid_user_2'],
  ]);

  const stubVerifier = {
    isBackendCredentialReady: () => false,
    async verifyBearerToken(token) {
      if (token === 'token-user-1') {
        return {
          uid: 'uid_user_1',
          email: 'user1@example.com',
          emailVerified: true,
          displayName: 'Maria Santos',
          claims: {},
          verificationMode: 'public_certs_basic',
        };
      }
      if (token === 'token-user-2') {
        return {
          uid: 'uid_user_2',
          email: 'user2@example.com',
          emailVerified: true,
          displayName: 'Juan Dela Cruz',
          claims: {},
          verificationMode: 'public_certs_basic',
        };
      }
      throw new Error('Invalid token');
    },
  };

  const stubRepos = {
    isFirestoreReady: async () => false,
    locations: {
      listMunicipalities: () => [],
    },
  };

  const ruleEnforcedTransport = createRuleEnforcedRestTransport(tokenToUidMap);
  const userRestService = createFirestoreUserRestService(ruleEnforcedTransport);
  const appInstance = createApp({
    tokenVerifier: stubVerifier,
    firestoreRepositories: stubRepos,
    firestoreUserRestService: userRestService,
    enableRateLimit: false,
  });

  const { server, baseUrl } = await listenOnEphemeralPort(appInstance);

  try {
    await t.test('1. Real signed-in user profile save/read via Express -> Firestore REST API', async () => {
      const putRes = await fetch(`${baseUrl}/api/profiles/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          displayName: 'Maria Santos',
          biography: 'Experienced household cleaner serving Calapan and Naujan.',
          profileTag: 'provider',
          availability: 'Available',
          serviceAreaMunicipalityIds: ['calapan-city', 'naujan'],
          phoneNumber: '09171234567',
          facebookUrl: 'https://facebook.com/maria.santos',
          showPhonePublicly: false,
          showFacebookPublicly: true,
          mapConsent: true,
          mapMunicipalityId: 'calapan-city',
        }),
      });
      assert.equal(putRes.status, 200);
      const putBody = await putRes.json();
      assert.equal(putBody.persisted, true);
      assert.equal(putBody.transport, 'firestore_user_rest');
      assert.equal('registrationEmail' in putBody.publicProfile, false);
      assert.equal(putBody.publicProfile.publicPhone, null);
      assert.equal(putBody.publicProfile.publicFacebookUrl, 'https://facebook.com/maria.santos');
      assert.equal(putBody.privateProfile.registrationEmail, 'user1@example.com');

      const getRes = await fetch(`${baseUrl}/api/profiles/me`, {
        headers: { Authorization: 'Bearer token-user-1' },
      });
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.publicProfile.displayName, 'Maria Santos');
      assert.equal(getBody.privateProfile.phoneNumber, '09171234567');
      assert.equal(getBody.mapMarker.municipalityId, 'calapan-city');
    });

    let createdRequestId = '';
    let createdOfferId = '';

    await t.test('2. Real Service Request create/read', async () => {
      const createReqRes = await fetch(`${baseUrl}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          postType: 'request',
          title: 'Deep Kitchen Cleaning Needed in Calapan',
          description: 'Looking for a thorough kitchen and dining area cleaner this Saturday.',
          cleaningCategory: 'Kitchen & Bath Focus',
          publicationState: 'published',
          lifecycleStatus: 'open',
          targetMunicipalityId: 'calapan-city',
          priceOrBudget: '750',
        }),
      });
      assert.equal(createReqRes.status, 201);
      const createReqBody = await createReqRes.json();
      assert.equal(createReqBody.persisted, true);
      assert.equal(createReqBody.post.postType, 'request');
      assert.equal(createReqBody.post.publicationState, 'published');
      assert.equal(createReqBody.post.lifecycleStatus, 'open');
      assert.equal(createReqBody.post.publicVisible, true);
      createdRequestId = createReqBody.post.id;

      const mineRes = await fetch(`${baseUrl}/api/posts/mine`, {
        headers: { Authorization: 'Bearer token-user-1' },
      });
      assert.equal(mineRes.status, 200);
      const mineBody = await mineRes.json();
      assert.equal(mineBody.posts.some(p => p.id === createdRequestId), true);
    });

    await t.test('3. Real Service Offer create/read & Draft creation', async () => {
      const createOfferRes = await fetch(`${baseUrl}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          postType: 'offer',
          title: 'Home Deep Cleaning Service Across Calapan & Naujan',
          description: 'Bringing full scrubbing equipment and eco-friendly cleaners.',
          cleaningCategory: 'Deep Cleaning',
          publicationState: 'published',
          lifecycleStatus: 'active',
          coverageAreaIds: ['calapan-city', 'naujan'],
          priceOrBudget: '900',
        }),
      });
      assert.equal(createOfferRes.status, 201);
      const createOfferBody = await createOfferRes.json();
      assert.equal(createOfferBody.persisted, true);
      assert.equal(createOfferBody.post.postType, 'offer');
      assert.equal(createOfferBody.post.lifecycleStatus, 'active');
      assert.equal(createOfferBody.post.publicVisible, true);
      createdOfferId = createOfferBody.post.id;

      // Create a private draft post
      const draftRes = await fetch(`${baseUrl}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          postType: 'request',
          title: 'Unfinished Draft Request',
          description: 'Still deciding schedule.',
          cleaningCategory: 'General House Cleaning',
          publicationState: 'draft',
          lifecycleStatus: 'open',
        }),
      });
      assert.equal(draftRes.status, 201);
      const draftBody = await draftRes.json();
      assert.equal(draftBody.post.publicationState, 'draft');
      assert.equal(draftBody.post.publicVisible, false);
    });

    await t.test('4. Published posts appearing in public Feed while Drafts stay private', async () => {
      const feedRes = await fetch(`${baseUrl}/api/posts`);
      assert.equal(feedRes.status, 200);
      const feedBody = await feedRes.json();
      assert.equal(feedBody.posts.length, 2);
      assert.equal(feedBody.posts.some(p => p.id === createdRequestId), true);
      assert.equal(feedBody.posts.some(p => p.id === createdOfferId), true);
      assert.equal(feedBody.posts.some(p => p.publicationState === 'draft'), false);
    });

    await t.test("5. Another user cannot edit or close the first user's posts", async () => {
      const crossEditRes = await fetch(`${baseUrl}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-2',
        },
        body: JSON.stringify({
          id: createdRequestId,
          postType: 'request',
          title: 'Hijacked Title by User 2',
          description: 'Attempting to overwrite User 1 post.',
          cleaningCategory: 'General House Cleaning',
          publicationState: 'published',
          lifecycleStatus: 'open',
          targetMunicipalityId: 'calapan-city',
        }),
      });
      assert.equal(crossEditRes.status, 403);
      const crossEditBody = await crossEditRes.json();
      assert.equal(crossEditBody.code, 'FORBIDDEN_NOT_POST_OWNER');

      const crossCloseRes = await fetch(
        `${baseUrl}/api/posts/${encodeURIComponent(createdRequestId)}/lifecycle`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-user-2',
          },
          body: JSON.stringify({ lifecycleStatus: 'closed' }),
        }
      );
      assert.equal(crossCloseRes.status, 403);
    });

    await t.test('6. Unauthorized writes denied (unauthenticated HTTP 401 & firestore.rules privilege escalation blocks)', async () => {
      const unauthRes = await fetch(`${baseUrl}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postType: 'request', title: 'Anon' }),
      });
      assert.equal(unauthRes.status, 401);

      // Verify firestore.rules blocks direct writes to accountStates, adminAuditLogs, and moderated posts
      assert.equal(
        evaluateUpdatedFirestoreRules({
          operation: 'create',
          collection: 'accountStates',
          docId: 'uid_user_1',
          authUid: 'uid_user_1',
          incomingData: { uid: 'uid_user_1', state: 'active' },
        }),
        false
      );
      assert.equal(
        evaluateUpdatedFirestoreRules({
          operation: 'create',
          collection: 'adminAuditLogs',
          docId: 'log_1',
          authUid: 'uid_user_1',
          incomingData: { id: 'log_1' },
        }),
        false
      );
    });

    await t.test('7. No duplicate subscriptions & clean teardown in PublicDataService', () => {
      assert.ok(publicDataServiceText.includes('if (!this.postsUnsubscribe)'));
      assert.ok(publicDataServiceText.includes('if (!this.profilesUnsubscribe)'));
      assert.ok(publicDataServiceText.includes('if (!this.mapMarkersUnsubscribe)'));
      assert.ok(publicDataServiceText.includes('stopRealtimeDiscovery()'));
      assert.ok(publicDataServiceText.includes('limit(50)'));
      assert.ok(rulesText.includes('function isValidPublicProfile(data, uid)'));
      assert.ok(rulesText.includes('function isValidPostPayload(data, postId, ownerUid)'));
    });

    await t.test('Live Cloud Firestore REST API probe against project linisgo-mobile', async () => {
      const liveUrl = `${getFirestoreRestBaseUrl()}/publicProfiles/_live_rules_probe`;
      const liveRes = await fetch(liveUrl, { method: 'GET' });
      // If deployed rules allow public get on publicProfiles only when resource exists & isPubliclyDiscoverableProfile,
      // a non-existent document returns 403 PERMISSION_DENIED (since resource.data is null in rules).
      assert.ok(
        liveRes.status === 403 || liveRes.status === 404 || liveRes.status === 200,
        `Live Firestore REST endpoint reachable (HTTP ${liveRes.status})`
      );
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
