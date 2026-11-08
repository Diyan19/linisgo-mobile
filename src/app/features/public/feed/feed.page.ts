import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonSearchbar,
  IonButton,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonBadge,
  IonInput,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  funnelOutline,
  closeCircleOutline,
  mapOutline,
  refreshOutline,
  locationOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';
import { PostCategory, PostType } from '../../../shared/models/post.model';
import { UserProfileTag } from '../../../shared/models/user.model';
import {
  ORIENTAL_MINDORO_LOCATIONS,
  LocationFilterMode,
  getLocationName,
} from '../../../shared/models/location.model';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-public-feed',
  templateUrl: './feed.page.html',
  styleUrls: ['./feed.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonSearchbar,
    IonButton,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonBadge,
    IonInput,
    PostCardComponent,
  ],
})
export class FeedPage {
  readonly dataService = inject(PublicDataService);
  readonly authService = inject(AuthService);
  readonly locations = ORIENTAL_MINDORO_LOCATIONS;

  showMoreFilters = false;

  get mapLink(): string {
    return this.authService.isLoggedIn() ? '/user/tabs/map' : '/tabs/map';
  }

  get selectedLocationLabel(): string {
    const locId = this.dataService.selectedLocationId();
    return locId === 'all' ? 'All Oriental Mindoro' : getLocationName(locId);
  }

  constructor() {
    addIcons({
      funnelOutline,
      closeCircleOutline,
      mapOutline,
      refreshOutline,
      locationOutline,
    });
  }

  onSearchChange(event: CustomEvent): void {
    const val = event.detail.value ?? '';
    this.dataService.searchQuery.set(val);
  }

  onLocationChange(event: CustomEvent): void {
    const locId = event.detail.value || 'all';
    this.dataService.selectedLocationId.set(locId);
  }

  onLocationModeChange(mode: LocationFilterMode): void {
    this.dataService.selectedLocationMode.set(mode);
    // Keep postType filter harmonized if user explicitly picks requests-in or offers-covering
    if (mode === 'requests-in' && this.dataService.selectedType() === 'offer') {
      this.dataService.selectedType.set('all');
    } else if (mode === 'offers-covering' && this.dataService.selectedType() === 'request') {
      this.dataService.selectedType.set('all');
    }
  }

  onTagChange(tag: 'all' | UserProfileTag): void {
    this.dataService.selectedTag.set(tag);
  }

  onTypeChange(type: 'all' | PostType): void {
    this.dataService.selectedType.set(type);
    if (type === 'request' && this.dataService.selectedLocationMode() === 'offers-covering') {
      this.dataService.selectedLocationMode.set('all');
    } else if (type === 'offer' && this.dataService.selectedLocationMode() === 'requests-in') {
      this.dataService.selectedLocationMode.set('all');
    }
  }

  onCategoryChange(event: CustomEvent): void {
    this.dataService.selectedCategory.set(event.detail.value);
  }

  onAvailabilityChange(event: CustomEvent): void {
    this.dataService.selectedAvailability.set(event.detail.value || 'all');
  }

  onMaxPriceChange(event: CustomEvent): void {
    const val = event.detail.value;
    this.dataService.maxPriceFilter.set(val ? +val : null);
  }

  onSortChange(event: CustomEvent): void {
    this.dataService.selectedSort.set(event.detail.value);
  }

  toggleMoreFilters(): void {
    this.showMoreFilters = !this.showMoreFilters;
  }

  clearFilters(): void {
    this.dataService.resetFilters();
  }
}
