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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  closeOutline,
  documentTextOutline,
  imageOutline,
} from 'ionicons/icons';
import { PublicDataService } from '../../../core/services/public-data.service';
import { PostCategory, PostType } from '../../../shared/models/post.model';

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
  ],
})
export class CreatePostPage implements OnInit {
  private readonly dataService = inject(PublicDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  editId: string | null = null;
  postType: PostType = 'request';
  title = '';
  category: PostCategory = 'General';
  description = '';
  amount: number | null = null;
  photoFileName = '';
  errorMessage = '';

  constructor() {
    addIcons({
      checkmarkCircleOutline,
      closeOutline,
      documentTextOutline,
      imageOutline,
    });
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.editId = params['editId'] || null;
      if (this.editId) {
        const post = this.dataService.getPostById(this.editId);
        if (post && post.authorId === 'demo') {
          this.postType = post.type;
          this.title = post.title;
          this.category = post.category;
          this.description = post.description;
          this.amount = post.amount || null;
        }
      }
    });
  }

  setType(type: PostType): void {
    this.postType = type;
  }

  onPhotoSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.photoFileName = file.name;
    }
  }

  readonly isSuspended = () => this.dataService.currentUser()?.state === 'suspended';

  onPublish(): void {
    if (this.isSuspended()) {
      this.errorMessage = 'Your account is suspended. Publishing posts is restricted. Please submit an appeal.';
      return;
    }

    if (!this.title.trim() || !this.description.trim()) {
      this.errorMessage = 'Please provide both a post title and description.';
      return;
    }

    if (this.editId) {
      this.dataService.updatePost(this.editId, {
        type: this.postType,
        title: this.title.trim(),
        description: this.description.trim(),
        category: this.category,
        amount: this.amount,
      });
    } else {
      this.dataService.createPost({
        type: this.postType,
        title: this.title.trim(),
        description: this.description.trim(),
        category: this.category,
        amount: this.amount,
        status: this.postType === 'request' ? 'open' : 'active',
      });
    }

    this.resetForm();
    this.router.navigate(['/user/my-posts']);
  }

  onSaveDraft(): void {
    if (this.isSuspended()) {
      this.errorMessage = 'Your account is suspended. Saving drafts is restricted.';
      return;
    }

    if (!this.title.trim()) {
      this.errorMessage = 'Title is required to save a draft.';
      return;
    }

    this.dataService.createPost({
      type: this.postType,
      title: this.title.trim(),
      description: this.description.trim() || 'Draft description...',
      category: this.category,
      amount: this.amount,
      status: 'draft',
    });

    this.resetForm();
    this.router.navigate(['/user/my-posts']);
  }

  onCancel(): void {
    this.resetForm();
    this.router.navigate(['/user/tabs/home']);
  }

  private resetForm(): void {
    this.editId = null;
    this.postType = 'request';
    this.title = '';
    this.category = 'General';
    this.description = '';
    this.amount = null;
    this.photoFileName = '';
    this.errorMessage = '';
  }
}
