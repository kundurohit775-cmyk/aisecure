import {
  AuditLogEntry,
  DocumentClassification,
  DocumentItem,
  NotificationItem,
  ShareConfig,
  User,
  AccessMode,
  ViewMode,
} from '../types';
import { bufferToBase64, base64ToBuffer } from './crypto';

/**
 * Access result returned to the secure in-app viewer
 */
export type AccessResult =
  | {
      success: true;
      document: DocumentItem;
      share: ShareConfig;
      decryptedBytes?: Uint8Array;
      decryptedText?: string;
      timeRemainingSeconds?: number;
      viewerSessionToken: string;
      watermarkConfig: {
        viewerName: string;
        viewerEmail: string;
        trackingId: string;
        timestampUtc: string;
      };
    }
  | {
      success: false;
      error:
        | 'INVALID_TOKEN'
        | 'REVOKED'
        | 'BURNED'
        | 'EXPIRED'
        | 'TIME_EXPIRED'
        | 'UNAUTHORIZED_USER'
        | 'MAX_VIEWS_REACHED'
        | 'PASSWORD_REQUIRED'
        | 'PASSWORD_INVALID'
        | 'OTP_REQUIRED'
        | 'OTP_INVALID'
        | 'OTP_LOCKED';
      message: string;
      share?: ShareConfig;
      documentTitle?: string;
      details?: Record<string, unknown>;
    };

// ============================================================================
// 1. Documents API
// ============================================================================

export async function fetchDocuments(): Promise<DocumentItem[]> {
  try {
    const res = await fetch('/api/documents', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.documents || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      fileType: doc.fileType === 'pdf' ? 'pdf' : doc.fileType === 'docx' ? 'pdf' : doc.fileType === 'md' ? 'markdown' : 'text',
      sizeBytes: doc.sizeBytes,
      classification: doc.classification as DocumentClassification,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      ownerId: doc.ownerId,
      ownerName: 'Vault Owner',
      checksum: doc.cryptoProof?.checksumSha256 || '',
      encryptedPayload: {
        ciphertext: doc.cryptoProof?.ciphertextBase64 || '',
        iv: doc.cryptoProof?.ivBase64 || '',
        salt: doc.cryptoProof?.authTagBase64 || '',
        algorithm: 'AES-256-GCM',
      },
    }));
  } catch (err) {
    console.error('[Engine] Failed to fetch documents:', err);
    return [];
  }
}

export async function uploadAndEncryptDocument(params: {
  title: string;
  filename: string;
  fileBytes: Uint8Array;
  fileType: DocumentItem['fileType'];
  classification: DocumentClassification;
  currentUser: User;
}): Promise<DocumentItem> {
  const fileBase64 = bufferToBase64(params.fileBytes);

  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      title: params.title,
      filename: params.filename,
      fileType: params.fileType === 'markdown' ? 'md' : params.fileType === 'text' ? 'txt' : 'pdf',
      classification: params.classification,
      fileBase64,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload and encrypt document');
  }

  const { document: doc } = await res.json();

  return {
    id: doc.id,
    title: doc.title,
    filename: doc.filename,
    fileType: params.fileType,
    sizeBytes: doc.sizeBytes,
    classification: doc.classification,
    createdAt: doc.createdAt,
    updatedAt: doc.createdAt,
    ownerId: params.currentUser.id,
    ownerName: params.currentUser.name,
    checksum: doc.cryptoProof?.checksumSha256 || '',
    encryptedPayload: {
      ciphertext: doc.cryptoProof?.ciphertextBase64 || '',
      iv: doc.cryptoProof?.ivBase64 || '',
      salt: doc.cryptoProof?.authTagBase64 || '',
      algorithm: 'AES-256-GCM',
    },
  };
}

// ============================================================================
// 2. Shares API
// ============================================================================

export async function fetchShares(): Promise<ShareConfig[]> {
  try {
    const res = await fetch('/api/shares', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.shares || []).map((s: any) => ({
      id: s.id,
      documentId: s.documentId,
      token: s.id,
      createdById: s.createdBy,
      createdByName: 'You',
      createdAt: s.createdAt,
      targetType: s.shareScope === 'internal_user' ? 'team_member' : 'link',
      targetUserId: s.sharedWithUserId,
      targetUserEmail: s.recipientEmail,
      viewMode: (s.accessType === 'view_once' ? 'view_once' : s.accessType === 'time_limited' ? 'time_limited' : s.maxViews ? 'max_views' : 'unlimited') as ViewMode,
      timeLimitSeconds: s.durationSeconds,
      firstOpenedAt: s.firstOpenedAt,
      maxViews: s.maxViews,
      viewsCount: s.viewCount,
      expiresAt: s.expiresAt,
      accessMode: (s.allowDownload ? 'allow_download' : 'viewer_only') as AccessMode,
      requireOtp: Boolean(s.recipientEmail),
      requirePassword: s.hasPassword,
      status: s.status,
    }));
  } catch (err) {
    console.error('[Engine] Failed to fetch shares:', err);
    return [];
  }
}

export async function createShareLink(params: {
  documentId: string;
  currentUser: User;
  targetType: 'link' | 'team_member';
  targetUser?: User;
  viewMode: ViewMode;
  timeLimitSeconds?: number;
  maxViews?: number;
  calendarExpiryIso?: string;
  accessMode: AccessMode;
  requireOtp: boolean;
  requirePassword?: boolean;
  password?: string;
  passwordHint?: string;
}): Promise<ShareConfig> {
  const res = await fetch('/api/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      documentId: params.documentId,
      shareScope: params.targetType === 'team_member' ? 'internal_user' : 'external_link',
      sharedWithUserId: params.targetUser?.id,
      recipientEmail: params.targetUser?.email || (params.requireOtp ? 'recipient@domain.external' : undefined),
      accessType: params.viewMode === 'view_once' ? 'view_once' : params.viewMode === 'time_limited' ? 'time_limited' : 'standard',
      durationSeconds: params.timeLimitSeconds,
      maxViews: params.maxViews,
      expiresAt: params.calendarExpiryIso,
      allowDownload: params.accessMode === 'allow_download',
      password: params.requirePassword && params.password ? params.password : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create share link');
  }

  const { share } = await res.json();

  return {
    id: share.id,
    documentId: share.documentId,
    token: share.token,
    createdById: params.currentUser.id,
    createdByName: params.currentUser.name,
    createdAt: share.createdAt,
    targetType: params.targetType,
    targetUserId: params.targetUser?.id,
    targetUserName: params.targetUser?.name,
    targetUserEmail: params.targetUser?.email || share.recipientEmail,
    viewMode: params.viewMode,
    timeLimitSeconds: share.durationSeconds,
    maxViews: share.maxViews,
    viewsCount: 0,
    expiresAt: share.expiresAt,
    accessMode: params.accessMode,
    requireOtp: Boolean(share.recipientEmail),
    requirePassword: share.hasPassword,
    status: 'active',
  };
}

export async function revokeShare(shareId: string, currentUser: User): Promise<void> {
  const res = await fetch(`/api/shares/${shareId}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to revoke share link');
  }
}

// ============================================================================
// 3. Recipient In-App Viewer & Access Control Flow
// ============================================================================

export async function requestOtpSession(shareId: string, email: string): Promise<{
  success: boolean;
  message: string;
  cooldownSeconds?: number;
}> {
  // Real emails are dispatched by the server in /api/shares/access/init
  return {
    success: true,
    message: `A single-use verification passcode has been dispatched to ${email}.`,
    cooldownSeconds: 30,
  };
}

// Memory cache of viewer session tokens per share token
const activeViewerSessions: Record<string, string> = {};

export async function requestDocumentAccess(params: {
  token: string;
  currentUser: User;
  password?: string;
  otpCode?: string;
  simulatedIp?: string;
  simulatedUserAgent?: string;
}): Promise<AccessResult> {
  try {
    // Step 1: Initialize access inspection
    const initRes = await fetch('/api/shares/access/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: params.token }),
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      if (err.code === 'REVOKED') {
        return { success: false, error: 'REVOKED', message: err.error };
      }
      if (err.code === 'EXPIRED' || err.code === 'TIME_EXPIRED') {
        return { success: false, error: 'EXPIRED', message: err.error };
      }
      if (err.code === 'VIEW_ONCE_USED') {
        return { success: false, error: 'BURNED', message: err.error };
      }
      if (err.code === 'MAX_VIEWS_EXCEEDED') {
        return { success: false, error: 'MAX_VIEWS_REACHED', message: err.error };
      }
      return { success: false, error: 'INVALID_TOKEN', message: err.error || 'Access denied' };
    }

    const initData = await initRes.json();

    // Check if Password is required and not yet submitted
    if (initData.requiresPassword && !params.password) {
      return {
        success: false,
        error: 'PASSWORD_REQUIRED',
        message: 'A sender-designated password is required to decrypt this document.',
        documentTitle: initData.docTitle,
      };
    }

    // Check if OTP is required and not yet submitted
    if (initData.requiresOtp && !params.otpCode) {
      return {
        success: false,
        error: 'OTP_REQUIRED',
        message: 'Two-factor OTP email verification is required.',
        documentTitle: initData.docTitle,
        details: { maskedEmail: initData.recipientEmailMasked },
      };
    }

    // Step 2: Verify Credentials (Password and/or OTP)
    const verifyRes = await fetch('/api/shares/access/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: params.token,
        password: params.password,
        otpCode: params.otpCode,
      }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      if (initData.requiresPassword && (err.error?.includes('password') || verifyRes.status === 401)) {
        return { success: false, error: 'PASSWORD_INVALID', message: err.error || 'Incorrect password' };
      }
      if (initData.requiresOtp && (err.error?.includes('code') || err.error?.includes('OTP'))) {
        return { success: false, error: 'OTP_INVALID', message: err.error || 'Invalid OTP code' };
      }
      return { success: false, error: 'INVALID_TOKEN', message: err.error || 'Verification failed' };
    }

    const verifyData = await verifyRes.json();
    const sessionToken = verifyData.viewerSessionToken;
    activeViewerSessions[params.token] = sessionToken;

    // Step 3: Fetch in-memory decrypted content
    const contentRes = await fetch(`/api/shares/access/content?session=${encodeURIComponent(sessionToken)}`);
    if (!contentRes.ok) {
      const err = await contentRes.json().catch(() => ({}));
      return { success: false, error: 'TIME_EXPIRED', message: err.error || 'Viewing window closed' };
    }

    const contentData = await contentRes.json();

    // Convert base64 bytes for PDF securely without throwing on base64url or padding
    let decryptedBytes: Uint8Array | undefined;
    if (contentData.contentBase64) {
      decryptedBytes = base64ToBuffer(contentData.contentBase64);
    }

    const dummyDoc: DocumentItem = {
      id: initData.shareId,
      title: contentData.title || initData.docTitle,
      filename: `${contentData.title || 'Document'}.${contentData.fileType}`,
      fileType: contentData.fileType === 'pdf' ? 'pdf' : contentData.fileType === 'docx' ? 'pdf' : 'text',
      sizeBytes: decryptedBytes ? decryptedBytes.byteLength : 1024,
      classification: (contentData.classification || initData.classification) as DocumentClassification,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: 'owner',
      ownerName: initData.senderName || 'Document Owner',
      checksum: 'VERIFIED_BY_SERVER_AEAD',
      encryptedPayload: {
        ciphertext: '',
        iv: '',
        salt: '',
        algorithm: 'AES-256-GCM',
      },
    };

    const dummyShare: ShareConfig = {
      id: initData.shareId,
      documentId: initData.shareId,
      token: params.token,
      createdById: 'owner',
      createdByName: initData.senderName || 'Sender',
      createdAt: new Date().toISOString(),
      targetType: 'link',
      viewMode: initData.accessType as ViewMode,
      timeLimitSeconds: initData.durationSeconds,
      viewsCount: 1,
      accessMode: verifyData.allowDownload ? 'allow_download' : 'viewer_only',
      requireOtp: initData.requiresOtp,
      requirePassword: initData.requiresPassword,
      status: 'active',
    };

    return {
      success: true,
      document: dummyDoc,
      share: dummyShare,
      decryptedBytes,
      decryptedText: contentData.textContent,
      timeRemainingSeconds: verifyData.remainingSeconds,
      viewerSessionToken: sessionToken,
      watermarkConfig: {
        viewerName: params.currentUser.name || 'Recipient',
        viewerEmail: params.currentUser.email || 'recipient@authorized',
        trackingId: `DL-${params.token.slice(0, 8).toUpperCase()}`,
        timestampUtc: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      },
    };
  } catch (err: any) {
    console.error('[Engine] Access error:', err);
    return { success: false, error: 'INVALID_TOKEN', message: err.message || 'Network error accessing document' };
  }
}

export async function completeViewOnceConsumption(shareId: string): Promise<void> {
  // Handled automatically server-side upon view verification
}

export async function downloadWatermarkedCopy(params: {
  document: DocumentItem;
  share: ShareConfig;
  currentUser: User;
  rawBytes?: Uint8Array;
  textContent?: string;
  simulatedIp?: string;
}): Promise<Uint8Array> {
  const sessionToken = activeViewerSessions[params.share.token];
  if (!sessionToken) {
    throw new Error('No active viewing session available for download');
  }

  const res = await fetch('/api/shares/access/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: sessionToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Download forbidden or failed');
  }

  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// ============================================================================
// 4. Audit & Verification API
// ============================================================================

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const res = await fetch('/api/audit-logs', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.logs || []).map((l: any) => ({
      id: l.id,
      timestamp: l.createdAt,
      eventType: l.eventType,
      documentId: l.documentId || '',
      documentTitle: l.metadata?.title || l.metadata?.documentTitle || 'Confidential Document',
      userId: l.actorId,
      userEmail: l.actorEmail,
      userName: l.actorEmail ? l.actorEmail.split('@')[0] : 'System',
      token: l.metadata?.token,
      shareId: l.shareId,
      ipAddress: l.ipAddress || '127.0.0.1',
      userAgent: l.userAgent || 'HavenVault Secure Client',
      trackingId: l.metadata?.trackingId,
      details: l.metadata?.reason || l.metadata?.action || `${l.eventType} recorded in immutable ledger`,
      previousHash: l.previousHash,
      currentHash: l.entryHash,
    }));
  } catch (err) {
    console.error('[Engine] Failed to fetch audit logs:', err);
    return [];
  }
}

export async function verifyAuditChainIntegrity(logs: AuditLogEntry[]): Promise<{
  isValid: boolean;
  checkedCount: number;
  brokenIndex?: number;
}> {
  try {
    const res = await fetch('/api/audit-logs/verify', {
      credentials: 'include',
    });
    if (!res.ok) {
      return { isValid: false, checkedCount: logs.length };
    }
    const data = await res.json();
    return {
      isValid: data.verified,
      checkedCount: data.totalEntries,
      brokenIndex: data.brokenAtSequence,
    };
  } catch {
    return { isValid: false, checkedCount: logs.length };
  }
}

// ============================================================================
// 5. Notifications API
// ============================================================================

export async function fetchNotifications(): Promise<NotificationItem[]> {
  try {
    const res = await fetch('/api/notifications', {
      credentials: 'include',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.notifications || []).map((n: any) => ({
      id: n.id,
      timestamp: n.createdAt,
      type: n.eventType,
      title: n.title,
      message: n.description,
      read: n.read,
      documentId: n.documentId || '',
      shareId: n.shareId,
      severity: n.eventType === 'DOC_OPENED' ? 'info' : n.eventType === 'UNAUTHORIZED_ACCESS_ATTEMPT' ? 'alert' : 'warning',
    }));
  } catch (err) {
    console.error('[Engine] Failed to fetch notifications:', err);
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetch(`/api/notifications/${id}/read`, {
    method: 'PATCH',
    credentials: 'include',
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch('/api/notifications/read-all', {
    method: 'POST',
    credentials: 'include',
  });
}

// Compatibility shims for synchronous legacy UI renders
let cachedDocuments: DocumentItem[] = [];
let cachedShares: ShareConfig[] = [];
let cachedAuditLogs: AuditLogEntry[] = [];
let cachedNotifications: NotificationItem[] = [];

export function getStoredDocuments(): DocumentItem[] {
  return cachedDocuments;
}

export function saveDocuments(docs: DocumentItem[]) {
  cachedDocuments = docs;
}

export function getStoredShares(): ShareConfig[] {
  return cachedShares;
}

export function saveShares(shares: ShareConfig[]) {
  cachedShares = shares;
}

export function getStoredAuditLogs(): AuditLogEntry[] {
  return cachedAuditLogs;
}

export function saveAuditLogs(logs: AuditLogEntry[]) {
  cachedAuditLogs = logs;
}

export function getStoredNotifications(): NotificationItem[] {
  return cachedNotifications;
}

export function saveNotifications(notifs: NotificationItem[]) {
  cachedNotifications = notifs;
}

export async function refreshVaultData() {
  const [docs, shares, logs, notifs] = await Promise.all([
    fetchDocuments(),
    fetchShares(),
    fetchAuditLogs(),
    fetchNotifications(),
  ]);

  cachedDocuments = docs;
  cachedShares = shares;
  cachedAuditLogs = logs;
  cachedNotifications = notifs;

  return { documents: docs, shares, auditLogs: logs, notifications: notifs };
}
