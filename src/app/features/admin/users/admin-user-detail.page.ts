import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonToast,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personOutline,
  warningOutline,
  banOutline,
  checkmarkCircleOutline,
  timeOutline,
  locationOutline,
  callOutline,
  logoFacebook,
  documentsOutline,
  eyeOutline,
  eyeOffOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { UserProfile } from '../../../shared/models/user.model';
import { CleaningPost } from '../../../shared/models/post.model';

@Component({
  selector: 'app-admin-user-detail',
  templateUrl: './admin-user-detail.page.html',
  styleUrls: ['./admin-user-detail.page.scss'],
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
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonToast,
  ],
})
export class AdminUserDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly dataService = inject(PublicDataService);

  readonly userId = signal<string>('');

  readonly user = computed<UserProfile | undefined>(() => {
    return this.dataService.getUserById(this.userId());
  });

  readonly userPosts = computed<CleaningPost[]>(() => {
    return this.dataService.getUserPosts(this.userId());
  });

  // Modal / Form state for actions
  readonly activeAction = signal<'warning' | 'temp_suspend' | 'indef_suspend' | 'lift' | null>(null);
  actionReason = '';
  tempDurationDays = 7;
  toastMessage = '';
  isToastOpen = false;

  constructor() {
    addIcons({
      personOutline,
      warningOutline,
      banOutline,
      checkmarkCircleOutline,
      timeOutline,
      locationOutline,
      callOutline,
      logoFacebook,
      documentsOutline,
      eyeOutline,
      eyeOffOutline,
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.userId.set(id);
    }
  }

  openAction(action: 'warning' | 'temp_suspend' | 'indef_suspend' | 'lift'): void {
    this.activeAction.set(action);
    this.actionReason = '';
  }

  cancelAction(): void {
    this.activeAction.set(null);
    this.actionReason = '';
  }

  submitWarning(): void {
    const u = this.user();
    if (!u || !this.actionReason.trim()) return;

    this.dataService.issueUserWarning(u.id, this.actionReason.trim());
    this.showToast(`Warning issued to ${u.name}.`);
    this.cancelAction();
  }

  submitTempSuspend(): void {
    const u = this.user();
    if (!u || !this.actionReason.trim()) return;

    this.dataService.suspendUser(u.id, 'temporary', this.tempDurationDays, this.actionReason.trim());
    this.showToast(`Account suspended temporarily for ${this.tempDurationDays} days.`);
    this.cancelAction();
  }

  submitIndefSuspend(): void {
    const u = this.user();
    if (!u || !this.actionReason.trim()) return;

    this.dataService.suspendUser(u.id, 'indefinite', null, this.actionReason.trim());
    this.showToast(`Account suspended indefinitely.`);
    this.cancelAction();
  }

  submitLiftSuspension(): void {
    const u = this.user();
    if (!u || !this.actionReason.trim()) return;

    this.dataService.liftUserSuspension(u.id, this.actionReason.trim());
    this.showToast(`Account suspension lifted for ${u.name}.`);
    this.cancelAction();
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.isToastOpen = true;
  }
}
