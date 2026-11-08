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
  homeOutline,
  newspaperOutline,
  mapOutline,
  addCircleOutline,
  personOutline,
  notificationsOutline,
  logOutOutline,
} from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { PublicDataService } from '../../core/services/public-data.service';

@Component({
  selector: 'app-user-tabs',
  templateUrl: './user-tabs.component.html',
  styleUrls: ['./user-tabs.component.scss'],
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
export class UserTabsComponent {
  readonly authService = inject(AuthService);
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      homeOutline,
      newspaperOutline,
      mapOutline,
      addCircleOutline,
      personOutline,
      notificationsOutline,
      logOutOutline,
    });
  }

  onLogout(): void {
    this.authService.logout();
  }
}
