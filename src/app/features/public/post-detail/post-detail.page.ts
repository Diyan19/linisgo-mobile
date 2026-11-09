import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonBadge,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { AuthService } from '../../../core/services/auth.service';
import {
  arrowBackOutline,
  personOutline,
  pricetagOutline,
  calendarOutline,
  informationCircleOutline,
  bookmarkOutline,
  bookmark,
  flagOutline,
  locationOutline,
  mapOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { CleaningPost } from '../../../shared/models/post.model';
import { UserProfile } from '../../../shared/models/user.model';
import {
  getCoverageLocationNames,
  getLocationName,
  getPostAssociatedLocationIds,
} from '../../../shared/models/location.model';

@Component({
  selector: 'app-public-post-detail',
  templateUrl: './post-detail.page.html',
  styleUrls: ['./post-detail.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonBadge,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
  ],
})
export class PostDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly dataService = inject(PublicDataService);
  readonly authService = inject(AuthService);

  post: CleaningPost | undefined;
  author: UserProfile | undefined;

  constructor() {
    addIcons({
      arrowBackOutline,
      personOutline,
      pricetagOutline,
      calendarOutline,
      informationCircleOutline,
      bookmarkOutline,
      bookmark,
      flagOutline,
      locationOutline,
      mapOutline,
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.post = this.dataService.getPostById(id);
      if (this.post) {
        this.author = this.dataService.getUserById(this.post.authorId);
      }
    }
  }

  get authorInitial(): string {
    return (this.author?.name || '?').charAt(0).toUpperCase();
  }

  get formattedAmount(): string {
    return this.post?.amount ? `₱${this.post.amount.toLocaleString()}` : 'Negotiable';
  }

  get requestLocationName(): string {
    if (!this.post) return 'Location not specified';
    return this.post.targetLocationId ? getLocationName(this.post.targetLocationId) : 'Location not specified';
  }

  get offerCoverageNames(): string[] {
    if (!this.post) return [];
    return getCoverageLocationNames(this.post.coverageAreaIds);
  }

  get primaryLocationId(): string | null {
    if (!this.post) return null;
    const ids = getPostAssociatedLocationIds(this.post);
    return ids.length > 0 ? ids[0] : null;
  }

  get isSaved(): boolean {
    return this.post ? this.dataService.isPostSaved(this.post.id) : false;
  }

  get isOwnPost(): boolean {
    return this.authService.isLoggedIn() && this.post?.authorId === this.dataService.activeActorId();
  }

  viewOnMap(locationId?: string | null): void {
    const loc = locationId || this.primaryLocationId;
    if (loc) {
      this.dataService.selectedLocationId.set(loc);
    }
    const targetRoute = this.authService.isLoggedIn() ? '/user/tabs/map' : '/tabs/map';
    this.router.navigate([targetRoute], {
      queryParams: loc ? { areaId: loc } : undefined,
    });
  }

  toggleSave(): void {
    if (!this.post) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.dataService.toggleSavePost(this.post.id);
  }

  reportPost(): void {
    if (!this.post) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.router.navigate(['/user/report'], {
      queryParams: { type: 'post', id: this.post.id },
    });
  }
}
