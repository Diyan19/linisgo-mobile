import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonBadge,
  IonGrid,
  IonRow,
  IonCol,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  newspaperOutline,
  mapOutline,
  bookmarkOutline,
  documentTextOutline,
  notificationsOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';

@Component({
  selector: 'app-user-home',
  templateUrl: './user-home.page.html',
  styleUrls: ['./user-home.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonButton,
    IonBadge,
    IonGrid,
    IonRow,
    IonCol,
    IonIcon,
    PostCardComponent,
  ],
})
export class UserHomePage {
  readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      addCircleOutline,
      newspaperOutline,
      mapOutline,
      bookmarkOutline,
      documentTextOutline,
      notificationsOutline,
    });
  }

  get userTagLabel(): string {
    return this.dataService.currentUser()?.tag === 'client' ? 'Client' : 'Service Provider';
  }

  get totalSavedCount(): number {
    return this.dataService.savedPostsSignal().length + this.dataService.savedUsersSignal().length;
  }

  get recentPosts() {
    return this.dataService.publicPosts().slice(0, 2);
  }
}
