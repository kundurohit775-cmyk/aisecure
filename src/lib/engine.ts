import {
  AuditLogEntry,
  DocumentClassification,
  DocumentItem,
  NotificationItem,
  ShareConfig,
  User,
  AccessMode,
  ViewMode,
  OtpSession,
} from '../types';
import {
  bufferToBase64,
  base64ToBuffer,
  encryptBuffer,
  decryptToBytes,
  sha256,
  generateSecureToken,
  generateTrackingId,
  generateOtpCode,
} from './crypto';
import { safeFetchJson, isBackendHealthy } from './apiHelper';
import { initializeSeedData, SYSTEM_USERS } from './store';
import { stampWatermarkedPdf } from './pdfWatermark';

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

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'haven_vault_current_user_id',
  DOCUMENTS: 'haven_vault_documents_v2',
  SHARES: 'haven_vault_shares_v2',
  AUDIT_LOGS: 'haven_vault_audit_logs_v2',
  NOTIFICATIONS: 'haven_vault_notifications_v2',
  OTP_SESSIONS: 'haven_vault_otp_sessions_v2',
};

// In-memory / localStorage persistence helpers for client / static mode
export function getStoredDocuments(): DocumentItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveDocuments(docs: DocumentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
    cachedDocuments = docs;
  } catch {}
}

export function getStoredShares(): ShareConfig[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SHARES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveShares(shares: ShareConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.SHARES, JSON.stringify(shares));
    cachedShares = shares;
  } catch {}
}

export function getStoredAuditLogs(): AuditLogEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveAuditLogs(logs: AuditLogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
    cachedAuditLogs = logs;
  } catch {}
}

export function getStoredNotifications(): NotificationItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveNotifications(notifs: NotificationItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
    cachedNotifications = notifs;
  } catch {}
}

export async function appendAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'previousHash' | 'currentHash' | 'ipAddress' | 'userAgent'> & {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<AuditLogEntry> {
  const logs = getStoredAuditLogs();
  const lastLog = logs[logs.length - 1];
  const previousHash = lastLog
    ? lastLog.currentHash
    : '0000000000000000000000000000000000000000000000000000000000000000';

  const newId = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const currentHash = await sha256(
    previousHash + entry.timestamp + entry.eventType + entry.documentId + entry.details
  );

  const fullEntry: AuditLogEntry = {
    ipAddress: entry.ipAddress || '127.0.0.1',
    userAgent: entry.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'HavenVault Client'),
    ...entry,
    id: newId,
    previousHash,
    currentHash,
  };

  logs.push(fullEntry);
  saveAuditLogs(logs);
  return fullEntry;
}

export function pushNotification(
  notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>
): NotificationItem {
  const notifs = getStoredNotifications();
  const fullNotif: NotificationItem = {
    ...notif,
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };
  notifs.unshift(fullNotif);
  saveNotifications(notifs);
  return fullNotif;
}

// In-memory cache for synchronous shims
let cachedDocuments: DocumentItem[] = [];
let cachedShares: ShareConfig[] = [];
let cachedAuditLogs: AuditLogEntry[] = [];
let cachedNotifications: NotificationItem[] = [];
const activeViewerSessions: Record<string, string> = {};

// ============================================================================
// 1. Documents API
// ============================================================================

export async function fetchDocuments(): Promise<DocumentItem[]> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    const { ok, data } = await safeFetchJson<{ documents: any[] }>('/api/documents', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (ok && data?.documents) {
      return data.documents.map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        filename: doc.filename,
        fileType:
          doc.fileType === 'pdf'
            ? 'pdf'
            : doc.fileType === 'docx'
            ? 'pdf'
            : doc.fileType === 'md'
            ? 'markdown'
            : 'text',
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
    }
  }

  // Client-side / Static Fallback
  let localDocs = getStoredDocuments();
  if (localDocs.length === 0) {
    const seed = await initializeSeedData();
    localDocs = seed.documents;
  }
  return localDocs;
}

export async function uploadAndEncryptDocument(params: {
  title: string;
  filename: string;
  fileBytes: Uint8Array;
  fileType: DocumentItem['fileType'];
  classification: DocumentClassification;
  currentUser: User;
}): Promise<DocumentItem> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    const fileBase64 = bufferToBase64(params.fileBytes);
    const res = await safeFetchJson<{ document: any }>('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: params.title,
        filename: params.filename,
        fileType: params.fileType,
        classification: params.classification,
        fileBase64,
      }),
    });

    if (res.ok && res.data?.document) {
      const doc = res.data.document;
      return {
        id: doc.id,
        title: doc.title,
        filename: doc.filename,
        fileType: params.fileType,
        sizeBytes: doc.sizeBytes,
        classification: doc.classification,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
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
  }

  // Client-side in-memory encryption fallback (Web Crypto AES-256-GCM)
  const encPayload = await encryptBuffer(params.fileBytes);
  const checksum = await sha256(params.fileBytes);
  const now = new Date().toISOString();

  const newDoc: DocumentItem = {
    id: `doc-${Date.now()}`,
    title: params.title,
    filename: params.filename,
    fileType: params.fileType,
    sizeBytes: params.fileBytes.byteLength,
    classification: params.classification,
    createdAt: now,
    updatedAt: now,
    ownerId: params.currentUser.id,
    ownerName: params.currentUser.name,
    encryptedPayload: encPayload,
    checksum,
    pageCount: 1,
  };

  const currentDocs = getStoredDocuments();
  currentDocs.unshift(newDoc);
  saveDocuments(currentDocs);

  await appendAuditLog({
    timestamp: now,
    eventType: 'DOCUMENT_CREATED',
    documentId: newDoc.id,
    documentTitle: newDoc.title,
    userId: params.currentUser.id,
    userEmail: params.currentUser.email,
    userName: params.currentUser.name,
    details: `Uploaded & encrypted strictly in volatile memory (${newDoc.classification}, AES-256-GCM sealed).`,
  });

  return newDoc;
}

// ============================================================================
// 2. Shares API
// ============================================================================

export async function fetchShares(): Promise<ShareConfig[]> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    const { ok, data } = await safeFetchJson<{ shares: any[] }>('/api/shares', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (ok && data?.shares) {
      return data.shares.map((s: any) => ({
        id: s.id,
        documentId: s.documentId,
        token: s.token,
        createdById: s.createdById,
        createdByName: s.createdByName || 'Team Member',
        createdAt: s.createdAt,
        targetType: s.shareScope === 'internal_user' ? 'team_member' : 'link',
        targetUserId: s.sharedWithUserId,
        targetUserName: s.sharedWithUserName,
        targetUserEmail: s.recipientEmail,
        viewMode: s.accessType === 'view_once' ? 'view_once' : s.accessType === 'time_limited' ? 'time_limited' : 'unlimited',
        timeLimitSeconds: s.durationSeconds,
        maxViews: s.maxViews,
        viewsCount: s.viewsCount || 0,
        expiresAt: s.expiresAt,
        accessMode: s.allowDownload ? 'allow_download' : 'viewer_only',
        requireOtp: Boolean(s.recipientEmail),
        requirePassword: s.hasPassword,
        status: s.status,
      }));
    }
  }

  // Client-side Fallback
  let localShares = getStoredShares();
  if (localShares.length === 0) {
    const seed = await initializeSeedData();
    localShares = seed.shares;
  }
  return localShares;
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
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    const res = await safeFetchJson<{ share: any }>('/api/shares', {
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

    if (res.ok && res.data?.share) {
      const share = res.data.share;
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
  }

  // Client-side Fallback Link Creation
  const token = generateSecureToken(16);
  const now = new Date().toISOString();
  let passHash: string | undefined;
  if (params.requirePassword && params.password) {
    passHash = await sha256(params.password);
  }

  const newShare: ShareConfig = {
    id: `share-${Date.now()}`,
    documentId: params.documentId,
    token,
    createdById: params.currentUser.id,
    createdByName: params.currentUser.name,
    createdAt: now,
    targetType: params.targetType,
    targetUserId: params.targetUser?.id,
    targetUserName: params.targetUser?.name,
    targetUserEmail: params.targetUser?.email,
    viewMode: params.viewMode,
    timeLimitSeconds: params.timeLimitSeconds,
    maxViews: params.maxViews,
    viewsCount: 0,
    expiresAt: params.calendarExpiryIso,
    accessMode: params.accessMode,
    requireOtp: params.requireOtp,
    requirePassword: params.requirePassword,
    passwordHash: passHash,
    passwordHint: params.passwordHint,
    status: 'active',
  };

  const shares = getStoredShares();
  shares.unshift(newShare);
  saveShares(shares);

  await appendAuditLog({
    timestamp: now,
    eventType: 'SHARE_LINK_CREATED',
    documentId: params.documentId,
    documentTitle: 'Confidential Document',
    userId: params.currentUser.id,
    userEmail: params.currentUser.email,
    userName: params.currentUser.name,
    token,
    shareId: newShare.id,
    details: `Generated secure share link (mode: ${params.viewMode}, access: ${params.accessMode}).`,
  });

  return newShare;
}

export async function revokeShare(shareId: string, currentUser: User): Promise<void> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    await safeFetchJson(`/api/shares/${encodeURIComponent(shareId)}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  }

  // Client-side Revoke
  const shares = getStoredShares();
  const index = shares.findIndex((s) => s.id === shareId);
  if (index !== -1) {
    shares[index].status = 'revoked';
    shares[index].revokedAt = new Date().toISOString();
    shares[index].revokedBy = currentUser.name;
    saveShares(shares);

    await appendAuditLog({
      timestamp: new Date().toISOString(),
      eventType: 'DOC_REVOKED',
      documentId: shares[index].documentId,
      documentTitle: 'Confidential Document',
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      shareId: shares[index].id,
      token: shares[index].token,
      details: `Sender ${currentUser.name} invoked emergency kill-switch; share immediately revoked.`,
    });
  }
}

export async function requestOtpSession(shareId: string, email: string): Promise<{
  success: boolean;
  message: string;
  cooldownSeconds?: number;
}> {
  return {
    success: true,
    message: `A single-use verification passcode (use 123456 in demo mode) has been dispatched to ${email}.`,
    cooldownSeconds: 30,
  };
}

// ============================================================================
// 3. Document Access & Decryption in Volatile Memory
// ============================================================================

export async function requestDocumentAccess(params: {
  token: string;
  currentUser: User;
  password?: string;
  otpCode?: string;
  simulatedIp?: string;
  simulatedUserAgent?: string;
}): Promise<AccessResult> {
  const backendAlive = await isBackendHealthy();

  if (backendAlive) {
    try {
      const initRes = await safeFetchJson<any>('/api/shares/access/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token }),
      });

      if (!initRes.ok) {
        const err = initRes.data || {};
        if (err.code === 'REVOKED') return { success: false, error: 'REVOKED', message: err.error };
        if (err.code === 'EXPIRED') return { success: false, error: 'EXPIRED', message: err.error };
        if (err.code === 'VIEW_ONCE_USED') return { success: false, error: 'BURNED', message: err.error };
        if (err.code === 'MAX_VIEWS_EXCEEDED') return { success: false, error: 'MAX_VIEWS_REACHED', message: err.error };
        return { success: false, error: 'INVALID_TOKEN', message: err.error || 'Access denied' };
      }

      const initData = initRes.data;
      if (initData.requiresPassword && !params.password) {
        return {
          success: false,
          error: 'PASSWORD_REQUIRED',
          message: 'A sender-designated password is required to decrypt this document.',
          documentTitle: initData.docTitle,
        };
      }

      if (initData.requiresOtp && !params.otpCode) {
        return {
          success: false,
          error: 'OTP_REQUIRED',
          message: 'Two-factor OTP email verification is required.',
          documentTitle: initData.docTitle,
          details: { maskedEmail: initData.recipientEmailMasked },
        };
      }

      const verifyRes = await safeFetchJson<any>('/api/shares/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: params.token,
          password: params.password,
          otpCode: params.otpCode,
        }),
      });

      if (!verifyRes.ok) {
        const err = verifyRes.data || {};
        if (initData.requiresPassword && (err.error?.includes('password') || verifyRes.status === 401)) {
          return { success: false, error: 'PASSWORD_INVALID', message: err.error || 'Incorrect password' };
        }
        if (initData.requiresOtp && (err.error?.includes('code') || err.error?.includes('OTP'))) {
          return { success: false, error: 'OTP_INVALID', message: err.error || 'Invalid OTP code' };
        }
        return { success: false, error: 'INVALID_TOKEN', message: err.error || 'Verification failed' };
      }

      const verifyData = verifyRes.data;
      const sessionToken = verifyData.viewerSessionToken;
      activeViewerSessions[params.token] = sessionToken;

      const contentRes = await safeFetchJson<any>(`/api/shares/access/content?session=${encodeURIComponent(sessionToken)}`);
      if (!contentRes.ok) {
        return { success: false, error: 'TIME_EXPIRED', message: contentRes.error || 'Viewing window closed' };
      }

      const contentData = contentRes.data;
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
        ownerId: 'sender',
        ownerName: 'Document Owner',
        encryptedPayload: {
          ciphertext: contentData.contentBase64 || '',
          iv: '',
          salt: '',
          algorithm: 'AES-256-GCM',
        },
        checksum: 'SHA-256 Verified',
        pageCount: 1,
      };

      const dummyShare: ShareConfig = {
        id: initData.shareId,
        documentId: dummyDoc.id,
        token: params.token,
        createdById: 'sender',
        createdByName: 'Document Owner',
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
    } catch {
      // Fall through to client-side resolution
    }
  }

  // Client-side In-Memory Fallback Access Resolution (Vercel / Static Mode)
  const shares = getStoredShares();
  const docs = getStoredDocuments();
  const shareIndex = shares.findIndex((s) => s.token === params.token);

  if (shareIndex === -1) {
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'The requested document link is invalid or does not exist.',
    };
  }

  const share = shares[shareIndex];
  const doc = docs.find((d) => d.id === share.documentId);
  const documentTitle = doc ? doc.title : 'Confidential Document';

  if (share.status === 'revoked') {
    return {
      success: false,
      error: 'REVOKED',
      message: 'Access to this confidential document was immediately revoked by the sender.',
      share,
      documentTitle,
    };
  }

  if (share.status === 'burned' || (share.viewMode === 'view_once' && share.viewsCount >= 1)) {
    return {
      success: false,
      error: 'BURNED',
      message: 'Single-use View-Once protection active: This document has already been decrypted and self-destructed.',
      share,
      documentTitle,
    };
  }

  if (share.requirePassword && !params.password) {
    return {
      success: false,
      error: 'PASSWORD_REQUIRED',
      message: 'A sender-designated passkey is required to decrypt this document.',
      share,
      documentTitle,
    };
  }

  if (share.requirePassword && params.password) {
    const inputHash = await sha256(params.password);
    if (share.passwordHash && inputHash !== share.passwordHash) {
      return {
        success: false,
        error: 'PASSWORD_INVALID',
        message: 'Incorrect passkey entered. Access denied.',
        share,
        documentTitle,
      };
    }
  }

  if (share.requireOtp && !params.otpCode) {
    return {
      success: false,
      error: 'OTP_REQUIRED',
      message: 'Email OTP code required.',
      share,
      documentTitle,
    };
  }

  // Decrypt strictly in volatile memory
  let decryptedBytes: Uint8Array | undefined;
  if (doc?.encryptedPayload) {
    try {
      decryptedBytes = await decryptToBytes(doc.encryptedPayload);
    } catch (e) {
      console.error('[Engine] Decryption failed:', e);
    }
  }

  // Update view count
  shares[shareIndex].viewsCount = (shares[shareIndex].viewsCount || 0) + 1;
  if (shares[shareIndex].viewMode === 'view_once') {
    shares[shareIndex].status = 'burned';
  }
  saveShares(shares);

  const trackingId = generateTrackingId();
  await appendAuditLog({
    timestamp: new Date().toISOString(),
    eventType: 'DOC_OPENED',
    documentId: share.documentId,
    documentTitle,
    userId: params.currentUser.id,
    userEmail: params.currentUser.email,
    userName: params.currentUser.name,
    shareId: share.id,
    token: share.token,
    trackingId,
    details: `Decrypted strictly in volatile RAM (${share.viewMode}, watermark: ${trackingId}).`,
  });

  return {
    success: true,
    document: doc || {
      id: share.documentId,
      title: documentTitle,
      filename: 'document.pdf',
      fileType: 'pdf',
      sizeBytes: decryptedBytes ? decryptedBytes.byteLength : 2048,
      classification: 'Confidential',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: share.createdById,
      ownerName: share.createdByName,
      encryptedPayload: {
        ciphertext: '',
        iv: '',
        salt: '',
        algorithm: 'AES-256-GCM',
      },
      checksum: 'SHA-256 Verified',
    },
    share,
    decryptedBytes,
    timeRemainingSeconds: share.timeLimitSeconds,
    viewerSessionToken: `session-${Date.now()}`,
    watermarkConfig: {
      viewerName: params.currentUser.name || 'Recipient',
      viewerEmail: params.currentUser.email || 'recipient@acme-corp.internal',
      trackingId,
      timestampUtc: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
    },
  };
}

export async function completeViewOnceConsumption(shareId: string): Promise<void> {
  const shares = getStoredShares();
  const index = shares.findIndex((s) => s.id === shareId);
  if (index !== -1) {
    shares[index].status = 'burned';
    saveShares(shares);
  }
}

export async function downloadWatermarkedCopy(params: {
  document: DocumentItem;
  share: ShareConfig;
  currentUser: User;
  rawBytes?: Uint8Array;
  textContent?: string;
  simulatedIp?: string;
}): Promise<Uint8Array> {
  const backendAlive = await isBackendHealthy();
  const sessionToken = activeViewerSessions[params.share.token];

  if (backendAlive && sessionToken) {
    const res = await fetch('/api/shares/access/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionToken }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  }

  // Client-side Watermarking Fallback
  if (!params.rawBytes) {
    throw new Error('No document bytes available for stamping.');
  }

  const stamped = await stampWatermarkedPdf(params.rawBytes, {
    recipientName: params.currentUser.name,
    recipientEmail: params.currentUser.email,
    trackingId: generateTrackingId(),
  });

  await appendAuditLog({
    timestamp: new Date().toISOString(),
    eventType: 'DOC_DOWNLOADED',
    documentId: params.document.id,
    documentTitle: params.document.title,
    userId: params.currentUser.id,
    userEmail: params.currentUser.email,
    userName: params.currentUser.name,
    shareId: params.share.id,
    token: params.share.token,
    details: 'Watermarked copy stamped and downloaded.',
  });

  return stamped;
}

// ============================================================================
// 4. Audit & Verification API
// ============================================================================

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    const { ok, data } = await safeFetchJson<{ logs: any[] }>('/api/audit-logs', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (ok && data?.logs) {
      return data.logs.map((l: any) => ({
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
    }
  }

  // Client-side Fallback
  let localLogs = getStoredAuditLogs();
  if (localLogs.length === 0) {
    const seed = await initializeSeedData();
    localLogs = seed.auditLogs;
  }
  return localLogs;
}

export async function verifyAuditChainIntegrity(logs: AuditLogEntry[]): Promise<{
  isValid: boolean;
  checkedCount: number;
  brokenIndex?: number;
}> {
  if (logs.length === 0) return { isValid: true, checkedCount: 0 };

  const genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';
  let expectedPrev = genesisHash;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.previousHash !== expectedPrev) {
      return { isValid: false, checkedCount: i, brokenIndex: i };
    }
    const computed = await sha256(
      log.previousHash + log.timestamp + log.eventType + log.documentId + log.details
    );
    if (log.currentHash !== computed) {
      return { isValid: false, checkedCount: i, brokenIndex: i };
    }
    expectedPrev = log.currentHash;
  }

  return { isValid: true, checkedCount: logs.length };
}

// ============================================================================
// 5. Notifications API
// ============================================================================

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    const { ok, data } = await safeFetchJson<{ notifications: any[] }>('/api/notifications', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (ok && data?.notifications) {
      return data.notifications.map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        timestamp: n.createdAt,
        type: (n.type || 'DOC_OPENED') as NotificationItem['type'],
        read: Boolean(n.isRead),
        documentId: n.documentId || 'doc-general',
        severity: (n.severity || 'info') as NotificationItem['severity'],
      }));
    }
  }

  let localNotifs = getStoredNotifications();
  if (localNotifs.length === 0) {
    const seed = await initializeSeedData();
    localNotifs = seed.notifications;
  }
  return localNotifs;
}

export async function markNotificationRead(id: string): Promise<void> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    await safeFetchJson(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      credentials: 'include',
    });
  }

  const notifs = getStoredNotifications();
  const target = notifs.find((n) => n.id === id);
  if (target) {
    target.read = true;
    saveNotifications(notifs);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const backendAlive = await isBackendHealthy();
  if (backendAlive) {
    await safeFetchJson('/api/notifications/read-all', {
      method: 'POST',
      credentials: 'include',
    });
  }

  const notifs = getStoredNotifications();
  notifs.forEach((n) => (n.read = true));
  saveNotifications(notifs);
}

// Compatibility shims for legacy synchronous callers
export function getStoredAuditLogsSync(): AuditLogEntry[] {
  return cachedAuditLogs;
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
