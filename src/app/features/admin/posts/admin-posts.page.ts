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
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  documentsOutline,
  eyeOutline,
  eyeOffOutline,
  personOutline,
  pricetagOutline,
  chevronForwardOutline,
  shieldOutline,
  locationOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { CleaningPost } from '../../../shared/models/post.model';
import {
  ORIENTAL_MINDORO_LOCATIONS,
  doesPostMatchLocationFilter,
  getPostLocationSummary,
} from '../../../shared/models/location.model';

@Component({
  selector: 'app-admin-posts',
  templateUrl: './admin-posts.page.html',
  styleUrls: ['./admin-posts.page.scss'],
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
    IonSelect,
    IonSelectOption,
  ],
})
export class AdminPostsPage {
  readonly dataService = inject(PublicDataService);
  readonly locations = ORIENTAL_MINDORO_LOCATIONS;

  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | 'requests' | 'offers' | 'hidden'>('all');
  readonly selectedLocationId = signal<string>('all');

  readonly filteredPosts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.selectedFilter();
    const locId = this.selectedLocationId();
    const all = this.dataService.postsSignal();

    return all.filter(p => {
      if (filter === 'requests' && p.type !== 'request') return false;
      if (filter === 'offers' && p.type !== 'offer') return false;
      if (filter === 'hidden' && !p.moderated) return false;

      if (locId !== 'all' && !doesPostMatchLocationFilter(p, locId, 'all')) {
        return false;
      }

      if (query) {
        const matchTitle = p.title.toLowerCase().includes(query);
        const matchDesc = p.description.toLowerCase().includes(query);
        const matchAuthor = p.authorName.toLowerCase().includes(query);
        const matchCat = p.category.toLowerCase().includes(query);
        const matchLoc = getPostLocationSummary(p).toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchAuthor && !matchCat && !matchLoc) return false;
      }
      return true;
    });
  });

  constructor() {
    addIcons({
      searchOutline,
      documentsOutline,
      eyeOutline,
      eyeOffOutline,
      personOutline,
      pricetagOutline,
      chevronForwardOutline,
      shieldOutline,
      locationOutline,
    });
  }

  getLocationSummary(post: CleaningPost): string {
    return getPostLocationSummary(post);
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.detail.value || '');
  }

  onFilterChange(event: any): void {
    this.selectedFilter.set(event.detail.value || 'all');
  }

  onLocationChange(event: any): void {
    this.selectedLocationId.set(event.detail.value || 'all');
  }
}
