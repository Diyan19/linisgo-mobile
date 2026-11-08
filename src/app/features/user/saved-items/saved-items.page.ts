import { Component, inject, signal } from '@angular/core';
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
import {
  bookmarkOutline,
  trashOutline,
  arrowForwardOutline,
  personOutline,
  documentTextOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { CleaningPost } from '../../../shared/models/post.model';
import { UserProfile } from '../../../shared/models/user.model';

@Component({
  selector: 'app-user-saved-items',
  templateUrl: './saved-items.page.html',
  styleUrls: ['./saved-items.page.scss'],
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
export class SavedItemsPage {
  readonly dataService = inject(PublicDataService);
  readonly activeSegment = signal<'posts' | 'users'>('posts');
  toastMessage = '';

  constructor() {
    addIcons({
      bookmarkOutline,
      trashOutline,
      arrowForwardOutline,
      personOutline,
      documentTextOutline,
    });
  }

  setSegment(seg: 'posts' | 'users'): void {
    this.activeSegment.set(seg);
  }

  unsavePost(post: CleaningPost, event: Event): void {
    event.stopPropagation();
    this.dataService.toggleSavePost(post.id);
    this.showToast(`Removed "${post.title}" from bookmarks.`);
  }

  unsaveUser(user: UserProfile, event: Event): void {
    event.stopPropagation();
    this.dataService.toggleSaveUser(user.id);
    this.showToast(`Removed "${user.name}" from saved profiles.`);
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => {
      this.toastMessage = '';
    }, 2800);
  }

  getUserTagLabel(tag: string): string {
    return tag === 'client' ? 'Client' : 'Service Provider';
  }
}
