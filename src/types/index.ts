export type UserRole = 'admin' | 'manager' | 'employee';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  managerId?: string; // Direct manager ID
  avatarUrl?: string;
}

export type DocumentClassification = 'Strictly Confidential' | 'Confidential' | 'Internal Only';

export interface EncryptedPayload {
  ciphertext: string; // Base64 encoded AES-256-GCM ciphertext
  iv: string; // Base64 encoded 96-bit IV
  salt: string; // Base64 encoded salt for key derivation
  tag?: string; // Authentication tag if separate, or included in ciphertext
  algorithm: 'AES-256-GCM';
}

export interface DocumentItem {
  id: string;
  title: string;
  filename: string;
  fileType: 'pdf' | 'text' | 'markdown' | 'image';
  sizeBytes: number;
  classification: DocumentClassification;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  ownerName: string;
  encryptedPayload: EncryptedPayload;
  checksum: string; // SHA-256 hash of raw document
  pageCount?: number;
  sampleContentText?: string; // Cached plaintext only for generation of seed documents
}

export type ViewMode = 'view_once' | 'time_limited' | 'max_views' | 'unlimited';
export type AccessMode = 'viewer_only' | 'allow_download';
export type ShareStatus = 'active' | 'burned' | 'expired' | 'revoked';

export interface ShareConfig {
  id: string;
  documentId: string;
  token: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  
  // Target
  targetType: 'link' | 'team_member';
  targetUserId?: string; // If locked to specific employee/manager
  targetUserName?: string;
  targetUserEmail?: string;
  
  // Controls
  viewMode: ViewMode;
  timeLimitSeconds?: number; // e.g. 120 (2m), 600 (10m), 1800 (30m), 3600 (1h)
  firstOpenedAt?: string;
  maxViews?: number;
  viewsCount: number;
  expiresAt?: string; // ISO cutoff date/time
  accessMode: AccessMode;
  requireOtp: boolean;
  status: ShareStatus;
  
  lastAccessedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
}

export type AuditEventType =
  | 'DOCUMENT_CREATED'
  | 'SHARE_LINK_CREATED'
  | 'DOC_OPENED'
  | 'DOC_DOWNLOADED'
  | 'DOC_EXPIRED'
  | 'DOC_REVOKED'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT'
  | 'OTP_REQUESTED'
  | 'OTP_VERIFIED'
  | 'OTP_FAILED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  documentId: string;
  documentTitle: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  token?: string;
  shareId?: string;
  ipAddress: string;
  userAgent: string;
  trackingId?: string; // e.g. DL-4821 for downloads
  details: string;
  previousHash: string;
  currentHash: string; // SHA-256(previousHash + timestamp + eventType + documentId + details)
}

export type NotificationType =
  | 'DOC_OPENED'
  | 'DOC_EXPIRED'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT'
  | 'DOC_DOWNLOADED'
  | 'DOC_REVOKED';

export interface NotificationItem {
  id: string;
  timestamp: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  documentId: string;
  shareId?: string;
  severity: 'info' | 'warning' | 'alert' | 'success';
}

export interface OtpSession {
  shareId: string;
  email: string;
  codeHash: string;
  rawCodePreviewForDemo: string; // For testing simulation drawer
  expiresAt: string;
  attemptsRemaining: number;
  resendCooldownUntil: string;
  isLocked: boolean;
}
