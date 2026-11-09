import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import {
  and,
  collection,
  doc,
  getDocFromServer,
  limit,
  onSnapshot,
  or,
  query,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { getOrInitializeFirebaseAuth, getOrInitializeFirebaseFirestore } from '../config/firebase.config';
import { CleaningPost, PostCategory, PostStatus, PostType } from '../../shared/models/post.model';
import { UserProfile, UserProfileTag, SuspensionType, UserAccountState } from '../../shared/models/user.model';
import { ReportItem, AppealItem, ReportReason, ReportStatus, AppealStatus } from '../../shared/models/report.model';
import { AuditLog, AuditActionType } from '../../shared/models/audit.model';
import {
  ORIENTAL_MINDORO_LOCATIONS,
  OrientalMindoroLocation,
  LocationFilterMode,
  doesPostMatchLocationFilter,
  getLocationById,
  getPostLocationSummary,
  isValidLocationId,
} from '../../shared/models/location.model';
import { AuthService } from './auth.service';
import {
  FirestorePostDto,
  FirestorePrivateProfileDto,
  FirestorePublicMapMarkerDto,
  FirestorePublicProfileDto,
  PrivateApiService,
} from './private-api.service';

export enum FirestoreOperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: FirestoreOperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: FirestoreOperationType,
  path: string | null
): FirestoreErrorInfo {
  const auth = getOrInitializeFirebaseAuth();
  const currentUser = auth?.currentUser;
  return {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
  };
}

export interface InAppNotification {
  id: string;
  recipientId: string;
  title: string;
  detail: string;
  read: boolean;
  createdAt: string;
}

export interface MapAreaSummary {
  location: OrientalMindoroLocation;
  posts: CleaningPost[];
  requestCount: number;
  offerCount: number;
}

export interface PersistenceMutationResult<T = void> {
  persisted: boolean;
  error?: string;
  value?: T;
}

const FRONTEND_TO_BACKEND_CATEGORY: Record<PostCategory, string> = {
  General: 'General House Cleaning',
  Deep: 'Deep Cleaning',
  Kitchen: 'Kitchen & Bath Focus',
  Bathroom: 'Kitchen & Bath Focus',
  Laundry: 'Laundry & Ironing',
  Other: 'Custom / Other',
};

function mapBackendCategoryToFrontend(raw: string): PostCategory {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('deep')) return 'Deep';
  if (lower.includes('kitchen')) return 'Kitchen';
  if (lower.includes('bath')) return 'Bathroom';
  if (lower.includes('laundry')) return 'Laundry';
  if (lower.includes('custom') || lower.includes('other')) return 'Other';
  return 'General';
}

function parsePriceAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

@Injectable({
  providedIn: 'root',
})
export class PublicDataService implements OnDestroy {
  private readonly STORAGE_DATA_KEY = 'linisgo_data_v3';
  private readonly authService = inject(AuthService);
  private readonly privateApi = inject(PrivateApiService);

  readonly locations = ORIENTAL_MINDORO_LOCATIONS;

  // Real-time Firestore listener handles (reused across navigation; never duplicated)
  private postsUnsubscribe: Unsubscribe | null = null;
  private profilesUnsubscribe: Unsubscribe | null = null;
  private mapMarkersUnsubscribe: Unsubscribe | null = null;
  private connectionTestedOnce = false;
  private lastSyncedAuthUid: string | null = null;

  readonly activeRealtimeListenerCountSignal = signal<number>(0);
  readonly realtimeSyncStatusSignal = signal<'idle' | 'active' | 'rules_blocked' | 'error'>('idle');
  readonly lastFirestoreErrorSignal = signal<string | null>(null);
  readonly hasRealFirestoreDataSignal = signal<boolean>(false);

  // State Signals
  readonly usersSignal = signal<UserProfile[]>([]);
  readonly postsSignal = signal<CleaningPost[]>([]);
  readonly savedPostsSignal = signal<string[]>([]);
  readonly savedUsersSignal = signal<string[]>([]);
  private readonly userSavedPostsMapSignal = signal<Record<string, string[]>>({});
  private readonly userSavedUsersMapSignal = signal<Record<string, string[]>>({});
  readonly notificationsSignal = signal<InAppNotification[]>([]);
  readonly reportsSignal = signal<ReportItem[]>([]);
  readonly appealsSignal = signal<AppealItem[]>([]);
  readonly auditLogsSignal = signal<AuditLog[]>([]);
  readonly adminNotificationsSignal = signal<InAppNotification[]>([]);

  // Public & User filter state
  readonly searchQuery = signal<string>('');
  readonly selectedTag = signal<'all' | UserProfileTag>('all');
  readonly selectedType = signal<'all' | PostType>('all');
  readonly selectedCategory = signal<'all' | PostCategory>('all');
  readonly selectedLocationId = signal<string>('all');
  readonly selectedLocationMode = signal<LocationFilterMode>('all');
  readonly selectedAvailability = signal<'all' | 'available'>('all');
  readonly maxPriceFilter = signal<number | null>(null);
  readonly selectedSort = signal<'newest' | 'price-asc'>('newest');

  readonly activeActorId = computed<string>(() => {
    const fbUser = this.authService.firebaseUser();
    return fbUser ? fbUser.uid : 'demo';
  });

  readonly isMockActor = computed<boolean>(() => {
    const id = this.activeActorId();
    return ['demo', 'ana', 'ben', 'mira', 'carlos'].includes(id);
  });

  readonly currentUser = computed(() => {
    const actorId = this.activeActorId();
    return this.usersSignal().find(u => u.id === actorId);
  });

  readonly publicPosts = computed(() => {
    const users = this.usersSignal();
    const activeUserIds = new Set(users.filter(u => u.state === 'active').map(u => u.id));
    return this.postsSignal().filter(
      p =>
        !p.moderated &&
        (activeUserIds.has(p.authorId) || !['demo', 'ana', 'ben', 'mira', 'carlos'].includes(p.authorId)) &&
        p.status !== 'archived' &&
        p.status !== 'draft' &&
        p.status !== 'closed'
    );
  });

  readonly filteredPosts = computed(() => {
    const queryStr = this.searchQuery().toLowerCase().trim();
    const tag = this.selectedTag();
    const type = this.selectedType();
    const cat = this.selectedCategory();
    const locId = this.selectedLocationId();
    const locMode = this.selectedLocationMode();
    const avail = this.selectedAvailability();
    const maxPrice = this.maxPriceFilter();
    const sort = this.selectedSort();

    const usersMap = new Map(this.usersSignal().map(u => [u.id, u]));

    return this.publicPosts()
      .filter(post => {
        if (type !== 'all' && post.type !== type) return false;
        if (cat !== 'all' && post.category !== cat) return false;
        if (tag !== 'all' && post.authorTag !== tag) return false;

        if (!doesPostMatchLocationFilter(post, locId, locMode)) {
          return false;
        }

        if (avail === 'available') {
          const author = usersMap.get(post.authorId);
          if (author && !author.available) return false;
        }

        if (maxPrice !== null && maxPrice > 0) {
          if (post.amount == null || post.amount > maxPrice) return false;
        }

        if (queryStr) {
          const matchTitle = post.title.toLowerCase().includes(queryStr);
          const matchDesc = post.description.toLowerCase().includes(queryStr);
          const matchCat = post.category.toLowerCase().includes(queryStr);
          const matchAuthor = post.authorName.toLowerCase().includes(queryStr);
          const locSummary = getPostLocationSummary(post).toLowerCase();
          const matchLoc = locSummary.includes(queryStr);
          if (!matchTitle && !matchDesc && !matchCat && !matchAuthor && !matchLoc) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'price-asc') {
          return (a.amount || 0) - (b.amount || 0);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  });

  readonly filteredUsers = computed(() => {
    const queryStr = this.searchQuery().toLowerCase().trim();
    const tag = this.selectedTag();
    const locId = this.selectedLocationId();
    const avail = this.selectedAvailability();
    const locObj = locId !== 'all' ? this.locations.find(l => l.id === locId) : undefined;

    return this.usersSignal()
      .filter(u => u.state === 'active')
      .filter(user => {
        if (tag !== 'all' && user.tag !== tag) return false;
        if (avail === 'available' && !user.available) return false;
        if (locObj) {
          const userLocLabel = (user.approxLocation?.label || '').toLowerCase();
          const hasPostInLoc = this.publicPosts().some(
            p =>
              p.authorId === user.id &&
              doesPostMatchLocationFilter(p, locObj.id, this.selectedLocationMode())
          );
          if (!userLocLabel.includes(locObj.name.toLowerCase()) && !hasPostInLoc) {
            return false;
          }
        }
        if (queryStr) {
          const matchName = user.name.toLowerCase().includes(queryStr);
          const matchBio = user.bio.toLowerCase().includes(queryStr);
          const matchLoc = user.approxLocation?.label?.toLowerCase().includes(queryStr) ?? false;
          if (!matchName && !matchBio && !matchLoc) return false;
        }
        return true;
      });
  });

  readonly mapVisibleUsers = computed(() => {
    return this.filteredUsers().filter(u => u.mapConsent && u.approxLocation);
  });

  readonly mapAreaSummaries = computed<MapAreaSummary[]>(() => {
    const posts = this.filteredPosts();
    return this.locations
      .map(location => {
        const areaPosts = posts.filter(post =>
          doesPostMatchLocationFilter(post, location.id, 'all')
        );
        const requestCount = areaPosts.filter(p => p.type === 'request').length;
        const offerCount = areaPosts.filter(p => p.type === 'offer').length;
        return {
          location,
          posts: areaPosts,
          requestCount,
          offerCount,
        };
      })
      .filter(item => item.posts.length > 0);
  });

  readonly distinctMappedPostsCount = computed(() => {
    const uniquePostIds = new Set<string>();
    for (const area of this.mapAreaSummaries()) {
      for (const post of area.posts) {
        uniquePostIds.add(post.id);
      }
    }
    return uniquePostIds.size;
  });

  readonly myPosts = computed(() => {
    const actorId = this.activeActorId();
    return this.postsSignal().filter(p => p.authorId === actorId);
  });

  readonly activeSavedPostIds = computed<string[]>(() => {
    const actorId = this.activeActorId();
    if (actorId === 'demo') {
      return this.savedPostsSignal();
    }
    return this.userSavedPostsMapSignal()[actorId] || [];
  });

  readonly activeSavedUserIds = computed<string[]>(() => {
    const actorId = this.activeActorId();
    if (actorId === 'demo') {
      return this.savedUsersSignal();
    }
    return this.userSavedUsersMapSignal()[actorId] || [];
  });

  readonly mySavedPosts = computed(() => {
    const ids = new Set(this.activeSavedPostIds());
    return this.postsSignal().filter(p => ids.has(p.id) && !p.moderated);
  });

  readonly mySavedUsers = computed(() => {
    const ids = new Set(this.activeSavedUserIds());
    return this.usersSignal().filter(u => ids.has(u.id) && u.state === 'active');
  });

  readonly myNotifications = computed(() => {
    const actorId = this.activeActorId();
    return this.notificationsSignal().filter(n => n.recipientId === actorId);
  });

  readonly unreadNotificationsCount = computed(() => {
    return this.myNotifications().filter(n => !n.read).length;
  });

  readonly myReports = computed(() => {
    const actorId = this.activeActorId();
    return this.reportsSignal().filter(r => r.reporterId === actorId);
  });

  readonly myAppeals = computed(() => {
    const actorId = this.activeActorId();
    return this.appealsSignal().filter(a => a.appellantId === actorId);
  });

  readonly adminStats = computed(() => {
    const users = this.usersSignal();
    const posts = this.postsSignal();
    const reports = this.reportsSignal();
    const appeals = this.appealsSignal();

    return {
      totalUsers: users.length,
      publishedPosts: posts.filter(p => !p.moderated && p.status !== 'archived' && p.status !== 'draft').length,
      pendingReports: reports.filter(r => r.status === 'Pending').length,
      pendingAppeals: appeals.filter(a => a.status === 'Pending').length,
      suspendedAccounts: users.filter(u => u.state === 'suspended').length,
      mapVisibleProfiles: users.filter(u => u.state === 'active' && u.mapConsent && !!u.approxLocation).length,
    };
  });

  readonly unreadAdminNotificationsCount = computed(() => {
    return this.adminNotificationsSignal().filter(n => !n.read).length;
  });

  constructor() {
    this.loadInitialData();
    this.startRealtimeDiscovery();

    effect(
      () => {
        const fbUser = this.authService.firebaseUser();
        if (!fbUser) {
          this.lastSyncedAuthUid = null;
          return;
        }

        const uid = fbUser.uid;
        if (this.lastSyncedAuthUid === uid) {
          return;
        }
        this.lastSyncedAuthUid = uid;
        void this.syncAuthenticatedUserWithFirestore(uid, fbUser.displayName, fbUser.email);
      },
      { allowSignalWrites: true }
    );
  }

  ngOnDestroy(): void {
    this.stopRealtimeDiscovery();
  }

  /**
   * Returns the current number of active Firestore `onSnapshot` listeners.
   * Used to verify zero duplicate subscriptions.
   */
  getActiveRealtimeListenerCount(): number {
    let count = 0;
    if (this.postsUnsubscribe) count++;
    if (this.profilesUnsubscribe) count++;
    if (this.mapMarkersUnsubscribe) count++;
    return count;
  }

  private updateListenerCountSignal(): void {
    this.activeRealtimeListenerCountSignal.set(this.getActiveRealtimeListenerCount());
  }

  /**
   * Starts read-only Firebase Web SDK `onSnapshot` subscriptions for:
   * 1. Published public posts (`/posts` with equality filters and `limit(50)`)
   * 2. Public user profiles & availability (`/publicProfiles` with `limit(50)`)
   * 3. Opt-in approximate map markers (`/publicMapMarkers` with `limit(50)`)
   *
   * Reuses existing listeners if already active — never creates duplicate subscriptions.
   * If remote Firestore Security Rules on `linisgo-mobile` reject direct client queries with
   * "Missing or insufficient permissions", listeners are stopped and the service falls back
   * seamlessly to the Express REST API endpoints (`/api/posts` and `/api/profiles/public`).
   */
  startRealtimeDiscovery(): void {
    const db = getOrInitializeFirebaseFirestore();
    if (!db) {
      void this.loadPublicDataViaRestFallback();
      return;
    }

    if (!this.connectionTestedOnce) {
      this.connectionTestedOnce = true;
      void getDocFromServer(doc(db, 'publicProfiles', '_connection_probe')).catch(err => {
        if (err instanceof Error && err.message.includes('the client is offline')) {
          console.error('Please check your Firebase configuration.');
        }
      });
    }

    // 1. Reused real-time listener for published posts (equality-only AND query matches firestore.rules)
    if (!this.postsUnsubscribe) {
      const postsQuery = query(
        collection(db, 'posts'),
        where('publicVisible', '==', true),
        where('publicationState', '==', 'published'),
        where('moderationStatus', '==', 'none'),
        where('authorAccountState', '==', 'active'),
        limit(50)
      );

      this.postsUnsubscribe = onSnapshot(
        postsQuery,
        snapshot => {
          this.realtimeSyncStatusSignal.set('active');
          const livePosts: CleaningPost[] = [];
          snapshot.forEach(docSnap => {
            const dto = docSnap.data() as FirestorePostDto;
            const isOpenOrActive =
              (dto.postType === 'request' && dto.lifecycleStatus === 'open') ||
              (dto.postType === 'offer' && dto.lifecycleStatus === 'active');
            if (dto.publicVisible && dto.publicationState === 'published' && dto.moderationStatus === 'none' && isOpenOrActive) {
              livePosts.push(this.mapFirestorePostDtoToCleaningPost(dto));
            }
          });

          if (livePosts.length > 0) {
            this.mergeLivePostsIntoStore(livePosts, true);
          }
        },
        err => {
          const errInfo = buildFirestoreErrorInfo(err, FirestoreOperationType.LIST, 'posts');
          this.lastFirestoreErrorSignal.set(errInfo.error);
          const isRulesBlocked = errInfo.error.includes('Missing or insufficient permissions');
          this.realtimeSyncStatusSignal.set(isRulesBlocked ? 'rules_blocked' : 'error');
          if (isRulesBlocked) {
            // Stop polling listeners and switch to Express REST API fallback
            this.stopRealtimeDiscovery();
            void this.loadPublicDataViaRestFallback();
          } else {
            console.error('Firestore Error: ', JSON.stringify(errInfo));
          }
        }
      );
    }

    // 2. Reused real-time listener for active public profiles & availability
    if (!this.profilesUnsubscribe) {
      const profilesQuery = query(
        collection(db, 'publicProfiles'),
        where('publicVisible', '==', true),
        where('visibilityState', '==', 'public'),
        where('authorAccountState', '==', 'active'),
        limit(50)
      );

      this.profilesUnsubscribe = onSnapshot(
        profilesQuery,
        snapshot => {
          this.realtimeSyncStatusSignal.set('active');
          const liveProfiles: UserProfile[] = [];
          snapshot.forEach(docSnap => {
            const dto = docSnap.data() as FirestorePublicProfileDto;
            liveProfiles.push(this.mapPublicProfileDtoToUserProfile(dto));
          });

          if (liveProfiles.length > 0) {
            this.mergeLiveProfilesIntoStore(liveProfiles);
          }
        },
        err => {
          const errInfo = buildFirestoreErrorInfo(
            err,
            FirestoreOperationType.LIST,
            'publicProfiles'
          );
          this.lastFirestoreErrorSignal.set(errInfo.error);
          const isRulesBlocked = errInfo.error.includes('Missing or insufficient permissions');
          if (isRulesBlocked) {
            if (this.profilesUnsubscribe) {
              this.profilesUnsubscribe();
              this.profilesUnsubscribe = null;
            }
            this.updateListenerCountSignal();
          } else {
            console.error('Firestore Error: ', JSON.stringify(errInfo));
          }
        }
      );
    }

    // 3. Reused real-time listener for opt-in approximate map markers
    if (!this.mapMarkersUnsubscribe) {
      const markersQuery = query(
        collection(db, 'publicMapMarkers'),
        where('publicVisible', '==', true),
        where('mapConsent', '==', true),
        where('authorAccountState', '==', 'active'),
        limit(50)
      );

      this.mapMarkersUnsubscribe = onSnapshot(
        markersQuery,
        snapshot => {
          const markersMap = new Map<string, FirestorePublicMapMarkerDto>();
          snapshot.forEach(docSnap => {
            const dto = docSnap.data() as FirestorePublicMapMarkerDto;
            markersMap.set(dto.uid, dto);
          });

          if (markersMap.size > 0) {
            this.usersSignal.update(users =>
              users.map(u => {
                const marker = markersMap.get(u.id);
                if (!marker) return u;
                return {
                  ...u,
                  mapConsent: true,
                  approxLocation: {
                    lat: marker.approximateLat,
                    lng: marker.approximateLng,
                    label: `${marker.municipalityName} (Approximate Area)`,
                  },
                };
              })
            );
          }
        },
        err => {
          const errInfo = buildFirestoreErrorInfo(
            err,
            FirestoreOperationType.LIST,
            'publicMapMarkers'
          );
          const isRulesBlocked = errInfo.error.includes('Missing or insufficient permissions');
          if (isRulesBlocked) {
            if (this.mapMarkersUnsubscribe) {
              this.mapMarkersUnsubscribe();
              this.mapMarkersUnsubscribe = null;
            }
            this.updateListenerCountSignal();
          } else {
            console.error('Firestore Error: ', JSON.stringify(errInfo));
          }
        }
      );
    }

    this.updateListenerCountSignal();
  }

  /**
   * Fallback loader that queries public posts and public profiles from the Express REST API
   * when real-time client SDK subscriptions are blocked by un-deployed Firestore rules.
   */
  async loadPublicDataViaRestFallback(): Promise<void> {
    try {
      const [postsRes, profilesRes] = await Promise.all([
        firstValueFrom(this.privateApi.listPublicPosts()).catch(() => null),
        firstValueFrom(this.privateApi.listPublicProfiles()).catch(() => null),
      ]);

      if (postsRes && Array.isArray(postsRes.posts) && postsRes.posts.length > 0) {
        const mapped = postsRes.posts.map(dto => this.mapFirestorePostDtoToCleaningPost(dto));
        this.mergeLivePostsIntoStore(mapped, true);
      }

      if (profilesRes && Array.isArray(profilesRes.profiles) && profilesRes.profiles.length > 0) {
        const markersMap = new Map(
          (profilesRes.mapMarkers || []).map(m => [m.uid, m])
        );
        const mapped = profilesRes.profiles.map(p =>
          this.mapPublicProfileDtoToUserProfile(p, null, markersMap.get(p.uid) || null)
        );
        this.mergeLiveProfilesIntoStore(mapped);
      }
    } catch {
      // Retain seeded local store silently
    }
  }

  /**
   * Unsubscribes all active Firestore `onSnapshot` listeners cleanly.
   */
  stopRealtimeDiscovery(): void {
    if (this.postsUnsubscribe) {
      this.postsUnsubscribe();
      this.postsUnsubscribe = null;
    }
    if (this.profilesUnsubscribe) {
      this.profilesUnsubscribe();
      this.profilesUnsubscribe = null;
    }
    if (this.mapMarkersUnsubscribe) {
      this.mapMarkersUnsubscribe();
      this.mapMarkersUnsubscribe = null;
    }
    this.updateListenerCountSignal();
  }

  /**
   * Loads the signed-in user's profile and own posts from Cloud Firestore via the Express REST API.
   * If the user has just registered and has no Firestore profile yet, attempts to create their initial
   * profile document via `PUT /api/profiles/me`.
   */
  async syncAuthenticatedUserWithFirestore(
    uid: string,
    fallbackDisplayName?: string | null,
    fallbackEmail?: string | null
  ): Promise<void> {
    const cleanName =
      fallbackDisplayName?.trim() || fallbackEmail?.split('@')[0] || 'LinisGo Member';

    try {
      const bundle = await firstValueFrom(this.privateApi.getOwnProfileBundle());
      if (bundle.publicProfile) {
        const mergedProfile = this.mapPublicProfileDtoToUserProfile(
          bundle.publicProfile,
          bundle.privateProfile,
          bundle.mapMarker
        );
        this.upsertUserInSignal(mergedProfile, true);
      } else {
        // Newly registered user: attempt to persist initial profile to Firestore via REST API
        const created = await firstValueFrom(
          this.privateApi.updateOwnProfileBundle({
            displayName: cleanName.length >= 2 ? cleanName : 'LinisGo User',
            biography: 'LinisGo Finder community member in Oriental Mindoro.',
            profileTag: 'client',
            availability: 'Available',
            serviceAreaMunicipalityIds: ['calapan-city'],
            phoneNumber: null,
            facebookUrl: null,
            showPhonePublicly: false,
            showFacebookPublicly: false,
            mapConsent: false,
            mapMunicipalityId: null,
          })
        );
        if (created.persisted && created.publicProfile) {
          const mergedProfile = this.mapPublicProfileDtoToUserProfile(
            created.publicProfile,
            created.privateProfile,
            created.mapMarker
          );
          this.upsertUserInSignal(mergedProfile, true);
        }
      }
    } catch (err: unknown) {
      this.recordRestError(err, 'profiles/me');
      // Provide an in-memory session placeholder without claiming Firestore persistence succeeded
      const existing = this.usersSignal().find(u => u.id === uid);
      if (!existing) {
        const today = new Date().toISOString().slice(0, 10);
        this.usersSignal.update(list => [
          {
            id: uid,
            name: cleanName,
            tag: 'client',
            bio: '',
            contactPhone: '',
            contactFacebook: '',
            showPhone: false,
            showFacebook: false,
            mapConsent: false,
            approxLocation: { lat: 13.4115, lng: 121.1803, label: 'Calapan City' },
            available: true,
            state: 'active',
            warningCount: 0,
            createdAt: today,
            updatedAt: today,
          },
          ...list,
        ]);
      }
    }

    try {
      const ownPostsRes = await firstValueFrom(this.privateApi.listOwnPosts());
      if (Array.isArray(ownPostsRes.posts) && ownPostsRes.posts.length > 0) {
        const mapped = ownPostsRes.posts.map(dto => this.mapFirestorePostDtoToCleaningPost(dto));
        this.mergeLivePostsIntoStore(mapped, false);
      }
    } catch (err: unknown) {
      this.recordRestError(err, 'posts/mine');
    }
  }

  private mapPublicProfileDtoToUserProfile(
    pub: FirestorePublicProfileDto,
    priv?: FirestorePrivateProfileDto | null,
    marker?: FirestorePublicMapMarkerDto | null
  ): UserProfile {
    const firstAreaId = pub.serviceAreaMunicipalityIds?.[0] || 'calapan-city';
    const areaLoc = getLocationById(firstAreaId) || ORIENTAL_MINDORO_LOCATIONS[0];
    const mapLoc = marker
      ? {
          lat: marker.approximateLat,
          lng: marker.approximateLng,
          label: `${marker.municipalityName} (Approximate Area)`,
        }
      : {
          lat: areaLoc.centerLat,
          lng: areaLoc.centerLng,
          label: areaLoc.name,
        };

    return {
      id: pub.uid,
      name: pub.displayName,
      tag: pub.profileTag === 'provider' ? 'provider' : 'client',
      bio: pub.biography || '',
      contactPhone: priv ? priv.phoneNumber || '' : pub.publicPhone || '',
      contactFacebook: priv ? priv.facebookUrl || '' : pub.publicFacebookUrl || '',
      showPhone: priv ? Boolean(priv.showPhonePublicly) : Boolean(pub.publicPhone),
      showFacebook: priv ? Boolean(priv.showFacebookPublicly) : Boolean(pub.publicFacebookUrl),
      mapConsent: priv ? Boolean(priv.mapConsent) : Boolean(marker?.mapConsent),
      approxLocation: mapLoc,
      available: (pub.availability || '').toLowerCase() !== 'unavailable',
      state: (pub.authorAccountState as UserAccountState) || 'active',
      warningCount: 0,
      createdAt: (pub.createdAt || '').slice(0, 10),
      updatedAt: (pub.updatedAt || '').slice(0, 10),
    };
  }

  private mapFirestorePostDtoToCleaningPost(dto: FirestorePostDto): CleaningPost {
    let status: PostStatus = 'open';
    if (dto.publicationState === 'draft') {
      status = 'draft';
    } else if (dto.postType === 'request') {
      status = dto.lifecycleStatus === 'closed' ? 'closed' : 'open';
    } else {
      status = dto.lifecycleStatus === 'archived' ? 'archived' : 'active';
    }

    return {
      id: dto.id,
      authorId: dto.authorUid,
      authorName: dto.authorDisplayName || 'LinisGo User',
      authorTag: dto.authorProfileTag === 'provider' ? 'provider' : 'client',
      type: dto.postType,
      title: dto.title,
      description: dto.description,
      category: mapBackendCategoryToFrontend(dto.cleaningCategory),
      amount: parsePriceAmount(dto.priceOrBudget),
      status,
      targetLocationId: dto.targetMunicipalityId ?? null,
      coverageAreaIds: Array.isArray(dto.coverageAreaIds) ? dto.coverageAreaIds : [],
      optionalPublicAreaDescription: dto.publicAreaDescription ?? null,
      moderated: dto.moderationStatus !== 'none',
      createdAt: (dto.createdAt || '').slice(0, 10),
      updatedAt: (dto.updatedAt || '').slice(0, 10),
    };
  }

  private upsertUserInSignal(profile: UserProfile, markRealData = false): void {
    this.usersSignal.update(users => {
      const idx = users.findIndex(u => u.id === profile.id);
      let updated: UserProfile[];
      if (idx >= 0) {
        updated = users.map(u => (u.id === profile.id ? profile : u));
      } else {
        updated = [profile, ...users];
      }
      if (markRealData) {
        this.hasRealFirestoreDataSignal.set(true);
      }
      return updated;
    });
    this.persist();
  }

  private mergeLiveProfilesIntoStore(liveProfiles: UserProfile[]): void {
    const liveMap = new Map(liveProfiles.map(u => [u.id, u]));
    this.usersSignal.update(existing => {
      // Once real Firestore profiles arrive, drop mock profiles ('ana', 'ben', 'mira', 'carlos')
      const kept = existing.filter(
        u => !['ana', 'ben', 'mira', 'carlos'].includes(u.id) && !liveMap.has(u.id)
      );
      return [...liveProfiles, ...kept];
    });
    this.hasRealFirestoreDataSignal.set(true);
    this.persist();
  }

  private mergeLivePostsIntoStore(livePosts: CleaningPost[], removeMockPosts: boolean): void {
    const liveMap = new Map(livePosts.map(p => [p.id, p]));
    this.postsSignal.update(existing => {
      const kept = existing.filter(p => {
        if (liveMap.has(p.id)) return false;
        if (removeMockPosts && ['p1', 'p2', 'p3', 'p4', 'p5'].includes(p.id)) {
          return false;
        }
        return true;
      });
      return [...livePosts, ...kept];
    });
    this.hasRealFirestoreDataSignal.set(true);
    this.persist();
  }

  private recordRestError(err: unknown, path: string): string {
    let msg = 'Failed to persist changes to Cloud Firestore.';
    if (err instanceof HttpErrorResponse) {
      msg =
        err.error?.message ||
        err.message ||
        `HTTP ${err.status}: Cloud Firestore operation on "${path}" failed.`;
    } else if (err instanceof Error) {
      msg = err.message;
    }
    this.lastFirestoreErrorSignal.set(msg);
    return msg;
  }

  /**
   * Persists the signed-in user's profile to Cloud Firestore via `PUT /api/profiles/me`.
   * Never fakes a save if the backend or Firestore Security Rules reject the write.
   */
  async saveUserProfileAsync(data: {
    name: string;
    bio: string;
    contactPhone?: string;
    contactFacebook?: string;
    available: boolean;
  }): Promise<PersistenceMutationResult<UserProfile>> {
    if (this.isMockActor()) {
      this.updateUserProfile(data);
      return { persisted: true, value: this.currentUser() };
    }

    const current = this.currentUser();
    const mapLocLabel = (current?.approxLocation?.label || '').toLowerCase();
    const matchedLoc =
      ORIENTAL_MINDORO_LOCATIONS.find(l => mapLocLabel.includes(l.name.toLowerCase())) ||
      ORIENTAL_MINDORO_LOCATIONS[0];

    try {
      const res = await firstValueFrom(
        this.privateApi.updateOwnProfileBundle({
          displayName: data.name.trim(),
          biography: data.bio.trim(),
          profileTag: current?.tag || 'client',
          availability: data.available ? 'Available' : 'Unavailable',
          serviceAreaMunicipalityIds: [matchedLoc.id],
          phoneNumber: data.contactPhone?.trim() || null,
          facebookUrl: data.contactFacebook?.trim() || null,
          showPhonePublicly: Boolean(current?.showPhone),
          showFacebookPublicly: Boolean(current?.showFacebook),
          mapConsent: Boolean(current?.mapConsent),
          mapMunicipalityId: current?.mapConsent ? matchedLoc.id : null,
        })
      );

      if (!res.persisted || !res.publicProfile) {
        return {
          persisted: false,
          error: 'Firestore did not confirm profile persistence.',
        };
      }

      const updatedProfile = this.mapPublicProfileDtoToUserProfile(
        res.publicProfile,
        res.privateProfile,
        res.mapMarker
      );
      this.upsertUserInSignal(updatedProfile, true);
      if (this.authService.isAuthenticatedUser() && data.name.trim()) {
        void this.authService.updateFirebaseDisplayName(data.name.trim());
      }
      this.lastFirestoreErrorSignal.set(null);
      return { persisted: true, value: updatedProfile };
    } catch (err: unknown) {
      const errorMsg = this.recordRestError(err, 'profiles/me');
      return { persisted: false, error: errorMsg };
    }
  }

  /**
   * Creates or updates a Service Request, Service Offer, or Draft in Cloud Firestore via `POST /api/posts`.
   * Never fakes a save if the backend or Firestore Security Rules reject the write.
   */
  async savePostAsync(data: {
    id?: string | null;
    type: PostType;
    title: string;
    description: string;
    category: PostCategory;
    amount?: number | null;
    status: PostStatus;
    targetLocationId?: string | null;
    coverageAreaIds?: string[];
    optionalPublicAreaDescription?: string | null;
  }): Promise<PersistenceMutationResult<CleaningPost>> {
    if (this.isMockActor()) {
      if (data.id) {
        this.updatePost(data.id, {
          type: data.type,
          title: data.title,
          description: data.description,
          category: data.category,
          amount: data.amount,
          status: data.status,
          targetLocationId: data.targetLocationId ?? null,
          coverageAreaIds: data.coverageAreaIds ?? [],
          optionalPublicAreaDescription: data.optionalPublicAreaDescription ?? null,
        });
        return { persisted: true, value: this.getPostById(data.id) };
      }
      const created = this.createPost(data);
      return { persisted: true, value: created };
    }

    const user = this.currentUser();
    const publicationState: 'draft' | 'published' =
      data.status === 'draft' ? 'draft' : 'published';
    const lifecycleStatus: 'open' | 'closed' | 'active' | 'archived' =
      data.type === 'request'
        ? data.status === 'closed'
          ? 'closed'
          : 'open'
        : data.status === 'archived'
        ? 'archived'
        : 'active';

    try {
      const res = await firstValueFrom(
        this.privateApi.upsertOwnPost({
          id: data.id || undefined,
          postType: data.type,
          title: data.title.trim(),
          description: data.description.trim(),
          cleaningCategory: FRONTEND_TO_BACKEND_CATEGORY[data.category] || 'General House Cleaning',
          publicationState,
          lifecycleStatus,
          targetMunicipalityId: data.type === 'request' ? data.targetLocationId || null : null,
          coverageAreaIds: data.type === 'offer' ? data.coverageAreaIds || [] : [],
          priceOrBudget: data.amount != null && data.amount > 0 ? String(data.amount) : null,
          photoUrls: [],
          publicAreaDescription: data.optionalPublicAreaDescription?.trim() || null,
          scheduleNote: null,
          authorDisplayName:
            user?.name || this.authService.currentUserDisplayName() || 'LinisGo User',
          authorProfileTag: user?.tag || 'client',
        })
      );

      if (!res.persisted || !res.post) {
        return {
          persisted: false,
          error: 'Firestore did not confirm post persistence.',
        };
      }

      const savedPost = this.mapFirestorePostDtoToCleaningPost(res.post);
      this.mergeLivePostsIntoStore([savedPost], true);
      this.lastFirestoreErrorSignal.set(null);
      return { persisted: true, value: savedPost };
    } catch (err: unknown) {
      const errorMsg = this.recordRestError(err, 'posts');
      return { persisted: false, error: errorMsg };
    }
  }

  /**
   * Updates the lifecycle status ('open' | 'closed' | 'active' | 'archived') of an existing post
   * in Cloud Firestore via `PATCH /api/posts/:postId/lifecycle`.
   */
  async changePostStatusAsync(
    postId: string,
    nextStatus: PostStatus
  ): Promise<PersistenceMutationResult<CleaningPost>> {
    const post = this.getPostById(postId);
    if (!post) {
      return { persisted: false, error: 'Post not found.' };
    }

    if (this.isMockActor()) {
      this.changePostStatus(postId, nextStatus);
      return { persisted: true, value: this.getPostById(postId) };
    }

    const publicationState: 'draft' | 'published' =
      nextStatus === 'draft' ? 'draft' : 'published';
    const lifecycleStatus: 'open' | 'closed' | 'active' | 'archived' =
      post.type === 'request'
        ? nextStatus === 'closed'
          ? 'closed'
          : 'open'
        : nextStatus === 'archived' || nextStatus === 'closed'
        ? 'archived'
        : 'active';

    try {
      const res = await firstValueFrom(
        this.privateApi.updateOwnPostLifecycle(postId, lifecycleStatus, publicationState)
      );
      if (!res.persisted || !res.post) {
        return { persisted: false, error: 'Firestore did not confirm status update.' };
      }

      const updatedPost = this.mapFirestorePostDtoToCleaningPost(res.post);
      this.mergeLivePostsIntoStore([updatedPost], false);
      this.lastFirestoreErrorSignal.set(null);
      return { persisted: true, value: updatedPost };
    } catch (err: unknown) {
      const errorMsg = this.recordRestError(err, `posts/${postId}/lifecycle`);
      return { persisted: false, error: errorMsg };
    }
  }

  private normalizeExistingPosts(rawPosts: any[]): CleaningPost[] {
    const seedDefaults: Record<
      string,
      { targetLocationId: string | null; coverageAreaIds: string[]; optionalPublicAreaDescription: string | null }
    > = {
      p1: {
        targetLocationId: 'naujan',
        coverageAreaIds: [],
        optionalPublicAreaDescription: 'Poblacion I area',
      },
      p2: {
        targetLocationId: null,
        coverageAreaIds: ['calapan-city', 'puerto-galera', 'san-teodoro'],
        optionalPublicAreaDescription: 'Town proper & coastal barangays',
      },
      p3: {
        targetLocationId: null,
        coverageAreaIds: ['victoria', 'naujan', 'socorro'],
        optionalPublicAreaDescription: 'Weekend home cleaning coverage',
      },
      p4: {
        targetLocationId: 'calapan-city',
        coverageAreaIds: [],
        optionalPublicAreaDescription: 'San Vicente Central',
      },
      p5: {
        targetLocationId: null,
        coverageAreaIds: ['baco', 'calapan-city', 'pinamalayan'],
        optionalPublicAreaDescription: 'Residential & post-renovation sites',
      },
    };

    return rawPosts.map(p => {
      const hasTarget = p.targetLocationId !== undefined;
      const hasCoverage = Array.isArray(p.coverageAreaIds);

      if (!hasTarget && !hasCoverage && seedDefaults[p.id]) {
        const def = seedDefaults[p.id];
        return {
          ...p,
          targetLocationId: def.targetLocationId,
          coverageAreaIds: [...def.coverageAreaIds],
          optionalPublicAreaDescription: def.optionalPublicAreaDescription,
        } as CleaningPost;
      }

      return {
        ...p,
        targetLocationId:
          typeof p.targetLocationId === 'string' && isValidLocationId(p.targetLocationId)
            ? p.targetLocationId
            : null,
        coverageAreaIds: Array.isArray(p.coverageAreaIds)
          ? p.coverageAreaIds.filter((id: string) => isValidLocationId(id))
          : [],
        optionalPublicAreaDescription:
          typeof p.optionalPublicAreaDescription === 'string' && p.optionalPublicAreaDescription.trim()
            ? p.optionalPublicAreaDescription.trim()
            : null,
      } as CleaningPost;
    });
  }

  private loadInitialData(): void {
    let saved: any = null;
    try {
      const raw = localStorage.getItem(this.STORAGE_DATA_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}

    if (saved && Array.isArray(saved.users) && Array.isArray(saved.posts)) {
      this.usersSignal.set(saved.users);
      this.postsSignal.set(this.normalizeExistingPosts(saved.posts));
      this.savedPostsSignal.set(saved.savedPosts || []);
      this.savedUsersSignal.set(saved.savedUsers || []);
      this.userSavedPostsMapSignal.set(saved.userSavedPostsMap || {});
      this.userSavedUsersMapSignal.set(saved.userSavedUsersMap || {});
      this.notificationsSignal.set(saved.notifications || []);
      this.reportsSignal.set(saved.reports || []);
      this.appealsSignal.set(saved.appeals || []);
      this.auditLogsSignal.set(saved.auditLogs || []);
      this.adminNotificationsSignal.set(saved.adminNotifications || []);
      this.persist();
    } else {
      this.seedDefaultData();
    }
  }

  private persist(): void {
    try {
      const data = {
        users: this.usersSignal(),
        posts: this.postsSignal(),
        savedPosts: this.savedPostsSignal(),
        savedUsers: this.savedUsersSignal(),
        userSavedPostsMap: this.userSavedPostsMapSignal(),
        userSavedUsersMap: this.userSavedUsersMapSignal(),
        notifications: this.notificationsSignal(),
        reports: this.reportsSignal(),
        appeals: this.appealsSignal(),
        auditLogs: this.auditLogsSignal(),
        adminNotifications: this.adminNotificationsSignal(),
      };
      localStorage.setItem(this.STORAGE_DATA_KEY, JSON.stringify(data));
    } catch {}
  }

  resetDemoData(): void {
    this.seedDefaultData();
  }

  private seedDefaultData(): void {
    const defaultUsers: UserProfile[] = [
      {
        id: 'demo',
        name: 'Juan Dela Cruz',
        tag: 'client',
        bio: 'Household cleaning client and occasional weekend service helper based in Calapan City.',
        contactPhone: '0912-345-6789',
        contactFacebook: 'Juan Dela Cruz (Demo)',
        showPhone: false,
        showFacebook: true,
        mapConsent: false,
        approxLocation: { lat: 13.415, lng: 121.184, label: 'Calapan City' },
        available: true,
        state: 'active',
        warningCount: 0,
        createdAt: '2026-11-01',
        updatedAt: '2026-11-08',
      },
      {
        id: 'ana',
        name: 'Ana Lopez',
        tag: 'client',
        bio: 'Homeowner in Naujan seeking local cleaning service providers for routine household maintenance.',
        contactPhone: '0918-987-6543',
        contactFacebook: 'Ana Lopez (Naujan)',
        showPhone: false,
        showFacebook: true,
        mapConsent: true,
        approxLocation: { lat: 13.328, lng: 121.306, label: 'Naujan (Approximate Area)' },
        available: false,
        state: 'active',
        warningCount: 0,
        createdAt: '2026-11-03',
        updatedAt: '2026-11-08',
      },
      {
        id: 'ben',
        name: 'Ben Ramos',
        tag: 'provider',
        bio: 'Professional residential cleaning services across Calapan and Puerto Galera. Specializes in deep scrubbing.',
        contactPhone: '0900-555-0199',
        contactFacebook: 'Ben Ramos Cleaners',
        showPhone: true,
        showFacebook: false,
        mapConsent: true,
        approxLocation: { lat: 13.506, lng: 120.959, label: 'Puerto Galera (Approximate Area)' },
        available: true,
        state: 'active',
        warningCount: 0,
        createdAt: '2026-11-04',
        updatedAt: '2026-11-08',
      },
      {
        id: 'mira',
        name: 'Mira Santos',
        tag: 'client',
        bio: 'Resident in Victoria who offers weekend general housekeeping and laundry assistance.',
        contactPhone: '0922-333-4455',
        contactFacebook: 'Mira Santos Care',
        showPhone: false,
        showFacebook: true,
        mapConsent: true,
        approxLocation: { lat: 13.180, lng: 121.286, label: 'Victoria (Approximate Area)' },
        available: true,
        state: 'active',
        warningCount: 0,
        createdAt: '2026-11-05',
        updatedAt: '2026-11-08',
      },
      {
        id: 'carlos',
        name: 'Carlos Mendoza',
        tag: 'provider',
        bio: 'Experienced sanitation helper and move-in deep cleaning contractor in Baco and Calapan.',
        contactPhone: '0917-444-2211',
        contactFacebook: 'Carlos Cleaning Services',
        showPhone: true,
        showFacebook: true,
        mapConsent: false,
        approxLocation: { lat: 13.362, lng: 121.102, label: 'Baco (Approximate Area)' },
        available: true,
        state: 'active',
        warningCount: 1,
        lastWarningReason: 'Unclear business hours in profile bio',
        createdAt: '2026-11-06',
        updatedAt: '2026-11-08',
      },
    ];

    const defaultPosts: CleaningPost[] = [
      {
        id: 'p1',
        authorId: 'ana',
        authorName: 'Ana Lopez',
        authorTag: 'client',
        type: 'request',
        title: 'Need a Kitchen Cleaner for Weekend',
        description: 'Looking for assistance with deep kitchen and dining area cleaning in Naujan. Includes grease removal, stove wipe down, and floor washing.',
        category: 'Kitchen',
        amount: 700,
        status: 'open',
        targetLocationId: 'naujan',
        coverageAreaIds: [],
        optionalPublicAreaDescription: 'Poblacion I area',
        moderated: false,
        createdAt: '2026-11-08',
        updatedAt: '2026-11-08',
      },
      {
        id: 'p2',
        authorId: 'ben',
        authorName: 'Ben Ramos',
        authorTag: 'provider',
        type: 'offer',
        title: 'Deep House Cleaning & Tile Scrubbing Available',
        description: 'I offer detailed residential cleaning for bungalows and apartments. Bring own eco-friendly detergents and scrubbing pads. Minimum 4 hours.',
        category: 'Deep',
        amount: 850,
        status: 'active',
        targetLocationId: null,
        coverageAreaIds: ['calapan-city', 'puerto-galera', 'san-teodoro'],
        optionalPublicAreaDescription: 'Town proper & coastal barangays',
        moderated: false,
        createdAt: '2026-11-08',
        updatedAt: '2026-11-08',
      },
      {
        id: 'p3',
        authorId: 'mira',
        authorName: 'Mira Santos',
        authorTag: 'client',
        type: 'offer',
        title: 'General House Cleaning & Living Room Organization',
        description: 'Available every Saturday and Sunday for light general home upkeep, dusting, window washing, and bedsheet folding.',
        category: 'General',
        amount: 500,
        status: 'active',
        targetLocationId: null,
        coverageAreaIds: ['victoria', 'naujan', 'socorro'],
        optionalPublicAreaDescription: 'Weekend home cleaning coverage',
        moderated: false,
        createdAt: '2026-11-07',
        updatedAt: '2026-11-07',
      },
      {
        id: 'p4',
        authorId: 'demo',
        authorName: 'Juan Dela Cruz',
        authorTag: 'client',
        type: 'request',
        title: 'Looking for Two Bathroom Thorough Sanitation',
        description: 'Need help scrubbing tile grout, sanitizing bathroom fixtures, mirrors, and deep stain removal in Calapan City.',
        category: 'Bathroom',
        amount: 600,
        status: 'open',
        targetLocationId: 'calapan-city',
        coverageAreaIds: [],
        optionalPublicAreaDescription: 'San Vicente Central',
        moderated: false,
        createdAt: '2026-11-06',
        updatedAt: '2026-11-06',
      },
      {
        id: 'p5',
        authorId: 'carlos',
        authorName: 'Carlos Mendoza',
        authorTag: 'provider',
        type: 'offer',
        title: 'Move-in & Post-Renovation Deep Sanitation',
        description: 'Thorough vacuuming, paint fleck removal, dust elimination, and whole-house disinfection for newly occupied homes.',
        category: 'General',
        amount: 1200,
        status: 'active',
        targetLocationId: null,
        coverageAreaIds: ['baco', 'calapan-city', 'pinamalayan'],
        optionalPublicAreaDescription: 'Residential & post-renovation sites',
        moderated: false,
        createdAt: '2026-11-05',
        updatedAt: '2026-11-05',
      },
    ];

    const defaultNotifications: InAppNotification[] = [
      {
        id: 'notif-1',
        recipientId: 'demo',
        title: 'Welcome to LinisGo Finder!',
        detail: 'Explore cleaning requests and service offers in Oriental Mindoro. You can publish multiple requests or offers anytime.',
        read: false,
        createdAt: '2026-11-08 09:00',
      },
      {
        id: 'notif-2',
        recipientId: 'demo',
        title: 'Map Visibility Disabled by Default',
        detail: 'Your approximate location marker is hidden. Visit Settings if you choose to enable public map discovery.',
        read: false,
        createdAt: '2026-11-08 09:05',
      },
    ];

    const defaultReports: ReportItem[] = [
      {
        id: 'rep-init1',
        reporterId: 'ana',
        targetType: 'user',
        targetId: 'carlos',
        reason: 'Suspicious activity',
        explanation: 'User indicated conflicting business availability and unverified phone contact.',
        status: 'Pending',
        createdAt: '2026-11-08',
      },
      {
        id: 'rep-init2',
        reporterId: 'ben',
        targetType: 'post',
        targetId: 'p3',
        reason: 'Misleading details',
        explanation: 'The offer mentions weekend availability but description also includes Friday morning.',
        status: 'Under Review',
        decisionNotes: 'Reviewing schedule description clarity.',
        createdAt: '2026-11-07',
      },
    ];

    const defaultAppeals: AppealItem[] = [
      {
        id: 'app-init1',
        appellantId: 'carlos',
        targetType: 'account',
        targetId: 'carlos',
        explanation: 'I have updated my contact number and clarified my municipal service radius in Baco.',
        status: 'Pending',
        createdAt: '2026-11-08',
      },
    ];

    const defaultAuditLogs: AuditLog[] = [
      {
        id: 'log-1',
        actionType: 'Account Warning',
        targetType: 'user',
        targetId: 'carlos',
        targetName: 'Carlos Mendoza',
        adminId: 'admin@linisgo.demo',
        reason: 'Unclear business hours in profile bio',
        result: 'Warning record added and in-app notice dispatched to user',
        timestamp: '2026-11-08 08:30',
      },
      {
        id: 'log-2',
        actionType: 'Report Review Started',
        targetType: 'report',
        targetId: 'rep-init2',
        targetName: 'Report against Post #p3',
        adminId: 'admin@linisgo.demo',
        reason: 'Assigned report to moderation queue for verification',
        result: 'Status changed to Under Review',
        timestamp: '2026-11-08 09:10',
      },
    ];

    const defaultAdminNotifications: InAppNotification[] = [
      {
        id: 'anotif-1',
        recipientId: 'admin',
        title: 'New User Report Submitted',
        detail: 'Report #rep-init1 filed against user Carlos Mendoza (Reason: Suspicious activity).',
        read: false,
        createdAt: '2026-11-08 09:15',
      },
      {
        id: 'anotif-2',
        recipientId: 'admin',
        title: 'New Moderation Appeal Filed',
        detail: 'Appeal #app-init1 received from Carlos Mendoza for account review.',
        read: false,
        createdAt: '2026-11-08 09:20',
      },
    ];

    this.usersSignal.set(defaultUsers);
    this.postsSignal.set(defaultPosts);
    this.savedPostsSignal.set(['p2']);
    this.savedUsersSignal.set(['ben']);
    this.notificationsSignal.set(defaultNotifications);
    this.reportsSignal.set(defaultReports);
    this.appealsSignal.set(defaultAppeals);
    this.auditLogsSignal.set(defaultAuditLogs);
    this.adminNotificationsSignal.set(defaultAdminNotifications);
    this.persist();
  }

  addAuditLog(data: {
    actionType: AuditActionType;
    targetType: 'user' | 'post' | 'report' | 'appeal';
    targetId: string;
    targetName?: string;
    reason: string;
    result: string;
  }): AuditLog {
    const log: AuditLog = {
      id: 'log-' + Math.random().toString(36).slice(2, 8),
      actionType: data.actionType,
      targetType: data.targetType,
      targetId: data.targetId,
      targetName: data.targetName,
      adminId: 'admin@linisgo.demo',
      reason: data.reason,
      result: data.result,
      timestamp: new Date().toLocaleString(),
    };
    this.auditLogsSignal.update(logs => [log, ...logs]);
    this.persist();
    return log;
  }

  addAdminNotification(title: string, detail: string): void {
    const item: InAppNotification = {
      id: 'anotif-' + Math.random().toString(36).slice(2, 8),
      recipientId: 'admin',
      title,
      detail,
      read: false,
      createdAt: new Date().toLocaleString(),
    };
    this.adminNotificationsSignal.update(list => [item, ...list]);
    this.persist();
  }

  markAdminNotificationRead(id: string): void {
    this.adminNotificationsSignal.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n))
    );
    this.persist();
  }

  markAdminNotificationUnread(id: string): void {
    this.adminNotificationsSignal.update(list =>
      list.map(n => (n.id === id ? { ...n, read: false } : n))
    );
    this.persist();
  }

  markAllAdminNotificationsRead(): void {
    this.adminNotificationsSignal.update(list =>
      list.map(n => ({ ...n, read: true }))
    );
    this.persist();
  }

  addNotificationForUser(recipientId: string, title: string, detail: string): void {
    const item: InAppNotification = {
      id: 'notif-' + Math.random().toString(36).slice(2, 8),
      recipientId,
      title,
      detail,
      read: false,
      createdAt: new Date().toLocaleString(),
    };
    this.notificationsSignal.update(list => [item, ...list]);
    this.persist();
  }

  createPost(data: {
    type: PostType;
    title: string;
    description: string;
    category: PostCategory;
    amount?: number | null;
    status: PostStatus;
    targetLocationId?: string | null;
    coverageAreaIds?: string[];
    optionalPublicAreaDescription?: string | null;
  }): CleaningPost {
    const user = this.currentUser();
    const validTarget =
      data.type === 'request' && data.targetLocationId && isValidLocationId(data.targetLocationId)
        ? data.targetLocationId
        : null;
    const validCoverage =
      data.type === 'offer' && Array.isArray(data.coverageAreaIds)
        ? Array.from(new Set(data.coverageAreaIds.filter(id => isValidLocationId(id))))
        : [];
    const cleanAreaDesc = data.optionalPublicAreaDescription?.trim() || null;

    const actorId = this.activeActorId();
    const newPost: CleaningPost = {
      id: 'p-' + Math.random().toString(36).slice(2, 8),
      authorId: actorId,
      authorName: user?.name || this.authService.currentUserDisplayName() || 'LinisGo User',
      authorTag: user?.tag || 'client',
      type: data.type,
      title: data.title,
      description: data.description,
      category: data.category,
      amount: data.amount,
      status: data.status,
      targetLocationId: validTarget,
      coverageAreaIds: validCoverage,
      optionalPublicAreaDescription: cleanAreaDesc,
      moderated: false,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    this.postsSignal.update(posts => [newPost, ...posts]);
    this.persist();
    return newPost;
  }

  updatePost(id: string, data: Partial<CleaningPost>): boolean {
    let found = false;
    const actorId = this.activeActorId();
    this.postsSignal.update(posts =>
      posts.map(p => {
        if (p.id === id) {
          // Enforce ownership check so another user cannot edit the first user's posts
          if (!this.isMockActor() && p.authorId !== actorId) {
            return p;
          }
          found = true;
          const nextType = data.type ?? p.type;
          const nextTarget =
            data.targetLocationId !== undefined ? data.targetLocationId : p.targetLocationId;
          const nextCoverage =
            data.coverageAreaIds !== undefined ? data.coverageAreaIds : p.coverageAreaIds;
          const nextOptional =
            data.optionalPublicAreaDescription !== undefined
              ? data.optionalPublicAreaDescription
              : p.optionalPublicAreaDescription;

          return {
            ...p,
            ...data,
            targetLocationId:
              nextType === 'request' && nextTarget && isValidLocationId(nextTarget)
                ? nextTarget
                : null,
            coverageAreaIds:
              nextType === 'offer' && Array.isArray(nextCoverage)
                ? Array.from(new Set(nextCoverage.filter(locId => isValidLocationId(locId))))
                : [],
            optionalPublicAreaDescription: nextOptional ? nextOptional.trim() : null,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
        }
        return p;
      })
    );
    if (found) this.persist();
    return found;
  }

  changePostStatus(id: string, status: PostStatus): void {
    if (!this.isMockActor()) {
      void this.changePostStatusAsync(id, status);
      return;
    }
    this.updatePost(id, { status });
  }

  archivePost(id: string): void {
    this.changePostStatus(id, 'archived');
  }

  hidePost(postId: string, reason: string): boolean {
    const post = this.getPostById(postId);
    if (!post) return false;

    this.updatePost(postId, {
      moderated: true,
      moderationReason: reason,
      moderatedAt: new Date().toISOString().slice(0, 10),
    });

    this.addAuditLog({
      actionType: 'Hide Post',
      targetType: 'post',
      targetId: postId,
      targetName: post.title,
      reason,
      result: 'Post hidden from public discovery',
    });

    this.addNotificationForUser(
      post.authorId,
      'Post Moderated',
      `Your post "${post.title}" was hidden by an administrator: "${reason}". You may file an appeal from your profile.`
    );

    return true;
  }

  restorePost(postId: string, reason: string): boolean {
    const post = this.getPostById(postId);
    if (!post) return false;

    this.updatePost(postId, {
      moderated: false,
      moderationReason: undefined,
      moderatedAt: undefined,
    });

    this.addAuditLog({
      actionType: 'Restore Post',
      targetType: 'post',
      targetId: postId,
      targetName: post.title,
      reason,
      result: 'Moderation flag cleared. Post restored if eligible.',
    });

    this.addNotificationForUser(
      post.authorId,
      'Post Restored',
      `The moderation restriction on your post "${post.title}" has been lifted: "${reason}".`
    );

    return true;
  }

  issueUserWarning(userId: string, reason: string): boolean {
    const user = this.getUserById(userId);
    if (!user) return false;

    const count = (user.warningCount || 0) + 1;
    this.usersSignal.update(users =>
      users.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            warningCount: count,
            lastWarningReason: reason,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
        }
        return u;
      })
    );

    this.addAuditLog({
      actionType: 'Account Warning',
      targetType: 'user',
      targetId: userId,
      targetName: user.name,
      reason,
      result: `Warning issued (Total: ${count})`,
    });

    this.addNotificationForUser(
      userId,
      'Administrative Warning',
      `You have received an official account warning: "${reason}". Repeated violations may result in account suspension.`
    );

    this.persist();
    return true;
  }

  suspendUser(userId: string, type: SuspensionType, durationDays: number | null, reason: string): boolean {
    const user = this.getUserById(userId);
    if (!user) return false;

    let until: string | null = null;
    if (type === 'temporary' && durationDays) {
      const d = new Date();
      d.setDate(d.getDate() + durationDays);
      until = d.toISOString().slice(0, 10);
    }

    this.usersSignal.update(users =>
      users.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            state: 'suspended' as UserAccountState,
            suspensionType: type,
            suspensionReason: reason,
            suspendedUntil: until,
            mapConsent: false,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
        }
        return u;
      })
    );

    const actionType: AuditActionType = type === 'temporary' ? 'Temporary Suspension' : 'Indefinite Suspension';
    const resultDesc = type === 'temporary' ? `Suspended for ${durationDays} days until ${until}` : 'Suspended indefinitely';

    this.addAuditLog({
      actionType,
      targetType: 'user',
      targetId: userId,
      targetName: user.name,
      reason,
      result: resultDesc,
    });

    this.addNotificationForUser(
      userId,
      'Account Suspended',
      `Your account has been suspended (${type === 'temporary' ? durationDays + ' days' : 'indefinite'}): "${reason}". You may file a suspension appeal from your profile.`
    );

    this.persist();
    return true;
  }

  liftUserSuspension(userId: string, reason: string): boolean {
    const user = this.getUserById(userId);
    if (!user) return false;

    this.usersSignal.update(users =>
      users.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            state: 'active' as UserAccountState,
            suspensionType: null,
            suspensionReason: null,
            suspendedUntil: null,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
        }
        return u;
      })
    );

    this.addAuditLog({
      actionType: 'Lift Suspension',
      targetType: 'user',
      targetId: userId,
      targetName: user.name,
      reason,
      result: 'Suspension lifted. Account restored to active status.',
    });

    this.addNotificationForUser(
      userId,
      'Suspension Lifted',
      `Your account suspension has been lifted: "${reason}". Your account and eligible posts are active again.`
    );

    this.persist();
    return true;
  }

  toggleUserTag(): void {
    const current = this.currentUser();
    if (!current) return;
    const newTag: UserProfileTag = current.tag === 'client' ? 'provider' : 'client';

    if (!this.isMockActor()) {
      const mapLocLabel = (current.approxLocation?.label || '').toLowerCase();
      const matchedLoc =
        ORIENTAL_MINDORO_LOCATIONS.find(l => mapLocLabel.includes(l.name.toLowerCase())) ||
        ORIENTAL_MINDORO_LOCATIONS[0];

      void firstValueFrom(
        this.privateApi.updateOwnProfileBundle({
          displayName: current.name,
          biography: current.bio,
          profileTag: newTag,
          availability: current.available ? 'Available' : 'Unavailable',
          serviceAreaMunicipalityIds: [matchedLoc.id],
          phoneNumber: current.contactPhone || null,
          facebookUrl: current.contactFacebook || null,
          showPhonePublicly: Boolean(current.showPhone),
          showFacebookPublicly: Boolean(current.showFacebook),
          mapConsent: Boolean(current.mapConsent),
          mapMunicipalityId: current.mapConsent ? matchedLoc.id : null,
        })
      )
        .then(res => {
          if (res.persisted && res.publicProfile) {
            const updated = this.mapPublicProfileDtoToUserProfile(
              res.publicProfile,
              res.privateProfile,
              res.mapMarker
            );
            this.upsertUserInSignal(updated, true);
          }
        })
        .catch(err => this.recordRestError(err, 'profiles/me'));
      return;
    }

    const actorId = this.activeActorId();
    this.usersSignal.update(users =>
      users.map(u => {
        if (u.id === actorId) {
          return { ...u, tag: newTag, updatedAt: new Date().toISOString().slice(0, 10) };
        }
        return u;
      })
    );
    this.postsSignal.update(posts =>
      posts.map(p => (p.authorId === actorId ? { ...p, authorTag: newTag } : p))
    );
    this.persist();
  }

  updateUserProfile(data: {
    name?: string;
    bio?: string;
    contactPhone?: string;
    contactFacebook?: string;
    available?: boolean;
  }): void {
    const actorId = this.activeActorId();
    this.usersSignal.update(users =>
      users.map(u => {
        if (u.id === actorId) {
          return { ...u, ...data, updatedAt: new Date().toISOString().slice(0, 10) };
        }
        return u;
      })
    );
    if (data.name) {
      this.postsSignal.update(posts =>
        posts.map(p => (p.authorId === actorId ? { ...p, authorName: data.name! } : p))
      );
      if (this.authService.isAuthenticatedUser()) {
        void this.authService.updateFirebaseDisplayName(data.name);
      }
    }
    this.persist();
  }

  updateUserSettings(data: {
    showPhone?: boolean;
    showFacebook?: boolean;
    mapConsent?: boolean;
    approxLocation?: { lat: number; lng: number; label?: string };
  }): void {
    const current = this.currentUser();
    if (!this.isMockActor() && current) {
      const nextShowPhone = data.showPhone ?? current.showPhone;
      const nextShowFb = data.showFacebook ?? current.showFacebook;
      const nextMapConsent = data.mapConsent ?? current.mapConsent;
      const nextApprox = data.approxLocation ?? current.approxLocation;
      const locLabel = (nextApprox?.label || '').toLowerCase();
      const matchedLoc =
        ORIENTAL_MINDORO_LOCATIONS.find(l => locLabel.includes(l.name.toLowerCase())) ||
        ORIENTAL_MINDORO_LOCATIONS[0];

      void firstValueFrom(
        this.privateApi.updateOwnProfileBundle({
          displayName: current.name,
          biography: current.bio,
          profileTag: current.tag,
          availability: current.available ? 'Available' : 'Unavailable',
          serviceAreaMunicipalityIds: [matchedLoc.id],
          phoneNumber: current.contactPhone || null,
          facebookUrl: current.contactFacebook || null,
          showPhonePublicly: Boolean(nextShowPhone),
          showFacebookPublicly: Boolean(nextShowFb),
          mapConsent: Boolean(nextMapConsent),
          mapMunicipalityId: nextMapConsent ? matchedLoc.id : null,
        })
      )
        .then(res => {
          if (res.persisted && res.publicProfile) {
            const updated = this.mapPublicProfileDtoToUserProfile(
              res.publicProfile,
              res.privateProfile,
              res.mapMarker
            );
            this.upsertUserInSignal(updated, true);
          }
        })
        .catch(err => this.recordRestError(err, 'profiles/me'));
      return;
    }

    const actorId = this.activeActorId();
    this.usersSignal.update(users =>
      users.map(u => {
        if (u.id === actorId) {
          return { ...u, ...data, updatedAt: new Date().toISOString().slice(0, 10) };
        }
        return u;
      })
    );
    this.persist();
  }

  deactivateAccount(): void {
    const actorId = this.activeActorId();
    this.usersSignal.update(users =>
      users.map(u => (u.id === actorId ? { ...u, state: 'deactivated', mapConsent: false } : u))
    );
    this.persist();
  }

  reactivateAccount(): void {
    const actorId = this.activeActorId();
    const user = this.currentUser();
    if (user && user.state === 'suspended') {
      return;
    }
    this.usersSignal.update(users =>
      users.map(u => (u.id === actorId ? { ...u, state: 'active' } : u))
    );
    this.persist();
  }

  deleteAccountSimulated(): void {
    const actorId = this.activeActorId();
    this.postsSignal.update(posts => posts.filter(p => p.authorId !== actorId));
    if (actorId === 'demo') {
      this.savedPostsSignal.set([]);
      this.savedUsersSignal.set([]);
    } else {
      this.userSavedPostsMapSignal.update(m => ({ ...m, [actorId]: [] }));
      this.userSavedUsersMapSignal.update(m => ({ ...m, [actorId]: [] }));
    }
    this.reportsSignal.update(r => r.filter(x => x.reporterId !== actorId));
    this.appealsSignal.update(a => a.filter(x => x.appellantId !== actorId));
    this.notificationsSignal.update(n => n.filter(n => n.recipientId !== actorId));
    this.usersSignal.update(users =>
      users.map(u => (u.id === actorId ? { ...u, state: 'deleted', mapConsent: false } : u))
    );
    this.persist();
  }

  isPostSaved(postId: string): boolean {
    return this.activeSavedPostIds().includes(postId);
  }

  toggleSavePost(postId: string): boolean {
    const actorId = this.activeActorId();
    let saved = false;
    if (actorId === 'demo') {
      this.savedPostsSignal.update(ids => {
        if (ids.includes(postId)) {
          saved = false;
          return ids.filter(id => id !== postId);
        } else {
          saved = true;
          return [postId, ...ids];
        }
      });
    } else {
      this.userSavedPostsMapSignal.update(map => {
        const current = map[actorId] || [];
        if (current.includes(postId)) {
          saved = false;
          return { ...map, [actorId]: current.filter(id => id !== postId) };
        } else {
          saved = true;
          return { ...map, [actorId]: [postId, ...current] };
        }
      });
    }
    this.persist();
    return saved;
  }

  isUserSaved(userId: string): boolean {
    return this.activeSavedUserIds().includes(userId);
  }

  toggleSaveUser(userId: string): boolean {
    const actorId = this.activeActorId();
    let saved = false;
    if (actorId === 'demo') {
      this.savedUsersSignal.update(ids => {
        if (ids.includes(userId)) {
          saved = false;
          return ids.filter(id => id !== userId);
        } else {
          saved = true;
          return [userId, ...ids];
        }
      });
    } else {
      this.userSavedUsersMapSignal.update(map => {
        const current = map[actorId] || [];
        if (current.includes(userId)) {
          saved = false;
          return { ...map, [actorId]: current.filter(id => id !== userId) };
        } else {
          saved = true;
          return { ...map, [actorId]: [userId, ...current] };
        }
      });
    }
    this.persist();
    return saved;
  }

  markNotificationRead(id: string): void {
    this.notificationsSignal.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n))
    );
    this.persist();
  }

  markNotificationUnread(id: string): void {
    this.notificationsSignal.update(list =>
      list.map(n => (n.id === id ? { ...n, read: false } : n))
    );
    this.persist();
  }

  markAllNotificationsRead(): void {
    const actorId = this.activeActorId();
    this.notificationsSignal.update(list =>
      list.map(n => (n.recipientId === actorId ? { ...n, read: true } : n))
    );
    this.persist();
  }

  addNotification(title: string, detail: string): void {
    const actorId = this.activeActorId();
    this.addNotificationForUser(actorId, title, detail);
  }

  submitReport(data: {
    targetType: 'post' | 'user';
    targetId: string;
    reason: ReportReason;
    explanation: string;
  }): ReportItem {
    const actorId = this.activeActorId();
    const report: ReportItem = {
      id: 'rep-' + Math.random().toString(36).slice(2, 8),
      reporterId: actorId,
      targetType: data.targetType,
      targetId: data.targetId,
      reason: data.reason,
      explanation: data.explanation,
      status: 'Pending',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    this.reportsSignal.update(list => [report, ...list]);
    this.addNotification(
      'Report Submitted',
      `Your report for ${data.targetType} (${data.targetId}) was submitted for administrative review.`
    );
    this.addAdminNotification(
      `New User Report (#${report.id})`,
      `A new report was filed for ${data.targetType} "${data.targetId}" (Reason: ${data.reason}).`
    );
    this.persist();
    return report;
  }

  startReportReview(reportId: string): boolean {
    let found = false;
    this.reportsSignal.update(reports =>
      reports.map(r => {
        if (r.id === reportId) {
          found = true;
          return { ...r, status: 'Under Review' as ReportStatus };
        }
        return r;
      })
    );
    if (found) {
      this.addAuditLog({
        actionType: 'Report Review Started',
        targetType: 'report',
        targetId: reportId,
        reason: 'Administrator commenced formal review',
        result: 'Report status set to Under Review',
      });
      this.persist();
    }
    return found;
  }

  resolveReport(reportId: string, decisionNotes: string): boolean {
    let found = false;
    this.reportsSignal.update(reports =>
      reports.map(r => {
        if (r.id === reportId) {
          found = true;
          return { ...r, status: 'Resolved' as ReportStatus, decisionNotes };
        }
        return r;
      })
    );
    if (found) {
      this.addAuditLog({
        actionType: 'Report Resolved',
        targetType: 'report',
        targetId: reportId,
        reason: decisionNotes,
        result: 'Report marked as Resolved',
      });
      this.persist();
    }
    return found;
  }

  dismissReport(reportId: string, decisionNotes: string): boolean {
    let found = false;
    this.reportsSignal.update(reports =>
      reports.map(r => {
        if (r.id === reportId) {
          found = true;
          return { ...r, status: 'Dismissed' as ReportStatus, decisionNotes };
        }
        return r;
      })
    );
    if (found) {
      this.addAuditLog({
        actionType: 'Report Dismissed',
        targetType: 'report',
        targetId: reportId,
        reason: decisionNotes,
        result: 'Report dismissed without punitive moderation',
      });
      this.persist();
    }
    return found;
  }

  submitAppeal(data: {
    targetType: 'post' | 'account';
    targetId: string;
    explanation: string;
  }): AppealItem {
    const actorId = this.activeActorId();
    const appeal: AppealItem = {
      id: 'app-' + Math.random().toString(36).slice(2, 8),
      appellantId: actorId,
      targetType: data.targetType,
      targetId: data.targetId,
      explanation: data.explanation,
      status: 'Pending',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    this.appealsSignal.update(list => [appeal, ...list]);
    this.addNotification(
      'Appeal Received',
      `Your appeal for ${data.targetType} (${data.targetId}) has been logged.`
    );
    this.addAdminNotification(
      `New Moderation Appeal (#${appeal.id})`,
      `An appeal was submitted by appellant ${appeal.appellantId} regarding ${data.targetType} "${data.targetId}".`
    );
    this.persist();
    return appeal;
  }

  approveAppeal(appealId: string, decisionNotes: string): boolean {
    const appeal = this.appealsSignal().find(a => a.id === appealId);
    if (!appeal) return false;

    let remedyResult = 'Appeal approved.';
    if (appeal.targetType === 'post') {
      const post = this.getPostById(appeal.targetId);
      if (post && post.moderated) {
        this.updatePost(appeal.targetId, {
          moderated: false,
          moderationReason: undefined,
          moderatedAt: undefined,
        });
        remedyResult = `Appeal approved. Moderation flag lifted on post "${post.title}".`;
      } else {
        remedyResult = 'Appeal approved. Target post was already unmoderated.';
      }
    } else if (appeal.targetType === 'account') {
      const targetUserId = appeal.targetId === 'my-account' ? appeal.appellantId : appeal.targetId;
      const user = this.getUserById(targetUserId);
      if (user && user.state === 'suspended') {
        this.usersSignal.update(users =>
          users.map(u => {
            if (u.id === targetUserId) {
              return {
                ...u,
                state: 'active' as UserAccountState,
                suspensionType: null,
                suspensionReason: null,
                suspendedUntil: null,
                updatedAt: new Date().toISOString().slice(0, 10),
              };
            }
            return u;
          })
        );
        remedyResult = `Appeal approved. Suspension lifted for user "${user.name}".`;
      } else {
        remedyResult = 'Appeal approved. Target user account was already active.';
      }
    }

    this.appealsSignal.update(appeals =>
      appeals.map(a => (a.id === appealId ? { ...a, status: 'Approved' as AppealStatus, decisionNotes } : a))
    );

    this.addAuditLog({
      actionType: 'Appeal Approved',
      targetType: 'appeal',
      targetId: appealId,
      targetName: `Appeal for ${appeal.targetType} ${appeal.targetId}`,
      reason: decisionNotes,
      result: remedyResult,
    });

    this.addNotificationForUser(
      appeal.appellantId,
      'Appeal Approved',
      `Your appeal for ${appeal.targetType} (${appeal.targetId}) was approved: "${decisionNotes}". ${remedyResult}`
    );

    this.persist();
    return true;
  }

  rejectAppeal(appealId: string, decisionNotes: string): boolean {
    const appeal = this.appealsSignal().find(a => a.id === appealId);
    if (!appeal) return false;

    this.appealsSignal.update(appeals =>
      appeals.map(a => (a.id === appealId ? { ...a, status: 'Rejected' as AppealStatus, decisionNotes } : a))
    );

    this.addAuditLog({
      actionType: 'Appeal Rejected',
      targetType: 'appeal',
      targetId: appealId,
      targetName: `Appeal for ${appeal.targetType} ${appeal.targetId}`,
      reason: decisionNotes,
      result: 'Appeal formally reviewed and rejected',
    });

    this.addNotificationForUser(
      appeal.appellantId,
      'Appeal Rejected',
      `Your appeal for ${appeal.targetType} (${appeal.targetId}) was rejected: "${decisionNotes}". Prior moderation restrictions remain active.`
    );

    this.persist();
    return true;
  }

  getPostById(id: string): CleaningPost | undefined {
    return this.postsSignal().find(p => p.id === id);
  }

  getUserById(id: string): UserProfile | undefined {
    return this.usersSignal().find(u => u.id === id);
  }

  getUserPosts(authorId: string): CleaningPost[] {
    return this.postsSignal().filter(p => p.authorId === authorId);
  }

  getReportsForTarget(targetType: 'post' | 'user', targetId: string): ReportItem[] {
    return this.reportsSignal().filter(r => r.targetType === targetType && r.targetId === targetId);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedTag.set('all');
    this.selectedType.set('all');
    this.selectedCategory.set('all');
    this.selectedLocationId.set('all');
    this.selectedLocationMode.set('all');
    this.selectedAvailability.set('all');
    this.maxPriceFilter.set(null);
    this.selectedSort.set('newest');
  }
}
