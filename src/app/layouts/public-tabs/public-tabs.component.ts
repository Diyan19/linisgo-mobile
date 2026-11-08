import { Component } from '@angular/core';
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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  newspaperOutline,
  mapOutline,
  searchOutline,
  logInOutline,
  sparklesOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-public-tabs',
  templateUrl: './public-tabs.component.html',
  styleUrls: ['./public-tabs.component.scss'],
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
  ],
})
export class PublicTabsComponent {
  constructor() {
    addIcons({
      homeOutline,
      newspaperOutline,
      mapOutline,
      searchOutline,
      logInOutline,
      sparklesOutline,
    });
  }
}
