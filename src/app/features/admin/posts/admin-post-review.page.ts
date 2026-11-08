import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonButton,
  IonIcon,
  IonBadge,
  IonTextarea,
  IonToast,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  documentsOutline,
  personOutline,
  eyeOffOutline,
  eyeOutline,
  shieldOutline,
  timeOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  openOutline,
  locationOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { CleaningPost } from '../../../shared/models/post.model';
import { ReportItem } from '../../../shared/models/report.model';
import {
  getCoverageLocationNames,
  getLocationName,
  getPostLocationSummary,
} from '../../../shared/models/location.model';

@Component({
  selector: 'app-admin-post-review',
  templateUrl: './admin-post-review.page.html',
  styleUrls: ['./admin-post-review.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonBadge,
    IonTextarea,
    IonToast,
  ],
})
export class AdminPostReviewPage {
  private readonly route = inject(ActivatedRoute);
  readonly dataService = inject(PublicDataService);

  readonly postId = signal<string>('');

  readonly post = computed<CleaningPost | undefined>(() => {
    return this.dataService.getPostById(this.postId());
  });

  readonly author = computed(() => {
    const p = this.post();
    return p ? this.dataService.getUserById(p.authorId) : undefined;
  });

  readonly relatedReports = computed<ReportItem[]>(() => {
    return this.dataService.getReportsForTarget('post', this.postId());
  });

  // Action form state
  readonly activeAction = signal<'hide' | 'restore' | null>(null);
  actionReason = '';
  toastMessage = '';
  isToastOpen = false;

  constructor() {
    addIcons({
      documentsOutline,
      personOutline,
      eyeOffOutline,
      eyeOutline,
      shieldOutline,
      timeOutline,
      alertCircleOutline,
      checkmarkCircleOutline,
      openOutline,
      locationOutline,
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.postId.set(id);
    }
  }

  getLocationSummary(p: CleaningPost): string {
    return getPostLocationSummary(p);
  }

  getLocationChips(p: CleaningPost): string[] {
    if (p.type === 'request') {
      return p.targetLocationId ? [getLocationName(p.targetLocationId)] : [];
    }
    return getCoverageLocationNames(p.coverageAreaIds);
  }

  openAction(action: 'hide' | 'restore'): void {
    this.activeAction.set(action);
    this.actionReason = '';
  }

  cancelAction(): void {
    this.activeAction.set(null);
    this.actionReason = '';
  }

  submitHide(): void {
    const p = this.post();
    if (!p || !this.actionReason.trim()) return;

    this.dataService.hidePost(p.id, this.actionReason.trim());
    this.showToast(`Post "${p.title}" is now hidden from public discovery.`);
    this.cancelAction();
  }

  submitRestore(): void {
    const p = this.post();
    if (!p || !this.actionReason.trim()) return;

    this.dataService.restorePost(p.id, this.actionReason.trim());
    this.showToast(`Moderation restriction lifted on "${p.title}".`);
    this.cancelAction();
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.isToastOpen = true;
  }
}
