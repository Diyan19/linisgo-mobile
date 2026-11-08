import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonButton,
  IonIcon,
  IonToast,
  IonAlert,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  shieldCheckmarkOutline,
  refreshOutline,
  logOutOutline,
  warningOutline,
  informationCircleOutline,
  lockClosedOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-admin-settings',
  templateUrl: './admin-settings.page.html',
  styleUrls: ['./admin-settings.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonToast,
    IonAlert,
  ],
})
export class AdminSettingsPage {
  readonly authService = inject(AuthService);
  readonly dataService = inject(PublicDataService);

  readonly isResetAlertOpen = signal<boolean>(false);
  readonly toastMessage = signal<string>('');
  readonly isToastOpen = signal<boolean>(false);

  readonly alertButtons = [
    {
      text: 'Cancel',
      role: 'cancel',
    },
    {
      text: 'Reset Everything',
      role: 'destructive',
      handler: () => {
        this.performReset();
      },
    },
  ];

  constructor() {
    addIcons({
      settingsOutline,
      shieldCheckmarkOutline,
      refreshOutline,
      logOutOutline,
      warningOutline,
      informationCircleOutline,
      lockClosedOutline,
    });
  }

  confirmReset(): void {
    this.isResetAlertOpen.set(true);
  }

  performReset(): void {
    this.dataService.resetDemoData();
    this.toastMessage.set('Demo sample data has been reset to baseline defaults.');
    this.isToastOpen.set(true);
  }

  onLogout(): void {
    this.authService.logout();
  }
}
