import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonSearchbar,
  IonBadge,
  IonButton,
  IonIcon,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  personOutline,
  newspaperOutline,
  pricetagOutline,
  locationOutline,
  refreshOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';
import { UserProfileTag } from '../../../shared/models/user.model';
import {
  ORIENTAL_MINDORO_LOCATIONS,
  LocationFilterMode,
  getLocationName,
} from '../../../shared/models/location.model';

@Component({
  selector: 'app-public-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonSearchbar,
    IonBadge,
    IonButton,
    IonIcon,
    IonSelect,
    IonSelectOption,
    PostCardComponent,
  ],
})
export class SearchPage {
  readonly dataService = inject(PublicDataService);
  readonly locations = ORIENTAL_MINDORO_LOCATIONS;

  constructor() {
    addIcons({
      searchOutline,
      personOutline,
      newspaperOutline,
      pricetagOutline,
      locationOutline,
      refreshOutline,
      shieldCheckmarkOutline,
    });
  }

  get selectedLocationLabel(): string {
    const id = this.dataService.selectedLocationId();
    return id === 'all' ? 'All Locations' : getLocationName(id);
  }

  onSearchChange(event: CustomEvent): void {
    this.dataService.searchQuery.set(event.detail.value ?? '');
  }

  onLocationChange(event: CustomEvent): void {
    this.dataService.selectedLocationId.set(event.detail.value || 'all');
  }

  onLocationModeChange(mode: LocationFilterMode): void {
    this.dataService.selectedLocationMode.set(mode);
  }

  onTagChange(tag: 'all' | UserProfileTag): void {
    this.dataService.selectedTag.set(tag);
  }

  onAvailabilityToggle(): void {
    const next = this.dataService.selectedAvailability() === 'all' ? 'available' : 'all';
    this.dataService.selectedAvailability.set(next);
  }

  resetAllFilters(): void {
    this.dataService.resetFilters();
  }

  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  getTagLabel(tag: UserProfileTag): string {
    return tag === 'client' ? 'Client' : 'Service Provider';
  }
}
