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
  arrowForwardOutline,
  sparklesOutline,
  navigateOutline,
  newspaperOutline,
  personAddOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCardComponent } from '../../../shared/components/post-card/post-card.component';
import { PostCategory } from '../../../shared/models/post.model';

@Component({
  selector: 'app-public-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
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
export class HomePage {
  private readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);

  readonly latestPosts = () => this.dataService.publicPosts().slice(0, 2);

  constructor() {
    addIcons({
      arrowForwardOutline,
      sparklesOutline,
      navigateOutline,
      newspaperOutline,
      personAddOutline,
    });
  }

  onSelectCategory(category: PostCategory): void {
    this.dataService.selectedCategory.set(category);
    this.router.navigate(['/tabs/feed']);
  }
}
