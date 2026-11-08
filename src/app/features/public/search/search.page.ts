import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonSearchbar,
  IonBadge,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  personOutline,
  newspaperOutline,
  pricetagOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';
import { UserProfileTag } from '../../../shared/models/user.model';

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
    PostCardComponent,
  ],
})
export class SearchPage {
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      searchOutline,
      personOutline,
      newspaperOutline,
      pricetagOutline,
    });
  }

  onSearchChange(event: CustomEvent): void {
    this.dataService.searchQuery.set(event.detail.value ?? '');
  }

  onTagChange(tag: 'all' | UserProfileTag): void {
    this.dataService.selectedTag.set(tag);
  }

  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  getTagLabel(tag: UserProfileTag): string {
    return tag === 'client' ? 'Client' : 'Service Provider';
  }
}
