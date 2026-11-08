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
  shieldOutline,
  personOutline,
  documentsOutline,
  timeOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  arrowForwardOutline,
  openOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { ReportItem } from '../../../shared/models/report.model';
import { UserProfile } from '../../../shared/models/user.model';
import { CleaningPost } from '../../../shared/models/post.model';

@Component({
  selector: 'app-admin-report-review',
  templateUrl: './admin-report-review.page.html',
  styleUrls: ['./admin-report-review.page.scss'],
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
export class AdminReportReviewPage {
  private readonly route = inject(ActivatedRoute);
  readonly dataService = inject(PublicDataService);

  readonly reportId = signal<string>('');

  readonly report = computed<ReportItem | undefined>(() => {
    return this.dataService.reportsSignal().find(r => r.id === this.reportId());
  });

  readonly reportedUser = computed<UserProfile | undefined>(() => {
    const r = this.report();
    return r && r.targetType === 'user' ? this.dataService.getUserById(r.targetId) : undefined;
  });

  readonly reportedPost = computed<CleaningPost | undefined>(() => {
    const r = this.report();
    return r && r.targetType === 'post' ? this.dataService.getPostById(r.targetId) : undefined;
  });

  readonly activeAction = signal<'resolve' | 'dismiss' | null>(null);
  decisionNotes = '';
  toastMessage = '';
  isToastOpen = false;

  constructor() {
    addIcons({
      shieldOutline,
      personOutline,
      documentsOutline,
      timeOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      arrowForwardOutline,
      openOutline,
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.reportId.set(id);
    }
  }

  onStartReview(): void {
    const r = this.report();
    if (!r) return;
    this.dataService.startReportReview(r.id);
    this.showToast('Report marked as Under Review.');
  }

  openDecision(action: 'resolve' | 'dismiss'): void {
    this.activeAction.set(action);
    this.decisionNotes = '';
  }

  cancelDecision(): void {
    this.activeAction.set(null);
    this.decisionNotes = '';
  }

  submitResolve(): void {
    const r = this.report();
    if (!r || !this.decisionNotes.trim()) return;

    this.dataService.resolveReport(r.id, this.decisionNotes.trim());
    this.showToast('Report marked as Resolved.');
    this.cancelDecision();
  }

  submitDismiss(): void {
    const r = this.report();
    if (!r || !this.decisionNotes.trim()) return;

    this.dataService.dismissReport(r.id, this.decisionNotes.trim());
    this.showToast('Report marked as Dismissed.');
    this.cancelDecision();
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.isToastOpen = true;
  }
}
