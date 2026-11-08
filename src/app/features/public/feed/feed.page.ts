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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  funnelOutline,
  closeCircleOutline,
  mapOutline,
  refreshOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';
import { PostCategory, PostType } from '../../../shared/models/post.model';
import { UserProfileTag } from '../../../shared/models/user.model';

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
    PostCardComponent,
  ],
})
export class FeedPage {
  readonly dataService = inject(PublicDataService);
  readonly authService = inject(AuthService);

  showMoreFilters = false;

  get mapLink(): string {
    return this.authService.isLoggedIn() ? '/user/tabs/map' : '/tabs/map';
  }

  constructor() {
    addIcons({
      funnelOutline,
      closeCircleOutline,
      mapOutline,
      refreshOutline,
    });
  }

  onSearchChange(event: CustomEvent): void {
    const val = event.detail.value ?? '';
    this.dataService.searchQuery.set(val);
  }

  onTagChange(tag: 'all' | UserProfileTag): void {
    this.dataService.selectedTag.set(tag);
  }

  onTypeChange(type: 'all' | PostType): void {
    this.dataService.selectedType.set(type);
  }

  onCategoryChange(event: CustomEvent): void {
    this.dataService.selectedCategory.set(event.detail.value);
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
