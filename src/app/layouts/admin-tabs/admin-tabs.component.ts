import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  speedometerOutline,
  peopleOutline,
  documentsOutline,
  shieldOutline,
  ellipsisHorizontalCircleOutline,
  notificationsOutline,
  logOutOutline,
  listOutline,
  hardwareChipOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { PublicDataService } from '../../core/services/public-data.service';

@Component({
  selector: 'app-admin-tabs',
  templateUrl: './admin-tabs.component.html',
  styleUrls: ['./admin-tabs.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonBadge,
  ],
})
export class AdminTabsComponent {
  readonly authService = inject(AuthService);
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      speedometerOutline,
      peopleOutline,
      documentsOutline,
      shieldOutline,
      ellipsisHorizontalCircleOutline,
      notificationsOutline,
      logOutOutline,
      listOutline,
      hardwareChipOutline,
    });
  }

  onLogout(): void {
    this.authService.logout();
  }
}
