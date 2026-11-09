import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  IonCheckbox,
  IonBadge,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  lockClosedOutline,
  mapOutline,
  warningOutline,
  checkmarkOutline,
  trashOutline,
  pauseOutline,
  playOutline,
  mailOutline,
  shieldCheckmarkOutline,
  refreshOutline,
  keyOutline,
  eyeOutline,
  eyeOffOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  serverOutline,
  pulseOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { AuthService } from '../../../core/services/auth.service';
import { PrivateApiService } from '../../../core/services/private-api.service';
import { ApiConfigService } from '../../../core/services/api-config.service';

interface MunicipalityOption {
  label: string;
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-user-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
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
    IonCheckbox,
    IonBadge,
    IonSpinner,
  ],
})
export class SettingsPage implements OnInit {
  readonly dataService = inject(PublicDataService);
  readonly authService = inject(AuthService);
  readonly privateApi = inject(PrivateApiService);
  readonly apiConfig = inject(ApiConfigService);
  private readonly router = inject(Router);

  feedbackMessage = '';
  verificationFeedback = '';
  verificationFeedbackIsError = false;
  isSendingVerification = false;
  isRefreshingVerification = false;

  passwordFeedback = '';
  passwordFeedbackIsError = false;
  isUpdatingPassword = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmNewPassword = false;
  passwordSubmitted = false;

  showDeleteConfirm = false;

  readonly municipalities: MunicipalityOption[] = [
    { label: 'Calapan City (Capital)', lat: 13.4115, lng: 121.1803 },
    { label: 'Naujan Poblacion', lat: 13.3236, lng: 121.3025 },
    { label: 'Victoria Center', lat: 13.1764, lng: 121.2828 },
    { label: 'Puerto Galera', lat: 13.5042, lng: 120.9567 },
    { label: 'Baco Poblacion', lat: 13.3592, lng: 121.0984 },
    { label: 'San Teodoro', lat: 13.4333, lng: 121.0167 },
    { label: 'Pola Center', lat: 13.1333, lng: 121.4333 },
    { label: 'Socorro', lat: 13.0667, lng: 121.4000 },
    { label: 'Pinamalayan', lat: 13.0456, lng: 121.4883 },
    { label: 'Gloria', lat: 12.9833, lng: 121.4667 },
    { label: 'Bansud', lat: 12.8667, lng: 121.4833 },
    { label: 'Bongabong', lat: 12.7500, lng: 121.4833 },
    { label: 'Roxas', lat: 12.5833, lng: 121.5167 },
    { label: 'Mansalay', lat: 12.5208, lng: 121.4389 },
    { label: 'Bulalacao', lat: 12.3256, lng: 121.3436 },
  ];

  settingsForm = new FormGroup({
    showPhone: new FormControl(false),
    showFacebook: new FormControl(true),
    mapConsent: new FormControl(false),
    selectedMunicipality: new FormControl('Calapan City (Capital)'),
  });

  passwordForm = new FormGroup({
    currentPassword: new FormControl('', [Validators.required]),
    newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmNewPassword: new FormControl('', [Validators.required]),
  });

  constructor() {
    addIcons({
      settingsOutline,
      lockClosedOutline,
      mapOutline,
      warningOutline,
      checkmarkOutline,
      trashOutline,
      pauseOutline,
      playOutline,
      mailOutline,
      shieldCheckmarkOutline,
      refreshOutline,
      keyOutline,
      eyeOutline,
      eyeOffOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      serverOutline,
      pulseOutline,
    });
  }

  ngOnInit(): void {
    const user = this.dataService.currentUser();
    if (user) {
      this.settingsForm.patchValue({
        showPhone: user.showPhone,
        showFacebook: user.showFacebook,
        mapConsent: user.mapConsent,
        selectedMunicipality: user.approxLocation?.label || 'Calapan City (Capital)',
      });
    }

    // Automatically run initial API diagnostic on open
    void this.onRunApiDiagnostic();
  }

  get passwordsMismatch(): boolean {
    const np = this.passwordForm.get('newPassword')?.value || '';
    const cp = this.passwordForm.get('confirmNewPassword')?.value || '';
    return np.length > 0 && cp.length > 0 && np !== cp;
  }

  async onRunApiDiagnostic(): Promise<void> {
    await this.privateApi.runAuthIntegrationDiagnostic();
  }

  async onResendVerification(): Promise<void> {
    this.verificationFeedback = '';
    this.verificationFeedbackIsError = false;
    this.isSendingVerification = true;

    const result = await this.authService.sendVerificationEmail();
    this.isSendingVerification = false;
    this.verificationFeedback = result.message;
    this.verificationFeedbackIsError = !result.success;
  }

  async onRefreshVerification(): Promise<void> {
    this.verificationFeedback = '';
    this.verificationFeedbackIsError = false;
    this.isRefreshingVerification = true;

    const result = await this.authService.reloadCurrentUser();
    this.isRefreshingVerification = false;
    this.verificationFeedback = result.message;
    this.verificationFeedbackIsError = !result.success;
  }

  async onUpdatePassword(): Promise<void> {
    this.passwordSubmitted = true;
    this.passwordFeedback = '';
    this.passwordFeedbackIsError = false;

    if (this.passwordForm.invalid || this.passwordsMismatch) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const currentPassword = this.passwordForm.get('currentPassword')?.value || '';
    const newPassword = this.passwordForm.get('newPassword')?.value || '';

    this.isUpdatingPassword = true;
    const result = await this.authService.updateUserPassword(currentPassword, newPassword);
    this.isUpdatingPassword = false;

    this.passwordFeedback = result.message;
    this.passwordFeedbackIsError = !result.success;

    if (result.success) {
      this.passwordForm.reset();
      this.passwordSubmitted = false;
    }
  }

  onSaveSettings(): void {
    const values = this.settingsForm.value;
    const selectedMun =
      this.municipalities.find(m => m.label === values.selectedMunicipality) ||
      this.municipalities[0];

    this.dataService.updateUserSettings({
      showPhone: !!values.showPhone,
      showFacebook: !!values.showFacebook,
      mapConsent: !!values.mapConsent,
      approxLocation: {
        lat: selectedMun.lat,
        lng: selectedMun.lng,
        label: selectedMun.label,
      },
    });

    this.showToast('Privacy and Map settings saved locally for your user profile!');
  }

  onToggleDeactivation(): void {
    const user = this.dataService.currentUser();
    if (user?.state === 'deactivated') {
      this.dataService.reactivateAccount();
      this.showToast('Local profile state reactivated.');
    } else {
      this.dataService.deactivateAccount();
      this.showToast('Local profile state deactivated. Your local profile and posts are hidden.');
    }
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  executeDelete(): void {
    this.dataService.deleteAccountSimulated();
    this.showDeleteConfirm = false;
    this.showToast('Local demo activity reset for your account. Redirecting to Public Side...');
    setTimeout(() => {
      this.router.navigate(['/tabs/home']);
    }, 1500);
  }

  private showToast(msg: string): void {
    this.feedbackMessage = msg;
    setTimeout(() => {
      this.feedbackMessage = '';
    }, 3200);
  }
}
