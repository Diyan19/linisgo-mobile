export type AuditActionType =
  | 'Account Warning'
  | 'Temporary Suspension'
  | 'Indefinite Suspension'
  | 'Lift Suspension'
  | 'Hide Post'
  | 'Restore Post'
  | 'Report Review Started'
  | 'Report Resolved'
  | 'Report Dismissed'
  | 'Appeal Approved'
  | 'Appeal Rejected';

export interface AuditLog {
  id: string;
  actionType: AuditActionType;
  targetType: 'user' | 'post' | 'report' | 'appeal';
  targetId: string;
  targetName?: string;
  adminId: string;
  reason: string;
  result: string;
  timestamp: string;
}
