import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonIcon,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  notificationsOutline,
  checkmarkDoneOutline,
  mailOpenOutline,
  mailUnreadOutline,
} from 'ionicons/icons';
import { PublicDataService, InAppNotification } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-user-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
    IonBadge,
  ],
})
export class NotificationsPage {
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      notificationsOutline,
      checkmarkDoneOutline,
      mailOpenOutline,
      mailUnreadOutline,
    });
  }

  markAllRead(): void {
    this.dataService.markAllNotificationsRead();
  }

  toggleRead(notif: InAppNotification, event: Event): void {
    event.stopPropagation();
    if (notif.read) {
      this.dataService.markNotificationUnread(notif.id);
    } else {
      this.dataService.markNotificationRead(notif.id);
    }
  }
}
