import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  notificationsOutline,
  checkmarkDoneOutline,
  checkmarkOutline,
  ellipseOutline,
  timeOutline,
  shieldAlertOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-admin-notifications',
  templateUrl: './admin-notifications.page.html',
  styleUrls: ['./admin-notifications.page.scss'],
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
    IonCardContent,
    IonButton,
    IonIcon,
    IonBadge,
  ],
})
export class AdminNotificationsPage {
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      notificationsOutline,
      checkmarkDoneOutline,
      checkmarkOutline,
      ellipseOutline,
      timeOutline,
      shieldAlertOutline,
    });
  }

  toggleRead(id: string, currentRead: boolean): void {
    if (currentRead) {
      this.dataService.markAdminNotificationUnread(id);
    } else {
      this.dataService.markAdminNotificationRead(id);
    }
  }

  markAllRead(): void {
    this.dataService.markAllAdminNotificationsRead();
  }
}
