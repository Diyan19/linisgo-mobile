import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  IonIcon,
  IonBadge,
  IonButton,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  hardwareChipOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  alertCircleOutline,
  serverOutline,
  logoFirebase,
  imageOutline,
  mapOutline,
  cubeOutline,
  pulseOutline,
} from 'ionicons/icons';
import { PrivateApiService } from '../../../core/services/private-api.service';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { AuthService } from '../../../core/services/auth.service';

interface ServiceStatusItem {
  name: string;
  category: string;
  status: 'Operational' | 'Disconnected / Pending' | 'Blocked (Missing Server Credentials)';
  stateType: 'connected' | 'disconnected' | 'demo';
  description: string;
  note: string;
}

@Component({
  selector: 'app-admin-system-status',
  templateUrl: './admin-system-status.page.html',
  styleUrls: ['./admin-system-status.page.scss'],
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
    IonIcon,
    IonBadge,
    IonButton,
    IonSpinner,
  ],
})
export class AdminSystemStatusPage implements OnInit {
  readonly privateApi = inject(PrivateApiService);
  readonly apiConfig = inject(ApiConfigService);
  readonly authService = inject(AuthService);

  readonly services: ServiceStatusItem[] = [
    {
      name: 'Ionic Angular Standalone Frontend',
      category: 'Client Application',
      status: 'Operational',
      stateType: 'connected',
      description:
        'Angular Standalone Web Application with Ionic UI Components, zoneless signals, and functional HTTP token interceptor.',
      note: 'Host: 0.0.0.0, Port: 3000 (Proxies /api -> http://127.0.0.1:3001/api)',
    },
    {
      name: 'Private Node.js + Express REST API (Task 1.1)',
      category: 'Backend Tier (api/)',
      status: 'Operational',
      stateType: 'connected',
      description:
        'Standalone Node.js + Express + TypeScript server with Helmet security headers, restricted CORS (AI Studio .run.app + localhost:3000), rate limiting (900000ms / 100 req), GET /api/health, and GET /api/auth/me.',
      note: 'API_HOST: 0.0.0.0 · API_PORT: 3001 · FIREBASE_PROJECT_ID: linisgo-mobile',
    },
    {
      name: 'Firebase Authentication Client (linisgo-mobile)',
      category: 'Identity & Auth Tier (Task 1.0)',
      status: 'Operational',
      stateType: 'connected',
      description:
        'Official Firebase Modular JS SDK (firebase/app, firebase/auth) connected to project linisgo-mobile (Email/Password provider, Spark FREE plan).',
      note: 'Project ID: linisgo-mobile · Auth Domain: linisgo-mobile.firebaseapp.com · App ID: 1:932812492190:web:20c4c8982f8c6adfa5da8f',
    },
    {
      name: 'Firebase Admin SDK Server Credentials (linisgo-mobile)',
      category: 'Server Token Revocation & Admin Claims Tier (Task 1.1)',
      status: 'Blocked (Missing Server Credentials)',
      stateType: 'demo',
      description:
        'Backend Firebase Admin SDK rejects missing/invalid/expired tokens with HTTP 401; live server-credential revocation & custom-claim checks require ADC or GOOGLE_APPLICATION_CREDENTIALS outside AI Studio.',
      note: 'Never reuses exposed keys. Reports HTTP 503 when server credentials are unconfigured.',
    },
    {
      name: 'Local Mock Data Service (Signal Store)',
      category: 'In-Memory & LocalStorage',
      status: 'Operational',
      stateType: 'connected',
      description:
        'Shared synchronous Signal store maintaining sample posts/users while isolating real Firebase UIDs from mock IDs ("demo", "ana", "ben", "mira", "carlos").',
      note: 'Key: linisgo_data_v3, persistent across browser sessions until Task 1.2 Firestore migration',
    },
    {
      name: 'Cloud Firestore (Firebase Spark Free)',
      category: 'Database Tier',
      status: 'Disconnected / Pending',
      stateType: 'disconnected',
      description: 'Firestore persistence and security rules for real-time document storage.',
      note: 'Pending authorized Task 1.2 implementation. Not yet connected for writes.',
    },
    {
      name: 'External Image Hosting (Cloudinary Free)',
      category: 'Media Storage',
      status: 'Disconnected / Pending',
      stateType: 'disconnected',
      description:
        'Server-signed direct image uploads for post photos and identity verification documents.',
      note: 'Pending authorized media task. Local mock URLs used currently.',
    },
    {
      name: 'Leaflet & OpenStreetMap Engine',
      category: 'Mapping Engine',
      status: 'Operational',
      stateType: 'connected',
      description:
        'Interactive Leaflet map with OpenStreetMap tile attribution for Oriental Mindoro municipal post coverage and opt-in user area discovery.',
      note: 'All 15 Oriental Mindoro municipalities supported; privacy-safe area markers enabled.',
    },
  ];

  constructor() {
    addIcons({
      hardwareChipOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      alertCircleOutline,
      serverOutline,
      logoFirebase,
      imageOutline,
      mapOutline,
      cubeOutline,
      pulseOutline,
    });
  }

  ngOnInit(): void {
    void this.privateApi.runAuthIntegrationDiagnostic(false);
  }

  async runLiveDiagnostic(): Promise<void> {
    await this.privateApi.runAuthIntegrationDiagnostic(false);
  }
}
