import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonBadge,
  IonIcon,
  IonSpinner,
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
  mailOutline,
  refreshOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
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
    IonSpinner,
  ],
})
export class UserProfileHomePage {
  readonly authService = inject(AuthService);
  readonly dataService = inject(PublicDataService);

  tagChangeToast = '';
  verificationToast = '';
  verificationToastIsError = false;
  isSendingVerification = false;
  isRefreshingVerification = false;

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
      mailOutline,
      refreshOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
    });
  }

  get user() {
    return this.dataService.currentUser();
  }

  get userInitial(): string {
    return (this.user?.name || this.authService.currentUserDisplayName() || '?').charAt(0).toUpperCase();
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

  async onResendVerification(): Promise<void> {
    this.verificationToast = '';
    this.verificationToastIsError = false;
    this.isSendingVerification = true;
    const res = await this.authService.sendVerificationEmail();
    this.isSendingVerification = false;
    this.verificationToast = res.message;
    this.verificationToastIsError = !res.success;
  }

  async onRefreshVerification(): Promise<void> {
    this.verificationToast = '';
    this.verificationToastIsError = false;
    this.isRefreshingVerification = true;
    const res = await this.authService.reloadCurrentUser();
    this.isRefreshingVerification = false;
    this.verificationToast = res.message;
    this.verificationToastIsError = !res.success;
  }

  async onLogout(): Promise<void> {
    await this.authService.logout();
  }
}
