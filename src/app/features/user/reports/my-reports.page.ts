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
import { flagOutline, addOutline } from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { ReportStatus } from '../../../shared/models/report.model';

@Component({
  selector: 'app-user-my-reports',
  templateUrl: './my-reports.page.html',
  styleUrls: ['./my-reports.page.scss'],
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
export class MyReportsPage {
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      flagOutline,
      addOutline,
    });
  }

  getStatusColor(status: ReportStatus): string {
    switch (status) {
      case 'Pending':
        return 'warning';
      case 'Under Review':
        return 'primary';
      case 'Resolved':
        return 'success';
      case 'Dismissed':
        return 'medium';
      default:
        return 'medium';
    }
  }
}
