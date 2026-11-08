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
  IonBadge,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { scaleOutline, addOutline } from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { AppealStatus } from '../../../shared/models/report.model';

@Component({
  selector: 'app-user-my-appeals',
  templateUrl: './my-appeals.page.html',
  styleUrls: ['./my-appeals.page.scss'],
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
    IonBadge,
    IonIcon,
  ],
})
export class MyAppealsPage {
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      scaleOutline,
      addOutline,
    });
  }

  getStatusColor(status: AppealStatus): string {
    switch (status) {
      case 'Pending':
        return 'warning';
      case 'Approved':
        return 'success';
      case 'Rejected':
        return 'danger';
      default:
        return 'medium';
    }
  }
}
