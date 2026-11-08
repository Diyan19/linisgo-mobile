import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonSearchbar,
  IonButton,
  IonBadge,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  navigateOutline,
  personOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { UserProfile, UserProfileTag } from '../../../shared/models/user.model';

@Component({
  selector: 'app-public-map',
  templateUrl: './map.page.html',
  styleUrls: ['./map.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonSearchbar,
    IonButton,
    IonBadge,
    IonIcon,
  ],
})
export class MapPage {
  readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);

  readonly selectedUser = signal<UserProfile | null>(null);

  constructor() {
    addIcons({
      locationOutline,
      navigateOutline,
      personOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
    });
  }

  onSearchChange(event: CustomEvent): void {
    this.dataService.searchQuery.set(event.detail.value ?? '');
  }

  onTagChange(tag: 'all' | UserProfileTag): void {
    this.dataService.selectedTag.set(tag);
  }

  selectPin(user: UserProfile): void {
    this.selectedUser.set(user);
  }

  navigateToProfile(userId: string): void {
    this.router.navigate(['/user-profile', userId]);
  }

  getUserTagLabel(tag: UserProfileTag): string {
    return tag === 'client' ? 'Client' : 'Service Provider';
  }

  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }
}
