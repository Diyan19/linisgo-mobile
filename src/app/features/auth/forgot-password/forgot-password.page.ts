import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonCardContent,
  IonInput,
  IonButton,
  IonSpinner,
} from '@ionic/angular/standalone';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
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
    IonCardContent,
    IonInput,
    IonButton,
    IonSpinner,
  ],
})
export class ForgotPasswordPage {
  readonly authService = inject(AuthService);

  email = '';
  isSubmitting = false;
  feedback = '';
  feedbackType: 'error' | 'success' | 'info' = 'info';

  private isValidEmail(email: string): boolean {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  }

  async onReset(): Promise<void> {
    this.feedback = '';
    const cleanEmail = this.email.trim();

    if (!cleanEmail) {
      this.feedbackType = 'error';
      this.feedback = 'Please enter your email address.';
      return;
    }

    if (!this.isValidEmail(cleanEmail)) {
      this.feedbackType = 'error';
      this.feedback = 'Please enter a valid email address format (e.g., name@example.com).';
      return;
    }

    this.isSubmitting = true;
    const result = await this.authService.requestPasswordReset(cleanEmail);
    this.isSubmitting = false;

    this.feedbackType = result.success ? 'success' : 'error';
    this.feedback = result.message;
  }
}
