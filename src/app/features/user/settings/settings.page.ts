import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
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
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';

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
  ],
})
export class SettingsPage implements OnInit {
  readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);

  feedbackMessage = '';
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
  ];

  settingsForm = new FormGroup({
    showPhone: new FormControl(false),
    showFacebook: new FormControl(true),
    mapConsent: new FormControl(false),
    selectedMunicipality: new FormControl('Calapan City (Capital)'),
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
  }

  onSaveSettings(): void {
    const values = this.settingsForm.value;
    const selectedMun = this.municipalities.find(m => m.label === values.selectedMunicipality) || this.municipalities[0];

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

    this.showToast('Privacy and Map settings saved successfully!');
  }

  onToggleDeactivation(): void {
    const user = this.dataService.currentUser();
    if (user?.state === 'deactivated') {
      this.dataService.reactivateAccount();
      this.showToast('Your account is now reactivated.');
    } else {
      this.dataService.deactivateAccount();
      this.showToast('Your account is now deactivated. Your profile and posts are hidden.');
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
    this.showToast('Account data reset. Redirecting to Public Side...');
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
