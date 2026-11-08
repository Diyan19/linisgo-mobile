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
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { CleaningPost, PostType } from '../../../shared/models/post.model';

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
    });
  }

  setTab(tab: 'all' | PostType): void {
    this.selectedTab.set(tab);
  }

  editPost(post: CleaningPost): void {
    this.router.navigate(['/user/tabs/create'], { queryParams: { editId: post.id } });
  }

  togglePostStatus(post: CleaningPost): void {
    const oldStatus = post.status;
    let nextStatus = post.status;

    if (oldStatus === 'open') nextStatus = 'closed';
    else if (oldStatus === 'closed') nextStatus = 'open';
    else if (oldStatus === 'active') nextStatus = 'closed';
    else if (oldStatus === 'draft') nextStatus = post.type === 'request' ? 'open' : 'active';
    else if (oldStatus === 'archived') nextStatus = post.type === 'request' ? 'open' : 'active';

    this.dataService.changePostStatus(post.id, nextStatus);
    this.showToast(`Post status changed from ${oldStatus} to ${nextStatus}.`);
  }

  archivePost(post: CleaningPost): void {
    this.dataService.archivePost(post.id);
    this.showToast(`Post "${post.title}" moved to archive.`);
  }

  restorePost(post: CleaningPost): void {
    this.dataService.changePostStatus(post.id, post.type === 'request' ? 'open' : 'active');
    this.showToast(`Post "${post.title}" restored to active status.`);
  }

  private showToast(msg: string): void {
    this.feedbackMessage = msg;
    setTimeout(() => {
      this.feedbackMessage = '';
    }, 3000);
  }

  getAmountText(post: CleaningPost): string {
    return post.amount ? `₱${post.amount.toLocaleString()}` : 'Negotiable';
  }
}
