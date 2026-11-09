import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  addOutline,
  createOutline,
  archiveOutline,
  checkmarkCircleOutline,
  refreshOutline,
  locationOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { CleaningPost, PostType } from '../../../shared/models/post.model';
import {
  getPostLocationSummary,
  validatePostLocationForPublish,
} from '../../../shared/models/location.model';

@Component({
  selector: 'app-user-my-posts',
  templateUrl: './my-posts.page.html',
  styleUrls: ['./my-posts.page.scss'],
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
export class MyPostsPage {
  readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);

  readonly selectedTab = signal<'all' | PostType>('all');
  feedbackMessage = '';

  readonly displayedPosts = computed(() => {
    const tab = this.selectedTab();
    return this.dataService.myPosts().filter(p => {
      if (tab === 'all') return true;
      return p.type === tab;
    });
  });

  constructor() {
    addIcons({
      addOutline,
      createOutline,
      archiveOutline,
      checkmarkCircleOutline,
      refreshOutline,
      locationOutline,
    });
  }

  setTab(tab: 'all' | PostType): void {
    this.selectedTab.set(tab);
  }

  editPost(post: CleaningPost): void {
    this.router.navigate(['/user/tabs/create'], { queryParams: { editId: post.id } });
  }

  getLocationText(post: CleaningPost): string {
    return getPostLocationSummary(post);
  }

  async togglePostStatus(post: CleaningPost): Promise<void> {
    const oldStatus = post.status;
    let nextStatus = post.status;

    if (oldStatus === 'open') nextStatus = 'closed';
    else if (oldStatus === 'closed') nextStatus = 'open';
    else if (oldStatus === 'active') nextStatus = 'archived';
    else if (oldStatus === 'draft' || oldStatus === 'archived') {
      const check = validatePostLocationForPublish(post);
      if (!check.valid) {
        this.showToast(check.error || 'Please edit this draft and select a location before publishing.');
        return;
      }
      nextStatus = post.type === 'request' ? 'open' : 'active';
    }

    const res = await this.dataService.changePostStatusAsync(post.id, nextStatus);
    if (!res.persisted) {
      this.showToast(res.error || 'Failed to update post status in Cloud Firestore.');
      return;
    }
    this.showToast(`Post status changed from ${oldStatus} to ${nextStatus}.`);
  }

  async archivePost(post: CleaningPost): Promise<void> {
    const res = await this.dataService.changePostStatusAsync(post.id, 'archived');
    if (!res.persisted) {
      this.showToast(res.error || 'Failed to archive post in Cloud Firestore.');
      return;
    }
    this.showToast(`Post "${post.title}" moved to archive.`);
  }

  async restorePost(post: CleaningPost): Promise<void> {
    const check = validatePostLocationForPublish(post);
    if (!check.valid) {
      this.showToast(check.error || 'Please edit this post to select a location before restoring to active status.');
      return;
    }
    const targetStatus = post.type === 'request' ? 'open' : 'active';
    const res = await this.dataService.changePostStatusAsync(post.id, targetStatus);
    if (!res.persisted) {
      this.showToast(res.error || 'Failed to restore post in Cloud Firestore.');
      return;
    }
    this.showToast(`Post "${post.title}" restored to ${targetStatus} status.`);
  }

  private showToast(msg: string): void {
    this.feedbackMessage = msg;
    setTimeout(() => {
      this.feedbackMessage = '';
    }, 3500);
  }

  getAmountText(post: CleaningPost): string {
    return post.amount ? `₱${post.amount.toLocaleString()}` : 'Negotiable';
  }
}
