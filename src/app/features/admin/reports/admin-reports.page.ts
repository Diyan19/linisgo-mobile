import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
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
  shieldOutline,
  searchOutline,
  personOutline,
  documentsOutline,
  timeOutline,
  chevronForwardOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { ReportStatus } from '../../../shared/models/report.model';

@Component({
  selector: 'app-admin-reports',
  templateUrl: './admin-reports.page.html',
  styleUrls: ['./admin-reports.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
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
export class AdminReportsPage {
  readonly dataService = inject(PublicDataService);

  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | ReportStatus>('all');

  readonly filteredReports = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.selectedFilter();
    const all = this.dataService.reportsSignal();

    return all.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (query) {
        const matchReason = r.reason.toLowerCase().includes(query);
        const matchExp = r.explanation.toLowerCase().includes(query);
        const matchTarget = r.targetId.toLowerCase().includes(query);
        const matchReporter = r.reporterId.toLowerCase().includes(query);
        if (!matchReason && !matchExp && !matchTarget && !matchReporter) return false;
      }
      return true;
    });
  });

  constructor() {
    addIcons({
      shieldOutline,
      searchOutline,
      personOutline,
      documentsOutline,
      timeOutline,
      chevronForwardOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
    });
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.detail.value || '');
  }

  onFilterChange(event: any): void {
    this.selectedFilter.set(event.detail.value || 'all');
  }
}
