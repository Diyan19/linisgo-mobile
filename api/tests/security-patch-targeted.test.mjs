import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  createFirestoreUserRestService,
} from '../dist/services/firestore-user-rest.service.js';

test('Targeted Security Patch Verification', async t => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  await t.test('1. Authoritative emailVerified claim bound to request.auth.token', () => {
    assert.ok(
      rules.includes("data.emailVerified == request.auth.token.get('email_verified', false)"),
      'Rules must enforce that data.emailVerified matches request.auth.token email_verified claim'
    );
  });

  await t.test('2. Reconcile accountStates.state and accountStates.accountState', () => {
    assert.ok(
      rules.includes("'state' in get(/databases/$(database)/documents/accountStates/$(request.auth.uid)).data"),
      'Rules must reconcile accountStates.state'
    );
    assert.ok(
      rules.includes("'accountState' in get(/databases/$(database)/documents/accountStates/$(request.auth.uid)).data"),
      'Rules must reconcile accountStates.accountState'
    );
  });

  await t.test('3. publicMapMarkers creation requires privateProfiles.mapConsent == true', () => {
    assert.ok(
      rules.includes('exists(/databases/$(database)/documents/privateProfiles/$(uid))'),
      'Rules must verify privateProfiles exists before creating publicMapMarkers'
    );
    assert.ok(
      rules.includes('get(/databases/$(database)/documents/privateProfiles/$(uid)).data.mapConsent == true'),
      'Rules must verify privateProfiles.mapConsent == true before creating publicMapMarkers'
    );
  });

  await t.test('4. upsertOwnPost treats only HTTP 404 as missing, propagates 401/403/errors', async () => {
    let getCalls = 0;
    const mockTransport = {
      async getDocument(collection, docId) {
        getCalls++;
        if (collection === 'posts') {
          // HTTP 404 returns null (clean missing document)
          return null;
        }
        if (collection === 'accountStates') {
          // HTTP 404 returns null (new user has no account state)
          return null;
        }
        return null;
      },
      async setDocument(collection, docId, data) {
        return data;
      },
      async deleteDocument() {},
      async runStructuredQuery() {
        return [];
      },
    };

    const service = createFirestoreUserRestService(mockTransport);
    const post = {
      id: 'post_user123_1',
      authorUid: 'user123',
      authorDisplayName: 'LinisGo Tester',
      authorProfileTag: 'client',
      postType: 'request',
      title: 'Valid House Cleaning',
      description: 'Need full deep cleaning for house in Calapan City.',
      cleaningCategory: 'General House Cleaning',
      publicationState: 'published',
      lifecycleStatus: 'open',
      moderationStatus: 'none',
      moderationReferenceId: null,
      authorAccountState: 'active',
      publicVisible: true,
      targetMunicipalityId: 'calapan-city',
      coverageAreaIds: [],
      priceOrBudget: '1500',
      photoUrls: [],
      publicAreaDescription: 'Brgy. Lalud',
      scheduleNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    };

    const saved = await service.upsertOwnPost({
      uid: 'user123',
      bearerToken: 'valid_token',
      post,
    });

    assert.equal(saved.id, 'post_user123_1');
    assert.equal(getCalls, 2);

    // Verify propagation when getDocument throws 403 or network error
    const rejectingTransport = {
      ...mockTransport,
      async getDocument(collection) {
        if (collection === 'accountStates') {
          const err = new Error('Permission denied by Firestore Rules');
          err.statusCode = 403;
          throw err;
        }
        return null;
      },
    };

    const rejectingService = createFirestoreUserRestService(rejectingTransport);
    await assert.rejects(
      () =>
        rejectingService.upsertOwnPost({
          uid: 'user123',
          bearerToken: 'token',
          post,
        }),
      /Permission denied by Firestore Rules/,
      'Must propagate non-404 errors instead of converting to null'
    );
  });
});
