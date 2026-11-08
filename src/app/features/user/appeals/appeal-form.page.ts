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
import { scaleOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-user-appeal-form',
  templateUrl: './appeal-form.page.html',
  styleUrls: ['./appeal-form.page.scss'],
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
export class AppealFormPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly dataService = inject(PublicDataService);

  feedbackMessage = '';
  isSubmitting = false;

  appealForm = new FormGroup({
    targetType: new FormControl<'post' | 'account'>('post', [Validators.required]),
    targetId: new FormControl('', [Validators.required]),
    explanation: new FormControl('', [Validators.required, Validators.minLength(10)]),
  });

  constructor() {
    addIcons({
      scaleOutline,
      checkmarkOutline,
      closeOutline,
    });
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParams;
    if (qp['type'] === 'post' || qp['type'] === 'account') {
      this.appealForm.patchValue({
        targetType: qp['type'],
        targetId: qp['id'] || '',
      });
    }
  }

  onSubmit(): void {
    if (this.appealForm.invalid) {
      this.appealForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const val = this.appealForm.value;

    this.dataService.submitAppeal({
      targetType: val.targetType || 'post',
      targetId: val.targetId || 'my-account',
      explanation: val.explanation || '',
    });

    this.feedbackMessage = 'Appeal submitted successfully. Our administrative team will review your request.';
    setTimeout(() => {
      this.isSubmitting = false;
      this.router.navigate(['/user/my-appeals']);
    }, 1200);
  }

  onCancel(): void {
    this.router.navigate(['/user/my-appeals']);
  }
}
