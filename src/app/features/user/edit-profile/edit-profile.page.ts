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

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const values = this.profileForm.value;

    this.dataService.updateUserProfile({
      name: values.name || 'User',
      bio: values.bio || '',
      contactPhone: values.contactPhone || '',
      contactFacebook: values.contactFacebook || '',
      available: !!values.available,
    });

    this.feedbackMessage = 'Profile updated successfully!';
    setTimeout(() => {
      this.isSaving = false;
      this.router.navigate(['/user/tabs/profile']);
    }, 1000);
  }

  onCancel(): void {
    this.router.navigate(['/user/tabs/profile']);
  }
}
