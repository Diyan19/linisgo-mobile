import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { flagOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { ReportReason } from '../../../shared/models/report.model';

@Component({
  selector: 'app-user-report-form',
  templateUrl: './report-form.page.html',
  styleUrls: ['./report-form.page.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
  ],
})
export class ReportFormPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly dataService = inject(PublicDataService);

  targetName = '';
  feedbackMessage = '';
  isSubmitting = false;

  readonly reasonOptions: ReportReason[] = [
    'Inappropriate content',
    'Suspicious activity',
    'Spam',
    'Misleading details',
    'Privacy violation',
    'Other',
  ];

  reportForm = new FormGroup({
    targetType: new FormControl<'post' | 'user'>('post', [Validators.required]),
    targetId: new FormControl('', [Validators.required]),
    reason: new FormControl<ReportReason>('Inappropriate content', [Validators.required]),
    explanation: new FormControl('', [Validators.required, Validators.minLength(10)]),
  });

  constructor() {
    addIcons({
      flagOutline,
      checkmarkOutline,
      closeOutline,
    });
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParams;
    if (qp['type'] === 'user' || qp['type'] === 'post') {
      this.reportForm.patchValue({
        targetType: qp['type'],
        targetId: qp['id'] || '',
      });

      if (qp['type'] === 'post' && qp['id']) {
        const post = this.dataService.getPostById(qp['id']);
        if (post) this.targetName = `Post: "${post.title}"`;
      } else if (qp['type'] === 'user' && qp['id']) {
        const user = this.dataService.getUserById(qp['id']);
        if (user) this.targetName = `User: ${user.name}`;
      }
    }
  }

  onSubmit(): void {
    if (this.reportForm.invalid) {
      this.reportForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const val = this.reportForm.value;

    this.dataService.submitReport({
      targetType: val.targetType || 'post',
      targetId: val.targetId || 'unknown',
      reason: val.reason || 'Other',
      explanation: val.explanation || '',
    });

    this.feedbackMessage = 'Report successfully submitted. Thank you for helping keep our community safe.';
    setTimeout(() => {
      this.isSubmitting = false;
      this.router.navigate(['/user/my-reports']);
    }, 1200);
  }

  onCancel(): void {
    this.router.navigate(['/user/tabs/feed']);
  }
}
