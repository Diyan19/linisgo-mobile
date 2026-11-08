import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  personOutline,
  shieldCheckmarkOutline,
  banOutline,
  warningOutline,
  locationOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { UserAccountState } from '../../../shared/models/user.model';

@Component({
  selector: 'app-admin-users',
  templateUrl: './admin-users.page.html',
  styleUrls: ['./admin-users.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    IonBadge,
  ],
})
export class AdminUsersPage {
  readonly dataService = inject(PublicDataService);

  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | UserAccountState>('all');

  readonly filteredUsers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.selectedFilter();
    const all = this.dataService.usersSignal();

    return all.filter(u => {
      if (filter !== 'all' && u.state !== filter) return false;
      if (query) {
        const matchName = u.name.toLowerCase().includes(query);
        const matchId = u.id.toLowerCase().includes(query);
        const matchBio = u.bio.toLowerCase().includes(query);
        const matchLoc = u.approxLocation?.label?.toLowerCase().includes(query) ?? false;
        if (!matchName && !matchId && !matchBio && !matchLoc) return false;
      }
      return true;
    });
  });

  constructor() {
    addIcons({
      searchOutline,
      personOutline,
      shieldCheckmarkOutline,
      banOutline,
      warningOutline,
      locationOutline,
      chevronForwardOutline,
    });
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.detail.value || '');
  }

  onFilterChange(event: any): void {
    this.selectedFilter.set(event.detail.value || 'all');
  }
}
