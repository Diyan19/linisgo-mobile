export type PostType = 'request' | 'offer';
export type PostCategory = 'General' | 'Deep' | 'Kitchen' | 'Bathroom' | 'Laundry' | 'Other';
export type PostStatus = 'open' | 'active' | 'closed' | 'archived' | 'draft';

export interface CleaningPost {
  id: string;
  authorId: string;
  authorName: string;
  authorTag: 'client' | 'provider';
  type: PostType;
  title: string;
  description: string;
  category: PostCategory;
  amount?: number | null;
  photoUrl?: string;
  status: PostStatus;
  /** Structured municipality/city ID for Service Requests */
  targetLocationId: string | null;
  /** Structured municipality/city IDs for Service Offers */
  coverageAreaIds: string[];
  /** Optional public barangay or general area note (never an exact home address) */
  optionalPublicAreaDescription: string | null;
  moderated: boolean;
  moderationReason?: string;
  moderatedAt?: string;
  createdAt: string;
  updatedAt: string;
}
