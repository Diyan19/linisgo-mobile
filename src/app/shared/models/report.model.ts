export type ReportReason =
  | 'Spam'
  | 'Misleading details'
  | 'Suspicious activity'
  | 'Inappropriate content'
  | 'Privacy violation'
  | 'Other';

export type ReportStatus = 'Pending' | 'Under Review' | 'Resolved' | 'Dismissed';

export interface ReportItem {
  id: string;
  reporterId: string;
  targetType: 'post' | 'user';
  targetId: string;
  reason: ReportReason;
  explanation: string;
  status: ReportStatus;
  decisionNotes?: string;
  createdAt: string;
}

export type AppealStatus = 'Pending' | 'Approved' | 'Rejected';

export interface AppealItem {
  id: string;
  appellantId: string;
  targetType: 'post' | 'account';
  targetId: string;
  explanation: string;
  status: AppealStatus;
  decisionNotes?: string;
  createdAt: string;
}
