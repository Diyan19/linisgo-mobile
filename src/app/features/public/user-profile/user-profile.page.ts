import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  personOutline,
  callOutline,
  logoFacebook,
  checkmarkCircleOutline,
  closeCircleOutline,
  locationOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';
import { CleaningPost } from '../../../shared/models/post.model';
import { UserProfile } from '../../../shared/models/user.model';

import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';
import {
  bookmarkOutline,
  bookmark,
  flagOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-public-user-profile',
  templateUrl: './user-profile.page.html',
  styleUrls: ['./user-profile.page.scss'],
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
    PostCardComponent,
  ],
})
export class UserProfilePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly dataService = inject(PublicDataService);
  readonly authService = inject(AuthService);

  user: UserProfile | undefined;
  userPosts: CleaningPost[] = [];

  constructor() {
    addIcons({
      arrowBackOutline,
      personOutline,
      callOutline,
      logoFacebook,
      checkmarkCircleOutline,
      closeCircleOutline,
      locationOutline,
      bookmarkOutline,
      bookmark,
      flagOutline,
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.user = this.dataService.getUserById(id);
      this.userPosts = this.dataService.getUserPosts(id);
    }
  }

  get userInitial(): string {
    return (this.user?.name || '?').charAt(0).toUpperCase();
  }

  get tagLabel(): string {
    return this.user?.tag === 'client' ? 'Client' : 'Service Provider';
  }

  get isSavedUser(): boolean {
    return this.user ? this.dataService.isUserSaved(this.user.id) : false;
  }

  get isOwnProfile(): boolean {
    return this.authService.isLoggedIn() && this.user?.id === 'demo';
  }

  toggleSaveUser(): void {
    if (!this.user) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.dataService.toggleSaveUser(this.user.id);
  }

  reportUser(): void {
    if (!this.user) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.router.navigate(['/user/report'], {
      queryParams: { type: 'user', id: this.user.id },
    });
  }
}
