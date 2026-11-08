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
  ribbonOutline,
  personOutline,
  documentsOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  banOutline,
  eyeOffOutline,
  openOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { AppealItem } from '../../../shared/models/report.model';
import { UserProfile } from '../../../shared/models/user.model';
import { CleaningPost } from '../../../shared/models/post.model';

@Component({
  selector: 'app-admin-appeal-detail',
  templateUrl: './admin-appeal-detail.page.html',
  styleUrls: ['./admin-appeal-detail.page.scss'],
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
export class AdminAppealDetailPage {
  private readonly route = inject(ActivatedRoute);
  readonly dataService = inject(PublicDataService);

  readonly appealId = signal<string>('');

  readonly appeal = computed<AppealItem | undefined>(() => {
    return this.dataService.appealsSignal().find(a => a.id === this.appealId());
  });

  readonly targetUser = computed<UserProfile | undefined>(() => {
    const a = this.appeal();
    return a && a.targetType === 'account' ? this.dataService.getUserById(a.targetId) : undefined;
  });

  readonly targetPost = computed<CleaningPost | undefined>(() => {
    const a = this.appeal();
    return a && a.targetType === 'post' ? this.dataService.getPostById(a.targetId) : undefined;
  });

  readonly activeAction = signal<'approve' | 'reject' | null>(null);
  decisionNotes = '';
  toastMessage = '';
  isToastOpen = false;

  constructor() {
    addIcons({
      ribbonOutline,
      personOutline,
      documentsOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      banOutline,
      eyeOffOutline,
      openOutline,
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.appealId.set(id);
    }
  }

  openDecision(action: 'approve' | 'reject'): void {
    this.activeAction.set(action);
    this.decisionNotes = '';
  }

  cancelDecision(): void {
    this.activeAction.set(null);
    this.decisionNotes = '';
  }

  submitApprove(): void {
    const a = this.appeal();
    if (!a || !this.decisionNotes.trim()) return;

    this.dataService.approveAppeal(a.id, this.decisionNotes.trim());
    this.showToast('Appeal approved and remedy applied.');
    this.cancelDecision();
  }

  submitReject(): void {
    const a = this.appeal();
    if (!a || !this.decisionNotes.trim()) return;

    this.dataService.rejectAppeal(a.id, this.decisionNotes.trim());
    this.showToast('Appeal rejected. Prior moderation restrictions remain.');
    this.cancelDecision();
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.isToastOpen = true;
  }
}
