import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonCard,
  IonCardContent,
  IonButton,
  IonIcon,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  ribbonOutline,
  searchOutline,
  personOutline,
  documentsOutline,
  chevronForwardOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  timeOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { AppealStatus } from '../../../shared/models/report.model';

@Component({
  selector: 'app-admin-appeals',
  templateUrl: './admin-appeals.page.html',
  styleUrls: ['./admin-appeals.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonCard,
    IonCardContent,
    IonButton,
    IonIcon,
    IonBadge,
  ],
})
export class AdminAppealsPage {
  readonly dataService = inject(PublicDataService);

  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | AppealStatus>('all');

  readonly filteredAppeals = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.selectedFilter();
    const all = this.dataService.appealsSignal();

    return all.filter(a => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (query) {
        const matchExp = a.explanation.toLowerCase().includes(query);
        const matchAppellant = a.appellantId.toLowerCase().includes(query);
        const matchTarget = a.targetId.toLowerCase().includes(query);
        if (!matchExp && !matchAppellant && !matchTarget) return false;
      }
      return true;
    });
  });

  constructor() {
    addIcons({
      ribbonOutline,
      searchOutline,
      personOutline,
      documentsOutline,
      chevronForwardOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      timeOutline,
    });
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.detail.value || '');
  }

  onFilterChange(event: any): void {
    this.selectedFilter.set(event.detail.value || 'all');
  }
}
