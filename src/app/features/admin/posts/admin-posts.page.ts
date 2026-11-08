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
  documentsOutline,
  eyeOutline,
  eyeOffOutline,
  personOutline,
  pricetagOutline,
  chevronForwardOutline,
  shieldAlertOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostType } from '../../../shared/models/post.model';

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
  ],
})
export class AdminPostsPage {
  readonly dataService = inject(PublicDataService);

  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | 'requests' | 'offers' | 'hidden'>('all');

  readonly filteredPosts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.selectedFilter();
    const all = this.dataService.postsSignal();

    return all.filter(p => {
      if (filter === 'requests' && p.type !== 'request') return false;
      if (filter === 'offers' && p.type !== 'offer') return false;
      if (filter === 'hidden' && !p.moderated) return false;

      if (query) {
        const matchTitle = p.title.toLowerCase().includes(query);
        const matchDesc = p.description.toLowerCase().includes(query);
        const matchAuthor = p.authorName.toLowerCase().includes(query);
        const matchCat = p.category.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchAuthor && !matchCat) return false;
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
      shieldAlertOutline,
    });
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.detail.value || '');
  }

  onFilterChange(event: any): void {
    this.selectedFilter.set(event.detail.value || 'all');
  }
}
