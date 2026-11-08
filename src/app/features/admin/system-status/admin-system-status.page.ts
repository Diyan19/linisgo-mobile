import { Component } from '@angular/core';
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
} from 'ionicons/icons';

interface ServiceStatusItem {
  name: string;
  category: string;
  status: 'Operational' | 'Disconnected / Pending' | 'Conceptual / Demo';
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
  ],
})
export class AdminSystemStatusPage {
  readonly services: ServiceStatusItem[] = [
    {
      name: 'Ionic Angular Standalone Frontend',
      category: 'Client Application',
      status: 'Operational',
      stateType: 'connected',
      description: 'Angular Standalone Web Application with Ionic UI Components and zoneless reactive signals.',
      note: 'Host: 0.0.0.0, Port: 3000 (Development Environment)',
    },
    {
      name: 'Local Mock Data Service (Signal Store)',
      category: 'In-Memory & LocalStorage',
      status: 'Operational',
      stateType: 'connected',
      description: 'Shared synchronous Signal store maintaining synchronized mock state across Public, User, and Admin modules.',
      note: 'Key: linisgo_data_v3, persistent across browser sessions',
    },
    {
      name: 'Cloud Firestore (Firebase Spark Free)',
      category: 'Database Tier',
      status: 'Disconnected / Pending',
      stateType: 'disconnected',
      description: 'Firestore persistence and security rules for real-time document storage.',
      note: 'Pending authorized Task 1 implementation. Not yet connected.',
    },
    {
      name: 'Private Node.js REST API Backend',
      category: 'Backend Tier',
      status: 'Disconnected / Pending',
      stateType: 'disconnected',
      description: 'Express.js backend with Firebase Admin SDK for trusted server-authoritative operations and role claims.',
      note: 'Pending authorized backend task. Not yet deployed.',
    },
    {
      name: 'External Image Hosting (Cloudinary Free)',
      category: 'Media Storage',
      status: 'Disconnected / Pending',
      stateType: 'disconnected',
      description: 'Server-signed direct image uploads for post photos and identity verification documents.',
      note: 'Pending authorized media task. Local mock URLs used currently.',
    },
    {
      name: 'Leaflet & OpenStreetMap Engine',
      category: 'Mapping Engine',
      status: 'Conceptual / Demo',
      stateType: 'demo',
      description: 'OpenStreetMap-compatible coordinates canvas for Oriental Mindoro municipal service discovery.',
      note: 'Functional client demo canvas with GPS permission prompts and pin filters.',
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
    });
  }
}
