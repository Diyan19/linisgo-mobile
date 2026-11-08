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
  IonIcon,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  listOutline,
  searchOutline,
  timeOutline,
  shieldCheckmarkOutline,
  personOutline,
  documentsOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { AuditLog } from '../../../shared/models/audit.model';

@Component({
  selector: 'app-admin-audit-logs',
  templateUrl: './admin-audit-logs.page.html',
  styleUrls: ['./admin-audit-logs.page.scss'],
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
    IonIcon,
    IonBadge,
  ],
})
export class AdminAuditLogsPage {
  readonly dataService = inject(PublicDataService);

  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | 'warning' | 'suspension' | 'post' | 'report' | 'appeal'>('all');

  readonly filteredLogs = computed<AuditLog[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.selectedFilter();
    const all = this.dataService.auditLogsSignal();

    return all.filter(l => {
      if (filter === 'warning' && !l.actionType.includes('Warning')) return false;
      if (filter === 'suspension' && !l.actionType.includes('Suspension')) return false;
      if (filter === 'post' && !l.actionType.includes('Post')) return false;
      if (filter === 'report' && !l.actionType.includes('Report')) return false;
      if (filter === 'appeal' && !l.actionType.includes('Appeal')) return false;

      if (query) {
        const matchAction = l.actionType.toLowerCase().includes(query);
        const matchTarget = l.targetId.toLowerCase().includes(query) || (l.targetName?.toLowerCase().includes(query) ?? false);
        const matchReason = l.reason.toLowerCase().includes(query);
        const matchResult = l.result.toLowerCase().includes(query);
        if (!matchAction && !matchTarget && !matchReason && !matchResult) return false;
      }
      return true;
    });
  });

  constructor() {
    addIcons({
      listOutline,
      searchOutline,
      timeOutline,
      shieldCheckmarkOutline,
      personOutline,
      documentsOutline,
    });
  }

  onSearch(event: any): void {
    this.searchQuery.set(event.detail.value || '');
  }

  onFilterChange(event: any): void {
    this.selectedFilter.set(event.detail.value || 'all');
  }
}
