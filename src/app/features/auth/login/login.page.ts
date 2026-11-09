import { Component, inject, isDevMode, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
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
  arrowBackOutline,
  logInOutline,
  personAddOutline,
  helpCircleOutline,
  eyeOutline,
  eyeOffOutline,
  shieldCheckmarkOutline,
  keyOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  constructOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-auth-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
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
export class LoginPage implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly authService = inject(AuthService);

  email = '';
  password = '';
  showPassword = false;
  isSubmitting = false;

  feedbackMessage = '';
  feedbackType: 'error' | 'success' | 'info' = 'info';

  // Runtime Firebase Web SDK API key input (for linisgo-mobile)
  showConfigEditor = false;
  firebaseConfigInput = '';
  configFeedback = '';

  // Development-Only Admin UI Sandbox toggle
  readonly isDevelopmentMode = isDevMode();
  showDevAdminSandbox = false;
  returnUrl = '/user/tabs/home';

  constructor() {
    addIcons({
      arrowBackOutline,
      logInOutline,
      personAddOutline,
      helpCircleOutline,
      eyeOutline,
      eyeOffOutline,
      shieldCheckmarkOutline,
      keyOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      constructOutline,
    });
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['returnUrl'] && String(params['returnUrl']).startsWith('/user')) {
        this.returnUrl = params['returnUrl'];
      }
      if (params['adminRestricted'] === '1') {
        this.feedbackType = 'info';
        this.feedbackMessage =
          'Real Administrator access is restricted until verified backend custom claims are implemented in Task 1.1.';
      }
    });
  }

  get projectSummary() {
    return this.authService.getActiveFirebaseProjectSummary();
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
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
      this.feedbackMessage = res.message;
    } else {
      this.feedbackType = 'error';
    }
  }

  async onSignIn(): Promise<void> {
    this.feedbackMessage = '';
    const cleanEmail = this.email.trim();

    if (!cleanEmail) {
      this.feedbackType = 'error';
      this.feedbackMessage = 'Please enter your email address.';
      return;
    }

    if (!this.isValidEmail(cleanEmail)) {
      this.feedbackType = 'error';
      this.feedbackMessage = 'Please enter a valid email address format (e.g., name@example.com).';
      return;
    }

    if (!this.password) {
      this.feedbackType = 'error';
      this.feedbackMessage = 'Please enter your password.';
      return;
    }

    if (this.password.length < 6) {
      this.feedbackType = 'error';
      this.feedbackMessage = 'Password must be at least 6 characters long.';
      return;
    }

    // Explicitly block hardcoded production bypasses for legacy fictional demo credentials
    if (cleanEmail.toLowerCase() === 'admin@linisgo.demo') {
      this.feedbackType = 'error';
      this.feedbackMessage =
        'Fictional demo administrator credentials are not accepted as real Firebase Authentication. Real Admin access requires backend custom-claim verification (Task 1.1).';
      return;
    }

    this.isSubmitting = true;
    const result = await this.authService.signInWithEmail(cleanEmail, this.password);
    this.isSubmitting = false;

    if (result.success) {
      this.feedbackType = 'success';
      this.feedbackMessage = result.message;
      await this.router.navigateByUrl(this.returnUrl);
    } else {
      this.feedbackType = 'error';
      this.feedbackMessage = result.message;
    }
  }

  launchDevOnlyAdminSandbox(): void {
    this.authService.enterDevOnlyAdminUiSandbox();
  }

  continueAsGuest(): void {
    this.router.navigate(['/tabs/home']);
  }
}
