import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonBadge,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  createOutline,
  documentTextOutline,
  bookmarkOutline,
  notificationsOutline,
  flagOutline,
  scaleOutline,
  settingsOutline,
  logOutOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-user-profile-home',
  templateUrl: './user-profile-home.page.html',
  styleUrls: ['./user-profile-home.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonButton,
    IonBadge,
    IonIcon,
  ],
})
export class UserProfileHomePage {
  readonly authService = inject(AuthService);
  readonly dataService = inject(PublicDataService);

  tagChangeToast = '';

  constructor() {
    addIcons({
      createOutline,
      documentTextOutline,
      bookmarkOutline,
      notificationsOutline,
      flagOutline,
      scaleOutline,
      settingsOutline,
      logOutOutline,
      swapHorizontalOutline,
    });
  }

  get user() {
    return this.dataService.currentUser();
  }

  get userInitial(): string {
    return (this.user?.name || '?').charAt(0).toUpperCase();
  }

  get tagLabel(): string {
    return this.user?.tag === 'client' ? 'Client' : 'Service Provider';
  }

  get oppositeTagLabel(): string {
    return this.user?.tag === 'client' ? 'Service Provider' : 'Client';
  }

  onToggleTag(): void {
    this.dataService.toggleUserTag();
    this.tagChangeToast = `Profile status tag changed to ${this.tagLabel}. All regular user features remain fully accessible.`;
    setTimeout(() => {
      this.tagChangeToast = '';
    }, 3500);
  }

  onLogout(): void {
    this.authService.logout();
  }
}
