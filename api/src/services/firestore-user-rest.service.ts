import { envConfig } from '../config/env.js';
import { ApiHttpError } from '../types/auth.types.js';
import {
  AccountLifecycleState,
  AccountStateDocument,
  PostDocument,
  PostLifecycleStatus,
  PostPublicationState,
  PostType,
  PrivateProfileDocument,
  PublicMapMarkerDocument,
  PublicProfileDocument,
} from '../types/firestore-schema.types.js';
import { computePostPublicVisibility } from './schema-validation.service.js';

/**
 * Official Cloud Firestore v1 REST API Client using a signed-in user's verified Firebase Auth ID token.
 *
 * Architecture:
 *   Angular Firebase Auth → Express REST API (verifies JWT + schema) → Firestore v1 REST API
 *
 * Security Trade-Off (Explicitly Documented):
 *   User-token Firestore REST requests are evaluated by Firestore Security Rules (`firestore.rules`)
 *   under the caller's `request.auth.uid`, NOT via privileged Firebase Admin IAM credentials.
 *   Therefore, this transport does NOT enforce an exclusive backend-only write boundary:
 *   a client holding the same Firebase ID token could issue direct requests to Firestore that satisfy
 *   `firestore.rules`. Consequently, `firestore.rules` MUST independently enforce all ownership,
 *   schema validation, field allowlists, moderation locks, and account-state restrictions.
 */

export interface FirestoreRestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

export interface FirestoreRestDocument {
  name?: string;
  fields?: Record<string, FirestoreRestValue>;
  createTime?: string;
  updateTime?: string;
}

export function getFirestoreRestBaseUrl(): string {
  const projectId = envConfig.firebaseProjectId;
  const databaseId = encodeURIComponent(envConfig.firestoreDatabaseId);
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
}

export function toFirestoreRestValue(val: unknown): FirestoreRestValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(item => toFirestoreRestValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreRestValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreRestValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function toFirestoreRestFields<T extends object>(
  obj: T
): Record<string, FirestoreRestValue> {
  const fields: Record<string, FirestoreRestValue> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined) {
      fields[k] = toFirestoreRestValue(v);
    }
  }
  return fields;
}

export function fromFirestoreRestValue(val: FirestoreRestValue | undefined): unknown {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue ?? '');
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values ?? [];
    return values.map(v => fromFirestoreRestValue(v));
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreRestValue(v);
    }
    return out;
  }
  return null;
}

export function fromFirestoreRestDocument<T>(doc: FirestoreRestDocument): T {
  const fields = doc.fields ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreRestValue(v);
  }
  return out as T;
}

export interface FirestoreUserRestTransport {
  getDocument<T>(collection: string, docId: string, bearerToken?: string): Promise<T | null>;
  setDocument<T extends object>(
    collection: string,
    docId: string,
    data: T,
    bearerToken: string
  ): Promise<T>;
  deleteDocument(collection: string, docId: string, bearerToken: string): Promise<void>;
  runStructuredQuery<T>(structuredQuery: Record<string, unknown>, bearerToken?: string): Promise<T[]>;
}

function mapFirestoreRestHttpError(
  status: number,
  errorBody: unknown,
  collection: string,
  operation: string
): ApiHttpError {
  const msg =
    typeof errorBody === 'object' &&
    errorBody !== null &&
    'error' in errorBody &&
    typeof (errorBody as { error?: { message?: string } }).error?.message === 'string'
      ? (errorBody as { error: { message: string } }).error.message
      : `Firestore REST API ${operation} on "${collection}" failed with HTTP ${status}.`;

  if (status === 401) {
    return new ApiHttpError(
      'UNAUTHORIZED_FIRESTORE_REST',
      'Firebase ID token was rejected by Cloud Firestore REST API.',
      401
    );
  }
  if (status === 403) {
    return new ApiHttpError(
      'FORBIDDEN_FIRESTORE_RULES_DENIED',
      `Firestore Security Rules denied ${operation} on "${collection}" (${msg}). Ensure the updated least-privilege firestore.rules have been published in the Firebase Console for project "linisgo-mobile", and that you own the target record.`,
      403
    );
  }
  if (status === 404) {
    return new ApiHttpError('NOT_FOUND', `Requested record in "${collection}" was not found.`, 404);
  }
  return new ApiHttpError('FIRESTORE_REST_ERROR', msg, status >= 400 && status < 600 ? status : 502);
}

export function createLiveFirestoreUserRestTransport(): FirestoreUserRestTransport {
  const baseUrl = getFirestoreRestBaseUrl();

  function buildHeaders(bearerToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    return headers;
  }

  return {
    async getDocument<T>(collection: string, docId: string, bearerToken?: string): Promise<T | null> {
      const url = `${baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(bearerToken),
      });

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw mapFirestoreRestHttpError(res.status, errBody, collection, 'get');
      }

      const body = (await res.json()) as FirestoreRestDocument;
      return fromFirestoreRestDocument<T>(body);
    },

    async setDocument<T extends object>(
      collection: string,
      docId: string,
      data: T,
      bearerToken: string
    ): Promise<T> {
      const url = `${baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
      const payloadFields = toFirestoreRestFields(data);
      const res = await fetch(url, {
        method: 'PATCH',
        headers: buildHeaders(bearerToken),
        body: JSON.stringify({
          fields: payloadFields,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        console.error(`[Firestore REST] setDocument failed: ${collection}/${docId} status=${res.status}`, JSON.stringify(errBody));
        throw mapFirestoreRestHttpError(res.status, errBody, collection, 'write');
      }

      const body = (await res.json()) as FirestoreRestDocument;
      return fromFirestoreRestDocument<T>(body);
    },

    async deleteDocument(collection: string, docId: string, bearerToken: string): Promise<void> {
      const url = `${baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: buildHeaders(bearerToken),
      });

      if (res.status === 404) {
        return;
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw mapFirestoreRestHttpError(res.status, errBody, collection, 'delete');
      }
    },

    async runStructuredQuery<T>(
      structuredQuery: Record<string, unknown>,
      bearerToken?: string
    ): Promise<T[]> {
      const url = `${baseUrl}:runQuery`;
      const res = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(bearerToken),
        body: JSON.stringify({ structuredQuery }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw mapFirestoreRestHttpError(res.status, errBody, 'structuredQuery', 'list');
      }

      const rows = (await res.json()) as Array<{ document?: FirestoreRestDocument }>;
      const results: T[] = [];
      for (const row of rows) {
        if (row.document) {
          results.push(fromFirestoreRestDocument<T>(row.document));
        }
      }
      return results;
    },
  };
}

export interface FirestoreUserRestService {
  getPublicProfile(uid: string, bearerToken?: string): Promise<PublicProfileDocument | null>;
  getPublicProfilesList(limit?: number): Promise<PublicProfileDocument[]>;
  getPublicMapMarkersList(limit?: number): Promise<PublicMapMarkerDocument[]>;
  getOwnProfileBundle(
    uid: string,
    bearerToken: string
  ): Promise<{
    publicProfile: PublicProfileDocument | null;
    privateProfile: PrivateProfileDocument | null;
    accountState: AccountStateDocument | null;
    mapMarker: PublicMapMarkerDocument | null;
  }>;
  upsertOwnProfileBundle(params: {
    uid: string;
    bearerToken: string;
    publicProfile: PublicProfileDocument;
    privateProfile: PrivateProfileDocument;
    mapMarker: PublicMapMarkerDocument | null;
  }): Promise<{
    publicProfile: PublicProfileDocument;
    privateProfile: PrivateProfileDocument;
    mapMarker: PublicMapMarkerDocument | null;
  }>;
  listPublicPosts(filter: {
    postType?: PostType;
    targetMunicipalityId?: string;
    coverageMunicipalityId?: string;
    cleaningCategory?: string;
    limit?: number;
  }): Promise<PostDocument[]>;
  listOwnPosts(uid: string, bearerToken: string, limit?: number): Promise<PostDocument[]>;
  getPostById(postId: string, bearerToken?: string): Promise<PostDocument | null>;
  upsertOwnPost(params: {
    uid: string;
    bearerToken: string;
    post: PostDocument;
  }): Promise<PostDocument>;
  updateOwnPostLifecycle(params: {
    uid: string;
    bearerToken: string;
    postId: string;
    publicationState?: PostPublicationState;
    lifecycleStatus: PostLifecycleStatus;
  }): Promise<PostDocument>;
}

export function createFirestoreUserRestService(
  transport: FirestoreUserRestTransport = createLiveFirestoreUserRestTransport()
): FirestoreUserRestService {
  function eqFilter(fieldPath: string, val: unknown): Record<string, unknown> {
    return {
      fieldFilter: {
        field: { fieldPath },
        op: 'EQUAL',
        value: toFirestoreRestValue(val),
      },
    };
  }

  return {
    async getPublicProfile(uid: string, bearerToken?: string): Promise<PublicProfileDocument | null> {
      return transport.getDocument<PublicProfileDocument>('publicProfiles', uid, bearerToken);
    },

    async getPublicProfilesList(limit = 50): Promise<PublicProfileDocument[]> {
      const cappedLimit = Math.min(Math.max(1, limit), 100);
      return transport.runStructuredQuery<PublicProfileDocument>({
        from: [{ collectionId: 'publicProfiles' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              eqFilter('publicVisible', true),
              eqFilter('visibilityState', 'public'),
              eqFilter('authorAccountState', 'active'),
            ],
          },
        },
        limit: cappedLimit,
      });
    },

    async getPublicMapMarkersList(limit = 50): Promise<PublicMapMarkerDocument[]> {
      const cappedLimit = Math.min(Math.max(1, limit), 100);
      return transport.runStructuredQuery<PublicMapMarkerDocument>({
        from: [{ collectionId: 'publicMapMarkers' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              eqFilter('publicVisible', true),
              eqFilter('mapConsent', true),
              eqFilter('authorAccountState', 'active'),
            ],
          },
        },
        limit: cappedLimit,
      });
    },

    async getOwnProfileBundle(uid: string, bearerToken: string) {
      const [publicProfile, privateProfile, accountState, mapMarker] = await Promise.all([
        transport.getDocument<PublicProfileDocument>('publicProfiles', uid, bearerToken),
        transport.getDocument<PrivateProfileDocument>('privateProfiles', uid, bearerToken),
        transport
          .getDocument<AccountStateDocument>('accountStates', uid, bearerToken)
          .catch(() => null),
        transport
          .getDocument<PublicMapMarkerDocument>('publicMapMarkers', uid, bearerToken)
          .catch(() => null),
      ]);

      return {
        publicProfile,
        privateProfile,
        accountState,
        mapMarker,
      };
    },

    async upsertOwnProfileBundle(params) {
      const { uid, bearerToken } = params;
      const [existingPub, existingPriv, existingAcct] = await Promise.all([
        transport.getDocument<PublicProfileDocument>('publicProfiles', uid, bearerToken),
        transport.getDocument<PrivateProfileDocument>('privateProfiles', uid, bearerToken),
        transport.getDocument<AccountStateDocument>('accountStates', uid, bearerToken),
      ]);

      const authoritativeState: AccountLifecycleState =
        existingAcct?.state ??
        ((existingAcct as unknown as { accountState?: AccountLifecycleState })?.accountState) ??
        existingPub?.authorAccountState ??
        'active';

      if (authoritativeState !== 'active') {
        throw new ApiHttpError(
          authoritativeState === 'suspended'
            ? 'FORBIDDEN_ACCOUNT_SUSPENDED'
            : 'FORBIDDEN_ACCOUNT_NOT_ACTIVE',
          `Account is currently "${authoritativeState}" and cannot update profile records.`,
          403
        );
      }

      const publicToSave: PublicProfileDocument = {
        ...params.publicProfile,
        uid,
        authorAccountState: 'active',
        publicVisible: params.publicProfile.visibilityState === 'public',
        createdAt: existingPub?.createdAt ?? params.publicProfile.createdAt,
      };

      const privateToSave: PrivateProfileDocument = {
        ...params.privateProfile,
        uid,
        createdAt: existingPriv?.createdAt ?? params.privateProfile.createdAt,
      };

      const [savedPub, savedPriv] = await Promise.all([
        transport.setDocument('publicProfiles', uid, publicToSave, bearerToken),
        transport.setDocument('privateProfiles', uid, privateToSave, bearerToken),
      ]);

      let savedMarker: PublicMapMarkerDocument | null = null;
      if (params.mapMarker && params.privateProfile.mapConsent) {
        const markerToSave: PublicMapMarkerDocument = {
          ...params.mapMarker,
          uid,
          authorAccountState: 'active',
          publicVisible: true,
        };
        savedMarker = await transport.setDocument(
          'publicMapMarkers',
          uid,
          markerToSave,
          bearerToken
        );
      } else {
        await transport.deleteDocument('publicMapMarkers', uid, bearerToken).catch(() => undefined);
      }

      return {
        publicProfile: savedPub,
        privateProfile: savedPriv,
        mapMarker: savedMarker,
      };
    },

    async listPublicPosts(filter): Promise<PostDocument[]> {
      const cappedLimit = Math.min(Math.max(1, filter.limit ?? 50), 100);
      const baseFilters = [
        eqFilter('publicVisible', true),
        eqFilter('publicationState', 'published'),
        eqFilter('moderationStatus', 'none'),
        eqFilter('authorAccountState', 'active'),
      ];

      if (filter.postType === 'request') {
        baseFilters.push(eqFilter('postType', 'request'), eqFilter('lifecycleStatus', 'open'));
      } else if (filter.postType === 'offer') {
        baseFilters.push(eqFilter('postType', 'offer'), eqFilter('lifecycleStatus', 'active'));
      }

      const rawPosts = await transport.runStructuredQuery<PostDocument>({
        from: [{ collectionId: 'posts' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: baseFilters,
          },
        },
        limit: cappedLimit,
      });

      return rawPosts
        .filter(post => {
          const isOpenOrActive =
            (post.postType === 'request' && post.lifecycleStatus === 'open') ||
            (post.postType === 'offer' && post.lifecycleStatus === 'active');
          if (!isOpenOrActive) {
            return false;
          }
          if (filter.cleaningCategory && post.cleaningCategory !== filter.cleaningCategory) {
            return false;
          }
          if (
            filter.targetMunicipalityId &&
            post.targetMunicipalityId !== filter.targetMunicipalityId
          ) {
            return false;
          }
          if (
            filter.coverageMunicipalityId &&
            !post.coverageAreaIds.includes(filter.coverageMunicipalityId)
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async listOwnPosts(uid: string, bearerToken: string, limit = 50): Promise<PostDocument[]> {
      const cappedLimit = Math.min(Math.max(1, limit), 100);
      const rawPosts = await transport.runStructuredQuery<PostDocument>(
        {
          from: [{ collectionId: 'posts' }],
          where: eqFilter('authorUid', uid),
          limit: cappedLimit,
        },
        bearerToken
      );
      return rawPosts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async getPostById(postId: string, bearerToken?: string): Promise<PostDocument | null> {
      return transport.getDocument<PostDocument>('posts', postId, bearerToken);
    },

    async upsertOwnPost(params: {
      uid: string;
      bearerToken: string;
      post: PostDocument;
    }): Promise<PostDocument> {
      const { uid, bearerToken, post } = params;
      if (post.authorUid !== uid) {
        throw new ApiHttpError(
          'FORBIDDEN_NOT_POST_OWNER',
          'You can only create or edit posts authored by your own Firebase UID.',
          403
        );
      }

      // Only HTTP 404 is treated as a missing document (getDocument returns null on 404).
      // 401, 403, network failures, and other errors are propagated cleanly.
      const [existingPost, existingAcct] = await Promise.all([
        transport.getDocument<PostDocument>('posts', post.id, bearerToken),
        transport.getDocument<AccountStateDocument>('accountStates', uid, bearerToken),
      ]);

      if (existingPost && existingPost.authorUid !== uid) {
        throw new ApiHttpError(
          'FORBIDDEN_NOT_POST_OWNER',
          'Cannot modify a post belonging to another user.',
          403
        );
      }

      // Reconciles both accountStates.state and accountStates.accountState against the backend data model
      const authoritativeAccountState: AccountLifecycleState =
        existingAcct?.state ??
        ((existingAcct as unknown as { accountState?: AccountLifecycleState })?.accountState) ??
        existingPost?.authorAccountState ??
        'active';

      if (authoritativeAccountState !== 'active') {
        throw new ApiHttpError(
          authoritativeAccountState === 'suspended'
            ? 'FORBIDDEN_ACCOUNT_SUSPENDED'
            : 'FORBIDDEN_ACCOUNT_NOT_ACTIVE',
          `Account is currently "${authoritativeAccountState}" and cannot publish or edit posts.`,
          403
        );
      }

      if (existingPost && existingPost.moderationStatus !== 'none') {
        throw new ApiHttpError(
          'FORBIDDEN_POST_MODERATED',
          `Post "${post.id}" is under administrative moderation (${existingPost.moderationStatus}) and cannot be modified by the owner.`,
          403
        );
      }

      const mergedPost: PostDocument = {
        ...post,
        authorUid: uid,
        moderationStatus: existingPost?.moderationStatus ?? 'none',
        moderationReferenceId: existingPost?.moderationReferenceId ?? null,
        authorAccountState: 'active',
        createdAt: existingPost?.createdAt ?? post.createdAt,
        publishedAt:
          post.publicationState === 'published'
            ? existingPost?.publishedAt ?? post.publishedAt ?? post.updatedAt
            : existingPost?.publishedAt ?? null,
        publicVisible: computePostPublicVisibility({
          postType: post.postType,
          publicationState: post.publicationState,
          lifecycleStatus: post.lifecycleStatus,
          moderationStatus: existingPost?.moderationStatus ?? 'none',
          authorAccountState: 'active',
        }),
      };

      return transport.setDocument('posts', mergedPost.id, mergedPost, bearerToken);
    },

    async updateOwnPostLifecycle(params: {
      uid: string;
      bearerToken: string;
      postId: string;
      publicationState?: PostPublicationState;
      lifecycleStatus: PostLifecycleStatus;
    }): Promise<PostDocument> {
      const { uid, bearerToken, postId, lifecycleStatus } = params;
      const existing = await transport.getDocument<PostDocument>('posts', postId, bearerToken);

      if (!existing) {
        throw new ApiHttpError('NOT_FOUND', `Post "${postId}" was not found.`, 404);
      }
      if (existing.authorUid !== uid) {
        throw new ApiHttpError(
          'FORBIDDEN_NOT_POST_OWNER',
          'You can only change the status of your own posts.',
          403
        );
      }
      if (existing.moderationStatus !== 'none') {
        throw new ApiHttpError(
          'FORBIDDEN_POST_MODERATED',
          'Administratively hidden or moderated posts cannot be modified by the owner.',
          403
        );
      }
      if (existing.authorAccountState !== 'active') {
        throw new ApiHttpError(
          'FORBIDDEN_ACCOUNT_NOT_ACTIVE',
          'Your account must be active to change post status.',
          403
        );
      }

      if (
        existing.postType === 'request' &&
        lifecycleStatus !== 'open' &&
        lifecycleStatus !== 'closed'
      ) {
        throw new ApiHttpError(
          'VALIDATION_ERROR',
          `Invalid lifecycleStatus "${lifecycleStatus}" for Service Request. Allowed: open, closed.`,
          400
        );
      }
      if (
        existing.postType === 'offer' &&
        lifecycleStatus !== 'active' &&
        lifecycleStatus !== 'archived'
      ) {
        throw new ApiHttpError(
          'VALIDATION_ERROR',
          `Invalid lifecycleStatus "${lifecycleStatus}" for Service Offer. Allowed: active, archived.`,
          400
        );
      }

      const nextPubState: PostPublicationState =
        params.publicationState ?? existing.publicationState;

      if (nextPubState === 'published') {
        if (existing.postType === 'request' && !existing.targetMunicipalityId) {
          throw new ApiHttpError(
            'VALIDATION_ERROR',
            'Service Requests require a valid Oriental Mindoro targetMunicipalityId before publishing.',
            400
          );
        }
        if (existing.postType === 'offer' && existing.coverageAreaIds.length === 0) {
          throw new ApiHttpError(
            'VALIDATION_ERROR',
            'Service Offers require at least one Oriental Mindoro coverage municipality before publishing.',
            400
          );
        }
      }

      const nowIso = new Date().toISOString();
      const updatedPost: PostDocument = {
        ...existing,
        publicationState: nextPubState,
        lifecycleStatus,
        publicVisible: computePostPublicVisibility({
          postType: existing.postType,
          publicationState: nextPubState,
          lifecycleStatus,
          moderationStatus: existing.moderationStatus,
          authorAccountState: existing.authorAccountState,
        }),
        updatedAt: nowIso,
        publishedAt:
          nextPubState === 'published' ? existing.publishedAt ?? nowIso : existing.publishedAt,
      };

      return transport.setDocument('posts', postId, updatedPost, bearerToken);
    },
  };
}

export const defaultFirestoreUserRestService = createFirestoreUserRestService();
