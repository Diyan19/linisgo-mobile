import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon,
  IonBadge,
  IonItem,
  IonLabel,
  IonList,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  ribbonOutline,
  notificationsOutline,
  listOutline,
  hardwareChipOutline,
  settingsOutline,
  logOutOutline,
  chevronForwardOutline,
  shieldCheckmarkOutline,
  personCircleOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-admin-more',
  templateUrl: './admin-more.page.html',
  styleUrls: ['./admin-more.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    IonBadge,
    IonItem,
    IonLabel,
    IonList,
  ],
})
export class AdminMorePage {
  readonly authService = inject(AuthService);
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      ribbonOutline,
      notificationsOutline,
      listOutline,
      hardwareChipOutline,
      settingsOutline,
      logOutOutline,
      chevronForwardOutline,
      shieldCheckmarkOutline,
      personCircleOutline,
    });
  }

  onLogout(): void {
    this.authService.logout();
  }
}
