import { Component, input, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCardContent,
  IonBadge,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bookmarkOutline,
  bookmark,
  flagOutline,
  locationOutline,
} from 'ionicons/icons';
import { CleaningPost } from '../../models/post.model';
import {
  getCoverageLocationNames,
  getLocationName,
} from '../../models/location.model';
import { AuthService } from '../../../core/services/auth.service';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-post-card',
  templateUrl: './post-card.component.html',
  styleUrls: ['./post-card.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonCard,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCardContent,
    IonBadge,
    IonButton,
    IonIcon,
  ],
})
export class PostCardComponent {
  readonly authService = inject(AuthService);
  readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);

  readonly post = input.required<CleaningPost>();
  readonly showAuthor = input<boolean>(true);

  constructor() {
    addIcons({
      bookmarkOutline,
      bookmark,
      flagOutline,
      locationOutline,
    });
  }

  get initial(): string {
    return (this.post().authorName || '?').charAt(0).toUpperCase();
  }

  get tagLabel(): string {
    return this.post().authorTag === 'client' ? 'Client' : 'Service Provider';
  }

  get typeLabel(): string {
    return this.post().type === 'offer' ? 'OFFERING SERVICES' : 'LOOKING FOR SERVICES';
  }

  get typeColor(): string {
    return this.post().type === 'offer' ? 'primary' : 'tertiary';
  }

  get formattedAmount(): string {
    const amt = this.post().amount;
    return amt ? `₱${amt.toLocaleString()}` : 'Negotiable';
  }

  get locationTags(): string[] {
    const p = this.post();
    if (p.type === 'request') {
      return p.targetLocationId ? [getLocationName(p.targetLocationId)] : [];
    }
    return getCoverageLocationNames(p.coverageAreaIds);
  }

  get locationPrefixLabel(): string {
    return this.post().type === 'request' ? 'Needed in:' : 'Covers:';
  }

  get isSaved(): boolean {
    return this.dataService.isPostSaved(this.post().id);
  }

  get isOwnPost(): boolean {
    return this.authService.isLoggedIn() && this.post().authorId === 'demo';
  }

  toggleSave(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.dataService.toggleSavePost(this.post().id);
  }

  reportPost(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.router.navigate(['/user/report'], {
      queryParams: { type: 'post', id: this.post().id },
    });
  }
}
