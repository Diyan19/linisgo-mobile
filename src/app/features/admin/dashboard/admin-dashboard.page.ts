import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
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
  peopleOutline,
  documentsOutline,
  shieldAlertOutline,
  ribbonOutline,
  banOutline,
  mapOutline,
  timeOutline,
  arrowForwardOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  hardwareChipOutline,
  settingsOutline,
  listOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-dashboard.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonBadge,
    IonItem,
    IonLabel,
    IonList,
  ],
})
export class AdminDashboardPage {
  readonly dataService = inject(PublicDataService);

  constructor() {
    addIcons({
      peopleOutline,
      documentsOutline,
      shieldAlertOutline,
      ribbonOutline,
      banOutline,
      mapOutline,
      timeOutline,
      arrowForwardOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      hardwareChipOutline,
      settingsOutline,
      listOutline,
    });
  }
}
