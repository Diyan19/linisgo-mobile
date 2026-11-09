import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  IonIcon,
  IonSpinner,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  eyeOutline,
  eyeOffOutline,
  shieldCheckmarkOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
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
    IonIcon,
    IonSpinner,
    IonBadge,
  ],
})
export class RegisterPage {
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  displayName = '';
  email = '';
  password = '';
  confirmPassword = '';

  showPassword = false;
  showConfirmPassword = false;
  isSubmitting = false;

  feedback = '';
  feedbackType: 'error' | 'success' | 'info' = 'info';

  // Runtime Firebase Web SDK API key input (for linisgo-mobile)
  showConfigEditor = false;
  firebaseConfigInput = '';
  configFeedback = '';

  constructor() {
    addIcons({
      eyeOutline,
      eyeOffOutline,
      shieldCheckmarkOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
    });
  }

  get projectSummary() {
    return this.authService.getActiveFirebaseProjectSummary();
  }

  private isValidEmail(email: string): boolean {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  }

  async onApplyFirebaseConfig(): Promise<void> {
    this.configFeedback = '';
    const res = await this.authService.applyRuntimeFirebaseConfig(this.firebaseConfigInput);
    this.configFeedback = res.message;
    if (res.success) {
      this.firebaseConfigInput = '';
      this.showConfigEditor = false;
      this.feedbackType = 'success';
      this.feedback = res.message;
    } else {
      this.feedbackType = 'error';
    }
  }

  async onRegister(): Promise<void> {
    this.feedback = '';
    const cleanName = this.displayName.trim();
    const cleanEmail = this.email.trim();

    if (!cleanName || cleanName.length < 2) {
      this.feedbackType = 'error';
      this.feedback = 'Please enter your display name (at least 2 characters).';
      return;
    }

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

    if (!this.password) {
      this.feedbackType = 'error';
      this.feedback = 'Please enter a password.';
      return;
    }

    if (this.password.length < 6) {
      this.feedbackType = 'error';
      this.feedback = 'Password is too weak. Please enter at least 6 characters.';
      return;
    }

    if (!this.confirmPassword) {
      this.feedbackType = 'error';
      this.feedback = 'Please confirm your password.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.feedbackType = 'error';
      this.feedback = 'Passwords do not match. Please ensure both password fields match.';
      return;
    }

    this.isSubmitting = true;
    const result = await this.authService.registerWithEmail({
      displayName: cleanName,
      email: cleanEmail,
      password: this.password,
    });
    this.isSubmitting = false;

    if (result.success) {
      this.feedbackType = 'success';
      this.feedback = result.message;
      await this.router.navigate(['/user/tabs/home']);
    } else {
      this.feedbackType = 'error';
      this.feedback = result.message;
    }
  }
}
