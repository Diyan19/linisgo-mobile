import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  shieldCheckmarkOutline,
  lockClosedOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { AuthService } from '../../../core/services/auth.service';
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
export class UserHomePage implements OnInit {
  readonly dataService = inject(PublicDataService);
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  adminAccessDeniedNotice = false;

  constructor() {
    addIcons({
      addCircleOutline,
      newspaperOutline,
      mapOutline,
      bookmarkOutline,
      documentTextOutline,
      notificationsOutline,
      shieldCheckmarkOutline,
      lockClosedOutline,
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.adminAccessDeniedNotice = params.get('adminDenied') === '1';
    });
  }

  get userTagLabel(): string {
    return this.dataService.currentUser()?.tag === 'client' ? 'Client' : 'Service Provider';
  }

  get totalSavedCount(): number {
    return this.dataService.activeSavedPostIds().length + this.dataService.activeSavedUserIds().length;
  }

  get recentPosts() {
    return this.dataService.publicPosts().slice(0, 2);
  }
}
