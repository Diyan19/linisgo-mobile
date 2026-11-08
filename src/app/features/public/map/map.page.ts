import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonSearchbar,
  IonButton,
  IonBadge,
  IonIcon,
  IonSelect,
  IonSelectOption,
  ViewDidEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  navigateOutline,
  personOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  documentsOutline,
  shieldCheckmarkOutline,
  refreshOutline,
  openOutline,
} from 'ionicons/icons';
import * as L from 'leaflet';
import { PublicDataService, MapAreaSummary } from '../../../core/services/public-data.service';
import { UserProfile, UserProfileTag } from '../../../shared/models/user.model';
import { CleaningPost, PostCategory, PostType } from '../../../shared/models/post.model';
import {
  ORIENTAL_MINDORO_LOCATIONS,
  LocationFilterMode,
  getLocationById,
  getLocationName,
  getPostLocationSummary,
} from '../../../shared/models/location.model';

@Component({
  selector: 'app-public-map',
  templateUrl: './map.page.html',
  styleUrls: ['./map.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonSearchbar,
    IonButton,
    IonBadge,
    IonIcon,
    IonSelect,
    IonSelectOption,
  ],
})
export class MapPage implements AfterViewInit, ViewDidEnter, OnDestroy {
  @ViewChild('leafletContainer', { static: false }) leafletContainer?: ElementRef<HTMLDivElement>;

  readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly locations = ORIENTAL_MINDORO_LOCATIONS;

  // Selected municipality area for the location-details bottom sheet / popup card
  readonly selectedAreaId = signal<string | null>(null);
  // Selected opt-in user marker callout
  readonly selectedUser = signal<UserProfile | null>(null);

  readonly selectedAreaSummary = computed<MapAreaSummary | null>(() => {
    const areaId = this.selectedAreaId();
    if (!areaId) return null;
    const existing = this.dataService.mapAreaSummaries().find(a => a.location.id === areaId);
    if (existing) return existing;
    const loc = getLocationById(areaId);
    if (!loc) return null;
    return {
      location: loc,
      posts: [],
      requestCount: 0,
      offerCount: 0,
    };
  });

  private map: L.Map | null = null;
  private areaMarkersLayer: L.LayerGroup | null = null;
  private userMarkersLayer: L.LayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    addIcons({
      locationOutline,
      navigateOutline,
      personOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      documentsOutline,
      shieldCheckmarkOutline,
      refreshOutline,
      openOutline,
    });

    this.route.queryParams.subscribe(params => {
      const areaId = params['areaId'];
      if (areaId && getLocationById(areaId)) {
        this.selectedAreaId.set(areaId);
        this.focusMapOnArea(areaId);
      }
    });

    effect(() => {
      // Re-render markers whenever filtered mapAreaSummaries, mapVisibleUsers, or selection changes
      const areas = this.dataService.mapAreaSummaries();
      const users = this.dataService.mapVisibleUsers();
      const activeAreaId = this.selectedAreaId();
      const activeUser = this.selectedUser();
      if (this.map) {
        this.renderMapLayers(areas, users, activeAreaId, activeUser?.id || null);
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initLeafletMap();
    }, 80);
  }

  ionViewDidEnter(): void {
    if (this.map) {
      setTimeout(() => {
        this.map?.invalidateSize();
      }, 60);
    } else {
      this.initLeafletMap();
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initLeafletMap(): void {
    const container = this.leafletContainer?.nativeElement;
    if (!container || this.map) return;

    // Oriental Mindoro geographic bounds & center
    this.map = L.map(container, {
      center: [13.08, 121.25],
      zoom: 9,
      minZoom: 8,
      maxZoom: 15,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(this.map);

    this.areaMarkersLayer = L.layerGroup().addTo(this.map);
    this.userMarkersLayer = L.layerGroup().addTo(this.map);

    this.renderMapLayers(
      this.dataService.mapAreaSummaries(),
      this.dataService.mapVisibleUsers(),
      this.selectedAreaId(),
      this.selectedUser()?.id || null
    );

    // Ensure proper tile sizing inside Ionic scrollable content
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 200);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });
      this.resizeObserver.observe(container);
    }
  }

  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private renderMapLayers(
    areas: MapAreaSummary[],
    users: UserProfile[],
    activeAreaId: string | null,
    activeUserId: string | null
  ): void {
    if (!this.map || !this.areaMarkersLayer || !this.userMarkersLayer) return;

    const areaLayer = this.areaMarkersLayer;
    const userLayer = this.userMarkersLayer;
    areaLayer.clearLayers();
    userLayer.clearLayers();

    // 1. Area-based Post Discovery Markers (Town Center Reference Coordinates)
    for (const item of areas) {
      const isSelected = activeAreaId === item.location.id;
      const safeName = this.escapeHtml(item.location.name);
      const count = item.posts.length;

      const icon = L.divIcon({
        className: 'linisgo-div-icon',
        html: `<button type="button" class="linisgo-area-marker ${isSelected ? 'selected' : ''}" data-area-id="${this.escapeHtml(item.location.id)}" aria-label="${safeName}: ${count} cleaning posts">
          <span class="area-name">${safeName}</span>
          <span class="area-count">${count}</span>
        </button>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([item.location.centerLat, item.location.centerLng], {
        icon,
        title: `${item.location.name} (${count} posts)`,
      });

      marker.on('click', () => {
        this.selectArea(item.location.id);
      });

      marker.addTo(areaLayer);
    }

    // 2. Opt-in Consenting Users' Approximate Area Markers (Offset slightly from municipal center, never exposing raw GPS)
    users.forEach((user, idx) => {
      if (!user.approxLocation) return;
      const isSelected = activeUserId === user.id;
      const firstName = this.escapeHtml(user.name.split(' ')[0] || user.name);
      const roleLetter = user.tag === 'provider' ? 'P' : 'C';
      const offsetLat = user.approxLocation.lat + ((idx % 3) - 1) * 0.012;
      const offsetLng = user.approxLocation.lng + ((idx % 2 === 0 ? 1 : -1)) * 0.014;

      const icon = L.divIcon({
        className: 'linisgo-div-icon',
        html: `<button type="button" class="linisgo-user-marker ${user.tag === 'provider' ? 'provider' : ''} ${isSelected ? 'selected' : ''}" data-user-id="${this.escapeHtml(user.id)}" aria-label="Opt-in user ${firstName}">
          <span class="user-role-tag">${roleLetter}</span>
          <span>${firstName}</span>
        </button>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([offsetLat, offsetLng], {
        icon,
        title: `${user.name} (Opt-in Approximate Area)`,
      });

      marker.on('click', () => {
        this.selectPin(user);
      });

      marker.addTo(userLayer);
    });
  }

  private focusMapOnArea(areaId: string): void {
    const loc = getLocationById(areaId);
    if (loc && this.map) {
      this.map.setView([loc.centerLat, loc.centerLng], 11, { animate: true });
    }
  }

  selectArea(areaId: string): void {
    this.selectedUser.set(null);
    this.selectedAreaId.set(areaId);
    this.focusMapOnArea(areaId);
  }

  closeAreaDetails(): void {
    this.selectedAreaId.set(null);
  }

  selectPin(user: UserProfile): void {
    this.selectedAreaId.set(null);
    this.selectedUser.set(user);
    if (user.approxLocation && this.map) {
      this.map.setView([user.approxLocation.lat, user.approxLocation.lng], 11, { animate: true });
    }
  }

  resetMapView(): void {
    this.selectedAreaId.set(null);
    this.selectedUser.set(null);
    this.dataService.resetFilters();
    if (this.map) {
      this.map.setView([13.08, 121.25], 9, { animate: true });
    }
  }

  onSearchChange(event: CustomEvent): void {
    this.dataService.searchQuery.set(event.detail.value ?? '');
  }

  onLocationFilterChange(event: CustomEvent): void {
    const locId = event.detail.value || 'all';
    this.dataService.selectedLocationId.set(locId);
    if (locId !== 'all') {
      this.selectedAreaId.set(locId);
      this.focusMapOnArea(locId);
    } else {
      this.selectedAreaId.set(null);
      if (this.map) {
        this.map.setView([13.08, 121.25], 9, { animate: true });
      }
    }
  }

  onLocationModeChange(mode: LocationFilterMode): void {
    this.dataService.selectedLocationMode.set(mode);
  }

  onTagChange(tag: 'all' | UserProfileTag): void {
    this.dataService.selectedTag.set(tag);
  }

  onTypeChange(type: 'all' | PostType): void {
    this.dataService.selectedType.set(type);
  }

  onCategoryChange(event: CustomEvent): void {
    this.dataService.selectedCategory.set(event.detail.value || 'all');
  }

  navigateToPost(postId: string): void {
    this.router.navigate(['/post', postId]);
  }

  navigateToProfile(userId: string): void {
    this.router.navigate(['/user-profile', userId]);
  }

  getPostAmountLabel(post: CleaningPost): string {
    return post.amount ? `₱${post.amount.toLocaleString()}` : 'Negotiable';
  }

  getPostCoverageText(post: CleaningPost): string {
    return getPostLocationSummary(post);
  }

  get selectedFilterLocationName(): string {
    const id = this.dataService.selectedLocationId();
    return id === 'all' ? 'All Locations' : getLocationName(id);
  }

  getUserTagLabel(tag: UserProfileTag): string {
    return tag === 'client' ? 'Client' : 'Service Provider';
  }

  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }
}
