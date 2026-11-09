import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonBadge,
  IonToast,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  closeOutline,
  closeCircleOutline,
  documentTextOutline,
  imageOutline,
  locationOutline,
  mapOutline,
  shieldCheckmarkOutline,
  trashOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCategory, PostStatus, PostType } from '../../../shared/models/post.model';
import {
  ORIENTAL_MINDORO_LOCATIONS,
  OrientalMindoroLocation,
  getLocationById,
  getLocationName,
  validatePostLocationForPublish,
} from '../../../shared/models/location.model';

@Component({
  selector: 'app-user-create-post',
  templateUrl: './create-post.page.html',
  styleUrls: ['./create-post.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonButton,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonIcon,
    IonBadge,
    IonToast,
  ],
})
export class CreatePostPage implements OnInit {
  private readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly locations: readonly OrientalMindoroLocation[] = ORIENTAL_MINDORO_LOCATIONS;

  editId: string | null = null;
  editingExistingStatus: PostStatus | null = null;
  postType: PostType = 'request';
  title = '';
  category: PostCategory = 'General';
  description = '';
  amount: number | null = null;

  targetLocationId: string | null = null;
  coverageAreaIds: string[] = [];
  selectedBarangay = '';
  optionalPublicAreaDescription = '';

  photoFileName = '';
  errorMessage = '';
  toastMessage = '';
  isToastOpen = false;
  isSubmitting = false;

  constructor() {
    addIcons({
      checkmarkCircleOutline,
      closeOutline,
      closeCircleOutline,
      documentTextOutline,
      imageOutline,
      locationOutline,
      mapOutline,
      shieldCheckmarkOutline,
      trashOutline,
    });
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.editId = params['editId'] || null;
      if (this.editId) {
        const post = this.dataService.getPostById(this.editId);
        if (post && post.authorId === this.dataService.activeActorId()) {
          this.editingExistingStatus = post.status;
          this.postType = post.type;
          this.title = post.title;
          this.category = post.category;
          this.description = post.description;
          this.amount = post.amount ?? null;
          this.targetLocationId = post.targetLocationId ?? null;
          this.coverageAreaIds = Array.isArray(post.coverageAreaIds) ? [...post.coverageAreaIds] : [];
          this.optionalPublicAreaDescription = post.optionalPublicAreaDescription || '';
          this.selectedBarangay = '';
        } else if (post && post.authorId !== this.dataService.activeActorId()) {
          this.errorMessage = 'You can only edit posts that belong to your account.';
          this.editId = null;
        }
      } else {
        this.editingExistingStatus = null;
      }
    });
  }

  setType(type: PostType): void {
    this.postType = type;
    this.errorMessage = '';
  }

  get availableBarangays(): string[] {
    if (this.postType === 'request' && this.targetLocationId) {
      return getLocationById(this.targetLocationId)?.sampleBarangays || [];
    }
    if (this.postType === 'offer' && this.coverageAreaIds.length === 1) {
      return getLocationById(this.coverageAreaIds[0])?.sampleBarangays || [];
    }
    return [];
  }

  onTargetLocationChange(locId: string | null): void {
    this.targetLocationId = locId || null;
    this.selectedBarangay = '';
    this.errorMessage = '';
  }

  onBarangaySelect(brgy: string): void {
    this.selectedBarangay = brgy || '';
    if (brgy) {
      const currentDesc = this.optionalPublicAreaDescription.trim();
      const prefix = `Brgy. ${brgy}`;
      if (!currentDesc) {
        this.optionalPublicAreaDescription = prefix;
      } else if (!currentDesc.toLowerCase().includes(brgy.toLowerCase())) {
        this.optionalPublicAreaDescription = `${prefix} — ${currentDesc}`;
      }
    }
  }

  isCoverageSelected(locId: string): boolean {
    return this.coverageAreaIds.includes(locId);
  }

  toggleCoverageArea(locId: string): void {
    if (this.coverageAreaIds.includes(locId)) {
      this.coverageAreaIds = this.coverageAreaIds.filter(id => id !== locId);
    } else {
      this.coverageAreaIds = [...this.coverageAreaIds, locId];
    }
    this.errorMessage = '';
  }

  removeCoverageArea(locId: string): void {
    this.coverageAreaIds = this.coverageAreaIds.filter(id => id !== locId);
  }

  clearCoverageSelections(): void {
    this.coverageAreaIds = [];
    this.selectedBarangay = '';
  }

  selectAllDistrict(district: 1 | 2): void {
    const districtIds = this.locations.filter(l => l.district === district).map(l => l.id);
    const merged = new Set([...this.coverageAreaIds, ...districtIds]);
    this.coverageAreaIds = Array.from(merged);
    this.errorMessage = '';
  }

  selectAllOrientalMindoro(): void {
    this.coverageAreaIds = this.locations.map(l => l.id);
    this.errorMessage = '';
  }

  getLocationLabel(locId: string): string {
    return getLocationName(locId);
  }

  onPhotoSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.photoFileName = file.name;
    }
  }

  readonly isSuspended = () => this.dataService.currentUser()?.state === 'suspended';

  async onPublish(): Promise<void> {
    if (this.isSubmitting) return;

    if (this.isSuspended()) {
      this.errorMessage = 'Your account is suspended. Publishing posts is restricted. Please submit an appeal.';
      return;
    }

    if (!this.title.trim() || !this.description.trim()) {
      this.errorMessage = 'Please provide both a post title and description before publishing.';
      return;
    }

    const locValidation = validatePostLocationForPublish({
      type: this.postType,
      targetLocationId: this.targetLocationId,
      coverageAreaIds: this.coverageAreaIds,
    });

    if (!locValidation.valid) {
      this.errorMessage = locValidation.error || 'Please complete the required location coverage selection.';
      return;
    }

    const cleanOptionalDesc = this.optionalPublicAreaDescription.trim() || null;
    const nextStatus: PostStatus =
      this.editId && this.editingExistingStatus && this.editingExistingStatus !== 'draft'
        ? this.editingExistingStatus
        : this.postType === 'request'
        ? 'open'
        : 'active';

    this.isSubmitting = true;
    this.errorMessage = '';

    const result = await this.dataService.savePostAsync({
      id: this.editId,
      type: this.postType,
      title: this.title.trim(),
      description: this.description.trim(),
      category: this.category,
      amount: this.amount,
      status: nextStatus,
      targetLocationId: this.postType === 'request' ? this.targetLocationId : null,
      coverageAreaIds: this.postType === 'offer' ? [...this.coverageAreaIds] : [],
      optionalPublicAreaDescription: cleanOptionalDesc,
    });

    this.isSubmitting = false;

    if (!result.persisted) {
      this.errorMessage =
        result.error ||
        'Could not publish post to Cloud Firestore. Ensure the updated firestore.rules are published in the Firebase Console.';
      return;
    }

    this.resetForm();
    this.router.navigate(['/user/my-posts']);
  }

  async onSaveDraft(): Promise<void> {
    if (this.isSubmitting) return;

    if (this.isSuspended()) {
      this.errorMessage = 'Your account is suspended. Saving drafts is restricted.';
      return;
    }

    if (!this.title.trim()) {
      this.errorMessage = 'Title is required to save a draft.';
      return;
    }

    const cleanOptionalDesc = this.optionalPublicAreaDescription.trim() || null;

    this.isSubmitting = true;
    this.errorMessage = '';

    const result = await this.dataService.savePostAsync({
      id: this.editId,
      type: this.postType,
      title: this.title.trim(),
      description: this.description.trim() || 'Draft description...',
      category: this.category,
      amount: this.amount,
      status: 'draft',
      targetLocationId: this.postType === 'request' ? this.targetLocationId : null,
      coverageAreaIds: this.postType === 'offer' ? [...this.coverageAreaIds] : [],
      optionalPublicAreaDescription: cleanOptionalDesc,
    });

    this.isSubmitting = false;

    if (!result.persisted) {
      this.errorMessage =
        result.error ||
        'Could not save draft to Cloud Firestore. Ensure the updated firestore.rules are published in the Firebase Console.';
      return;
    }

    this.resetForm();
    this.router.navigate(['/user/my-posts']);
  }

  onCancel(): void {
    this.resetForm();
    this.router.navigate(['/user/tabs/home']);
  }

  private resetForm(): void {
    this.editId = null;
    this.editingExistingStatus = null;
    this.postType = 'request';
    this.title = '';
    this.category = 'General';
    this.description = '';
    this.amount = null;
    this.targetLocationId = null;
    this.coverageAreaIds = [];
    this.selectedBarangay = '';
    this.optionalPublicAreaDescription = '';
    this.photoFileName = '';
    this.errorMessage = '';
  }
}
