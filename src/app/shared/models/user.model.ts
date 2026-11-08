export type UserProfileTag = 'client' | 'provider';
export type UserAccountState = 'active' | 'deactivated' | 'suspended' | 'deleted';
export type SuspensionType = 'temporary' | 'indefinite';

export interface UserProfile {
  id: string;
  name: string;
  tag: UserProfileTag;
  bio: string;
  contactPhone?: string;
  contactFacebook?: string;
  showPhone: boolean;
  showFacebook: boolean;
  mapConsent: boolean;
  approxLocation?: {
    lat: number;
    lng: number;
    label?: string;
  };
  available: boolean;
  state: UserAccountState;
  suspendedUntil?: string | null;
  suspensionType?: SuspensionType | null;
  suspensionReason?: string | null;
  warningCount?: number;
  lastWarningReason?: string;
  createdAt: string;
  updatedAt: string;
}
