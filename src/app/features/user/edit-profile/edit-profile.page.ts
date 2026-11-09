import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
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
  IonToggle,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';

@Component({
  selector: 'app-user-edit-profile',
  templateUrl: './edit-profile.page.html',
  styleUrls: ['./edit-profile.page.scss'],
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
    IonToggle,
  ],
})
export class EditProfilePage implements OnInit {
  readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);

  feedbackMessage = '';
  errorMessage = '';
  isSaving = false;

  profileForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(2)]),
    bio: new FormControl(''),
    contactPhone: new FormControl(''),
    contactFacebook: new FormControl(''),
    available: new FormControl(true),
  });

  constructor() {
    addIcons({
      checkmarkOutline,
      closeOutline,
    });
  }

  ngOnInit(): void {
    const user = this.dataService.currentUser();
    if (user) {
      this.profileForm.patchValue({
        name: user.name,
        bio: user.bio,
        contactPhone: user.contactPhone || '',
        contactFacebook: user.contactFacebook || '',
        available: user.available,
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.feedbackMessage = '';
    this.errorMessage = '';
    const values = this.profileForm.value;

    const result = await this.dataService.saveUserProfileAsync({
      name: values.name || 'User',
      bio: values.bio || '',
      contactPhone: values.contactPhone || '',
      contactFacebook: values.contactFacebook || '',
      available: !!values.available,
    });

    this.isSaving = false;

    if (!result.persisted) {
      this.errorMessage =
        result.error ||
        'Could not save profile to Cloud Firestore. Ensure the updated firestore.rules are published in the Firebase Console.';
      this.feedbackMessage = this.errorMessage;
      return;
    }

    this.feedbackMessage = 'Profile saved to Cloud Firestore!';
    setTimeout(() => {
      this.router.navigate(['/user/tabs/profile']);
    }, 800);
  }

  onCancel(): void {
    this.router.navigate(['/user/tabs/profile']);
  }
}
