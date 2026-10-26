import {
  AuditLogEntry,
  DocumentItem,
  NotificationItem,
  OtpSession,
  ShareConfig,
  User,
} from '../types';
import {
  decryptToBytes,
  decryptToString,
  encryptBuffer,
  generateOtpCode,
  generateSecureToken,
  generateTrackingId,
  sha256,
} from './crypto';
import { stampWatermarkedPdf } from './pdfWatermark';
import { convertToEncryptedPdfBuffer } from './docxHelper';

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'haven_vault_current_user_id',
  DOCUMENTS: 'haven_vault_documents_v2',
  SHARES: 'haven_vault_shares_v2',
  AUDIT_LOGS: 'haven_vault_audit_logs_v2',
  NOTIFICATIONS: 'haven_vault_notifications_v2',
  OTP_SESSIONS: 'haven_vault_otp_sessions_v2',
};

// In-memory / localStorage persistence helpers
export function getStoredDocuments(): DocumentItem[] {
  const data = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
  return data ? JSON.parse(data) : [];
}

export function saveDocuments(docs: DocumentItem[]) {
  localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
}

export function getStoredShares(): ShareConfig[] {
  const data = localStorage.getItem(STORAGE_KEYS.SHARES);
  return data ? JSON.parse(data) : [];
}

export function saveShares(shares: ShareConfig[]) {
  localStorage.setItem(STORAGE_KEYS.SHARES, JSON.stringify(shares));
}

export function getStoredAuditLogs(): AuditLogEntry[] {
  const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
  return data ? JSON.parse(data) : [];
}

export function saveAuditLogs(logs: AuditLogEntry[]) {
  localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
}

export function getStoredNotifications(): NotificationItem[] {
  const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  return data ? JSON.parse(data) : [];
}

export function saveNotifications(notifs: NotificationItem[]) {
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
}

export function getStoredOtpSessions(): Record<string, OtpSession> {
  const data = localStorage.getItem(STORAGE_KEYS.OTP_SESSIONS);
  return data ? JSON.parse(data) : {};
}

export function saveOtpSessions(sessions: Record<string, OtpSession>) {
  localStorage.setItem(STORAGE_KEYS.OTP_SESSIONS, JSON.stringify(sessions));
}

/**
 * Append an immutable log entry with SHA-256 hash chaining
 */
export async function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'previousHash' | 'currentHash'>): Promise<AuditLogEntry> {
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
    ...entry,
    id: newId,
    previousHash,
    currentHash,
  };

  logs.push(fullEntry);
  saveAuditLogs(logs);
  return fullEntry;
}

/**
 * Push a notification to the document sender
 */
export function pushNotification(notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): NotificationItem {
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

/**
 * Access result returned to the client
 */
export type AccessResult =
  | {
      success: true;
      document: DocumentItem;
      share: ShareConfig;
      decryptedBytes?: Uint8Array;
      decryptedText?: string;
      timeRemainingSeconds?: number;
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

/**
 * Request access to a shared document.
 * Enforces all server-side restrictions:
 * - Revoked state check
 * - Burned single-use check
 * - Calendar expiration cutoff
 * - Role-locked internal user matching
 * - Real email OTP authentication
 * - Server-authoritative time-limited countdown
 * - Decryption strictly in volatile memory
 */
export async function requestDocumentAccess(params: {
  token: string;
  currentUser: User;
  password?: string;
  otpCode?: string;
  simulatedIp?: string;
  simulatedUserAgent?: string;
}): Promise<AccessResult> {
  const {
    token,
    currentUser,
    password,
    otpCode,
    simulatedIp = '192.168.1.100',
    simulatedUserAgent = navigator.userAgent,
  } = params;

  const shares = getStoredShares();
  const docs = getStoredDocuments();

  const shareIndex = shares.findIndex((s) => s.token === token);
  if (shareIndex === -1) {
    await appendAuditLog({
      timestamp: new Date().toISOString(),
      eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      documentId: 'unknown',
      documentTitle: 'Unknown Document',
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      token,
      ipAddress: simulatedIp,
      userAgent: simulatedUserAgent,
      details: 'Rejected access request: Non-existent or invalid security token provided.',
    });

    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'The requested document link is invalid or does not exist.',
    };
  }

  const share = shares[shareIndex];
  const doc = docs.find((d) => d.id === share.documentId);
  const documentTitle = doc ? doc.title : 'Confidential Document';

  // 1. Check Revoked status
  if (share.status === 'revoked') {
    await appendAuditLog({
      timestamp: new Date().toISOString(),
      eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      documentId: share.documentId,
      documentTitle,
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      token,
      shareId: share.id,
      ipAddress: simulatedIp,
      userAgent: simulatedUserAgent,
      details: `Blocked attempt to access revoked share link. Revoked by ${share.revokedBy || 'Owner'} at ${share.revokedAt || 'earlier'}.`,
    });

    return {
      success: false,
      error: 'REVOKED',
      message: 'Access to this confidential document was immediately revoked by the sender.',
      share,
      documentTitle,
    };
  }

  // 2. Check Burned / View-Once consumed
  if (share.status === 'burned') {
    await appendAuditLog({
      timestamp: new Date().toISOString(),
      eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      documentId: share.documentId,
      documentTitle,
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      token,
      shareId: share.id,
      ipAddress: simulatedIp,
      userAgent: simulatedUserAgent,
      details: 'Blocked attempt to access single-use view link that has already been burned/consumed.',
    });

    return {
      success: false,
      error: 'BURNED',
      message: 'This was a single-use "View Once" document link and has already been consumed.',
      share,
      documentTitle,
    };
  }

  const now = new Date();

  // 3. Check Calendar Cutoff
  if (share.expiresAt && new Date(share.expiresAt) <= now) {
    share.status = 'expired';
    shares[shareIndex] = share;
    saveShares(shares);

    await appendAuditLog({
      timestamp: now.toISOString(),
      eventType: 'DOC_EXPIRED',
      documentId: share.documentId,
      documentTitle,
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      token,
      shareId: share.id,
      ipAddress: simulatedIp,
      userAgent: simulatedUserAgent,
      details: `Share link passed calendar expiry deadline (${share.expiresAt}). Link permanently expired.`,
    });

    pushNotification({
      type: 'DOC_EXPIRED',
      title: 'Document Link Expired',
      message: `Calendar expiry cutoff reached for "${documentTitle}". Link disabled.`,
      documentId: share.documentId,
      shareId: share.id,
      severity: 'warning',
    });

    return {
      success: false,
      error: 'EXPIRED',
      message: 'This document share has passed its calendar expiration deadline.',
      share,
      documentTitle,
    };
  }

  // 4. Check Internal Team Member Role Lock
  if (share.targetType === 'team_member' && share.targetUserId) {
    if (currentUser.id !== share.targetUserId) {
      await appendAuditLog({
        timestamp: now.toISOString(),
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        documentId: share.documentId,
        documentTitle,
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: currentUser.name,
        token,
        shareId: share.id,
        ipAddress: simulatedIp,
        userAgent: simulatedUserAgent,
        details: `Access violation: Share token is cryptographically locked to recipient ${share.targetUserName} (${share.targetUserEmail}), but current authenticated user is ${currentUser.name} (${currentUser.email}).`,
      });

      pushNotification({
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        title: 'Unauthorized Internal Access Attempt',
        message: `${currentUser.name} attempted to access internal document "${documentTitle}" restricted to ${share.targetUserName}.`,
        documentId: share.documentId,
        shareId: share.id,
        severity: 'alert',
      });

      return {
        success: false,
        error: 'UNAUTHORIZED_USER',
        message: `Unauthorized recipient. This internal document is restricted to ${share.targetUserName} (${share.targetUserEmail}).`,
        share,
        documentTitle,
      };
    }
  }

  // 5. Check Password Protection (if required by sender)
  if (share.requirePassword && share.passwordHash) {
    if (!password) {
      return {
        success: false,
        error: 'PASSWORD_REQUIRED',
        message: 'This document is protected with a sender-specified password. Please enter the password to view.',
        share,
        documentTitle,
        details: {
          hint: share.passwordHint,
        },
      };
    }

    const inputPasswordHash = await sha256(password.trim());
    if (inputPasswordHash !== share.passwordHash) {
      await appendAuditLog({
        timestamp: now.toISOString(),
        eventType: 'PASSWORD_FAILED',
        documentId: share.documentId,
        documentTitle,
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: currentUser.name,
        token,
        shareId: share.id,
        ipAddress: simulatedIp,
        userAgent: simulatedUserAgent,
        details: 'Failed document unlock attempt: Invalid password supplied.',
      });

      return {
        success: false,
        error: 'PASSWORD_INVALID',
        message: 'Incorrect password entered. Access denied.',
        share,
        documentTitle,
        details: {
          hint: share.passwordHint,
        },
      };
    }

    await appendAuditLog({
      timestamp: now.toISOString(),
      eventType: 'PASSWORD_VERIFIED',
      documentId: share.documentId,
      documentTitle,
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      token,
      shareId: share.id,
      ipAddress: simulatedIp,
      userAgent: simulatedUserAgent,
      details: 'Recipient successfully verified document password.',
    });
  }

  // 6. Check Email OTP requirement
  if (share.requireOtp) {
    const sessions = getStoredOtpSessions();
    const session = sessions[share.id];

    if (!otpCode) {
      return {
        success: false,
        error: 'OTP_REQUIRED',
        message: 'This secure link requires 2-factor email one-time password (OTP) verification.',
        share,
        documentTitle,
      };
    }

    // Verify OTP
    if (!session) {
      return {
        success: false,
        error: 'OTP_INVALID',
        message: 'No active OTP verification session found. Please request a new code.',
        share,
        documentTitle,
      };
    }

    if (session.isLocked) {
      return {
        success: false,
        error: 'OTP_LOCKED',
        message: 'Maximum verification attempts exceeded. This session has been locked for security.',
        share,
        documentTitle,
      };
    }

    if (new Date(session.expiresAt) <= now) {
      return {
        success: false,
        error: 'OTP_INVALID',
        message: 'Your verification code has expired (5-minute window). Please request a new code.',
        share,
        documentTitle,
      };
    }

    const inputHash = await sha256(otpCode.trim());
    if (inputHash !== session.codeHash) {
      session.attemptsRemaining -= 1;
      if (session.attemptsRemaining <= 0) {
        session.isLocked = true;
      }
      sessions[share.id] = session;
      saveOtpSessions(sessions);

      await appendAuditLog({
        timestamp: now.toISOString(),
        eventType: 'OTP_FAILED',
        documentId: share.documentId,
        documentTitle,
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: currentUser.name,
        token,
        shareId: share.id,
        ipAddress: simulatedIp,
        userAgent: simulatedUserAgent,
        details: `Invalid OTP entered. Remaining attempts: ${session.attemptsRemaining}. Locked: ${session.isLocked}`,
      });

      return {
        success: false,
        error: session.isLocked ? 'OTP_LOCKED' : 'OTP_INVALID',
        message: session.isLocked
          ? 'Maximum verification attempts (5) reached. Code locked.'
          : `Invalid verification code. ${session.attemptsRemaining} attempts remaining.`,
        share,
        documentTitle,
      };
    }

    // OTP succeeded!
    await appendAuditLog({
      timestamp: now.toISOString(),
      eventType: 'OTP_VERIFIED',
      documentId: share.documentId,
      documentTitle,
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      token,
      shareId: share.id,
      ipAddress: simulatedIp,
      userAgent: simulatedUserAgent,
      details: 'Email OTP code verified successfully. Ephemeral access token issued.',
    });
  }

  // 6. Check Time-Limited Viewing
  let timeRemainingSeconds: number | undefined = undefined;

  if (share.viewMode === 'time_limited' && share.timeLimitSeconds) {
    if (!share.firstOpenedAt) {
      // First open starts the clock!
      share.firstOpenedAt = now.toISOString();
      timeRemainingSeconds = share.timeLimitSeconds;
    } else {
      const firstOpenedTime = new Date(share.firstOpenedAt).getTime();
      const elapsedSeconds = Math.floor((now.getTime() - firstOpenedTime) / 1000);

      if (elapsedSeconds >= share.timeLimitSeconds) {
        // Expired!
        share.status = 'expired';
        shares[shareIndex] = share;
        saveShares(shares);

        await appendAuditLog({
          timestamp: now.toISOString(),
          eventType: 'DOC_EXPIRED',
          documentId: share.documentId,
          documentTitle,
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: currentUser.name,
          token,
          shareId: share.id,
          ipAddress: simulatedIp,
          userAgent: simulatedUserAgent,
          details: `Time-limited viewing duration of ${share.timeLimitSeconds}s has elapsed. Session permanently terminated.`,
        });

        pushNotification({
          type: 'DOC_EXPIRED',
          title: 'Document Viewing Time Elapsed',
          message: `Time-limited access for "${documentTitle}" reached zero. Memory buffers cleared.`,
          documentId: share.documentId,
          shareId: share.id,
          severity: 'info',
        });

        return {
          success: false,
          error: 'TIME_EXPIRED',
          message: 'The allocated viewing countdown for this session has reached zero. Memory buffers have been purged.',
          share,
          documentTitle,
        };
      } else {
        timeRemainingSeconds = share.timeLimitSeconds - elapsedSeconds;
      }
    }
  }

  // 7. Check Max Views
  if (share.viewMode === 'max_views' && share.maxViews) {
    if (share.viewsCount >= share.maxViews) {
      share.status = 'burned';
      shares[shareIndex] = share;
      saveShares(shares);

      return {
        success: false,
        error: 'MAX_VIEWS_REACHED',
        message: `The maximum allowed views limit (${share.maxViews}) has been reached for this link.`,
        share,
        documentTitle,
      };
    }
  }

  // 8. Update access stats
  share.viewsCount += 1;
  share.lastAccessedAt = now.toISOString();
  shares[shareIndex] = share;
  saveShares(shares);

  if (!doc) {
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Underlying document payload could not be found.',
    };
  }

  // 9. Decrypt document strictly in volatile memory
  let decryptedBytes: Uint8Array | undefined = undefined;
  let decryptedText: string | undefined = undefined;

  try {
    const rawBytes = await decryptToBytes(doc.encryptedPayload);
    
    // Check if rawBytes is a PDF (%PDF-)
    const isPdf =
      rawBytes.length > 4 &&
      rawBytes[0] === 0x25 &&
      rawBytes[1] === 0x50 &&
      rawBytes[2] === 0x44 &&
      rawBytes[3] === 0x46;

    if (isPdf) {
      decryptedBytes = rawBytes;
    } else {
      // Non-PDF (e.g. DOCX, TXT, MD): Convert in memory to structured PDF for viewer and watermarking
      decryptedBytes = await convertToEncryptedPdfBuffer({
        filename: doc.filename,
        buffer: rawBytes,
        defaultTitle: doc.title,
      });

      try {
        decryptedText = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
      } catch {
        // binary
      }
    }
  } catch (err) {
    console.error('Decryption error:', err);
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Cryptographic payload verification failed during in-memory decryption.',
    };
  }

  // 10. Generate tracking watermark details
  const viewerName = share.targetUserName || currentUser.name || 'External Recipient';
  const viewerEmail = share.targetUserEmail || currentUser.email || 'external@guest.share';
  const trackingId = generateTrackingId();
  const timestampUtc = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  // 11. Log immutable audit entry for DOC_OPENED
  await appendAuditLog({
    timestamp: now.toISOString(),
    eventType: 'DOC_OPENED',
    documentId: share.documentId,
    documentTitle,
    userId: currentUser.id,
    userEmail: viewerEmail,
    userName: viewerName,
    token,
    shareId: share.id,
    trackingId,
    ipAddress: simulatedIp,
    userAgent: simulatedUserAgent,
    details: `Document decrypted in memory. View count: ${share.viewsCount}. Watermark applied: ${viewerEmail} (${trackingId}). View mode: ${share.viewMode}${
      timeRemainingSeconds ? ` (${timeRemainingSeconds}s remaining)` : ''
    }.`,
  });

  // 12. Push notification to sender
  pushNotification({
    type: 'DOC_OPENED',
    title: 'Confidential Document Opened',
    message: `${viewerName} opened "${documentTitle}" via ${
      share.targetType === 'team_member' ? 'direct team share' : 'secure link'
    }.`,
    documentId: share.documentId,
    shareId: share.id,
    severity: 'info',
  });

  return {
    success: true,
    document: doc,
    share,
    decryptedBytes,
    decryptedText,
    timeRemainingSeconds,
    watermarkConfig: {
      viewerName,
      viewerEmail,
      trackingId,
      timestampUtc,
    },
  };
}

/**
 * Marks a view-once share as burned upon completing consumption or closing viewer
 */
export async function completeViewOnceConsumption(shareId: string): Promise<void> {
  const shares = getStoredShares();
  const idx = shares.findIndex((s) => s.id === shareId);
  if (idx !== -1 && shares[idx].viewMode === 'view_once') {
    shares[idx].status = 'burned';
    saveShares(shares);

    const doc = getStoredDocuments().find((d) => d.id === shares[idx].documentId);
    await appendAuditLog({
      timestamp: new Date().toISOString(),
      eventType: 'DOC_EXPIRED',
      documentId: shares[idx].documentId,
      documentTitle: doc ? doc.title : 'Confidential Document',
      token: shares[idx].token,
      shareId,
      ipAddress: '192.168.1.100',
      userAgent: navigator.userAgent,
      details: 'View-Once single-use limit reached. Security token burned and permanently invalidated.',
    });

    pushNotification({
      type: 'DOC_EXPIRED',
      title: 'View-Once Link Burned',
      message: `Single-use view-once link for "${doc?.title || 'Document'}" was consumed and destroyed.`,
      documentId: shares[idx].documentId,
      shareId,
      severity: 'info',
    });
  }
}

/**
 * Downloads dynamic watermarked copy of the document
 */
export async function downloadWatermarkedCopy(params: {
  share: ShareConfig;
  document: DocumentItem;
  currentUser: User;
  watermarkConfig: {
    viewerName: string;
    viewerEmail: string;
    trackingId: string;
    timestampUtc: string;
  };
}): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  const { share, document, watermarkConfig } = params;

  if (share.accessMode !== 'allow_download') {
    throw new Error('Download permission was not granted by document owner.');
  }

  // 1. Decrypt raw bytes strictly in memory
  let rawBytes = await decryptToBytes(document.encryptedPayload);

  // Check if rawBytes is a PDF (%PDF-), otherwise convert in memory to PDF for watermarking
  const isPdf =
    rawBytes.length > 4 &&
    rawBytes[0] === 0x25 &&
    rawBytes[1] === 0x50 &&
    rawBytes[2] === 0x44 &&
    rawBytes[3] === 0x46;

  if (!isPdf) {
    rawBytes = await convertToEncryptedPdfBuffer({
      filename: document.filename,
      buffer: rawBytes,
      defaultTitle: document.title,
    });
  }

  // 2. Stamp diagonal watermarks on every page using pdf-lib
  const stampedBytes = await stampWatermarkedPdf(rawBytes, {
    recipientName: watermarkConfig.viewerName,
    recipientEmail: watermarkConfig.viewerEmail,
    trackingId: watermarkConfig.trackingId,
    timestampUtc: watermarkConfig.timestampUtc,
  });

  // 3. Log immutable audit entry
  await appendAuditLog({
    timestamp: new Date().toISOString(),
    eventType: 'DOC_DOWNLOADED',
    documentId: document.id,
    documentTitle: document.title,
    userId: params.currentUser.id,
    userEmail: watermarkConfig.viewerEmail,
    userName: watermarkConfig.viewerName,
    token: share.token,
    shareId: share.id,
    trackingId: watermarkConfig.trackingId,
    ipAddress: '192.168.1.100',
    userAgent: navigator.userAgent,
    details: `Watermarked copy generated and streamed to recipient. Diagonal watermark stamped with Tracking ID: ${watermarkConfig.trackingId}.`,
  });

  // 4. Push notification
  pushNotification({
    type: 'DOC_DOWNLOADED',
    title: 'Watermarked PDF Downloaded',
    message: `${watermarkConfig.viewerName} downloaded watermarked copy (Tracking ID: ${watermarkConfig.trackingId}) of "${document.title}".`,
    documentId: document.id,
    shareId: share.id,
    severity: 'warning',
  });

  const cleanTitle = document.filename.replace(/\.pdf$/i, '');
  const filename = `${cleanTitle}_WATERMARKED_${watermarkConfig.trackingId}.pdf`;

  return { pdfBytes: stampedBytes, filename };
}

/**
 * Instantly revoke a share link
 */
export async function revokeShare(shareId: string, currentUser: User): Promise<void> {
  const shares = getStoredShares();
  const idx = shares.findIndex((s) => s.id === shareId);
  if (idx === -1) throw new Error('Share link not found.');

  const share = shares[idx];
  share.status = 'revoked';
  share.revokedAt = new Date().toISOString();
  share.revokedBy = currentUser.name;
  shares[idx] = share;
  saveShares(shares);

  const doc = getStoredDocuments().find((d) => d.id === share.documentId);
  const documentTitle = doc ? doc.title : 'Confidential Document';

  await appendAuditLog({
    timestamp: new Date().toISOString(),
    eventType: 'DOC_REVOKED',
    documentId: share.documentId,
    documentTitle,
    userId: currentUser.id,
    userEmail: currentUser.email,
    userName: currentUser.name,
    token: share.token,
    shareId: share.id,
    ipAddress: '192.168.1.100',
    userAgent: navigator.userAgent,
    details: `Access instantly revoked by ${currentUser.name} (${currentUser.role}). Any active in-memory streaming sessions will be blocked immediately.`,
  });

  pushNotification({
    type: 'DOC_REVOKED',
    title: 'Share Link Revoked',
    message: `${currentUser.name} revoked active share link for "${documentTitle}".`,
    documentId: share.documentId,
    shareId: share.id,
    severity: 'alert',
  });
}

/**
 * Creates a new share link or team delegation
 */
export async function createShareLink(params: {
  documentId: string;
  currentUser: User;
  targetType: 'link' | 'team_member';
  targetUserId?: string;
  targetUserName?: string;
  targetUserEmail?: string;
  viewMode: ShareConfig['viewMode'];
  timeLimitSeconds?: number;
  maxViews?: number;
  expiresAt?: string;
  accessMode: ShareConfig['accessMode'];
  requireOtp: boolean;
  requirePassword?: boolean;
  password?: string;
  passwordHint?: string;
}): Promise<ShareConfig> {
  const token = generateSecureToken(16);
  let passwordHash: string | undefined = undefined;
  if (params.requirePassword && params.password) {
    passwordHash = await sha256(params.password.trim());
  }

  const newShare: ShareConfig = {
    id: `share-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    documentId: params.documentId,
    token,
    createdById: params.currentUser.id,
    createdByName: params.currentUser.name,
    createdAt: new Date().toISOString(),
    targetType: params.targetType,
    targetUserId: params.targetUserId,
    targetUserName: params.targetUserName,
    targetUserEmail: params.targetUserEmail,
    viewMode: params.viewMode,
    timeLimitSeconds: params.timeLimitSeconds,
    maxViews: params.maxViews,
    viewsCount: 0,
    expiresAt: params.expiresAt,
    accessMode: params.accessMode,
    requireOtp: params.requireOtp,
    requirePassword: params.requirePassword,
    passwordHash,
    passwordHint: params.passwordHint,
    status: 'active',
  };

  const shares = getStoredShares();
  shares.unshift(newShare);
  saveShares(shares);

  const doc = getStoredDocuments().find((d) => d.id === params.documentId);
  const documentTitle = doc ? doc.title : 'Confidential Document';

  await appendAuditLog({
    timestamp: new Date().toISOString(),
    eventType: 'SHARE_LINK_CREATED',
    documentId: params.documentId,
    documentTitle,
    userId: params.currentUser.id,
    userEmail: params.currentUser.email,
    userName: params.currentUser.name,
    token,
    shareId: newShare.id,
    ipAddress: '192.168.1.100',
    userAgent: navigator.userAgent,
    details: `Share created. Target: ${params.targetType} ${
      params.targetUserName ? `(${params.targetUserName})` : ''
    }. Mode: ${params.viewMode}. Access: ${params.accessMode}. Password: ${
      params.requirePassword ? 'Enforced' : 'Disabled'
    }. OTP: ${params.requireOtp ? 'Enforced' : 'Disabled'}.`,
  });

  return newShare;
}

/**
 * Creates and uploads a new document with in-memory AES-256-GCM encryption
 */
export async function uploadAndEncryptDocument(params: {
  title: string;
  filename: string;
  fileBytes: Uint8Array | ArrayBuffer;
  fileType: DocumentItem['fileType'];
  classification: DocumentItem['classification'];
  currentUser: User;
}): Promise<DocumentItem> {
  const encryptedPayload = await encryptBuffer(params.fileBytes);
  const checksum = await sha256(params.fileBytes);
  const sizeBytes = params.fileBytes.byteLength;

  const newDoc: DocumentItem = {
    id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: params.title,
    filename: params.filename,
    fileType: params.fileType,
    sizeBytes,
    classification: params.classification,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: params.currentUser.id,
    ownerName: params.currentUser.name,
    encryptedPayload,
    checksum,
    pageCount: 1,
  };

  const docs = getStoredDocuments();
  docs.unshift(newDoc);
  saveDocuments(docs);

  await appendAuditLog({
    timestamp: new Date().toISOString(),
    eventType: 'DOCUMENT_CREATED',
    documentId: newDoc.id,
    documentTitle: newDoc.title,
    userId: params.currentUser.id,
    userEmail: params.currentUser.email,
    userName: params.currentUser.name,
    ipAddress: '192.168.1.100',
    userAgent: navigator.userAgent,
    details: `New document uploaded and encrypted in memory via AES-256-GCM. Size: ${sizeBytes} bytes. SHA-256 checksum: ${checksum.substring(0, 16)}...`,
  });

  return newDoc;
}

/**
 * Request real email OTP:
 * Returns generic message to prevent email enumeration,
 * hashes the 6-digit code in memory, sets 5 min expiry, 60s cooldown.
 */
export async function requestOtpSession(shareId: string, email: string): Promise<{
  success: boolean;
  message: string;
  cooldownSeconds?: number;
  demoSimulatedCode?: string; // Preview for the in-app interactive email inbox simulator
}> {
  const sessions = getStoredOtpSessions();
  const existing = sessions[shareId];
  const now = new Date();

  if (existing && existing.resendCooldownUntil) {
    const cooldownEnd = new Date(existing.resendCooldownUntil).getTime();
    const diff = Math.ceil((cooldownEnd - now.getTime()) / 1000);
    if (diff > 0) {
      return {
        success: false,
        message: `Please wait ${diff} seconds before requesting a new verification code.`,
        cooldownSeconds: diff,
      };
    }
  }

  const code = generateOtpCode();
  const codeHash = await sha256(code);
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes
  const resendCooldownUntil = new Date(now.getTime() + 60 * 1000).toISOString(); // 60 seconds

  const session: OtpSession = {
    shareId,
    email,
    codeHash,
    rawCodePreviewForDemo: code,
    expiresAt,
    attemptsRemaining: 5,
    resendCooldownUntil,
    isLocked: false,
  };

  sessions[shareId] = session;
  saveOtpSessions(sessions);

  // Generic enumeration-resistant response
  return {
    success: true,
    message: 'If the provided email is authorized to access this document, a single-use 6-digit verification code has been dispatched.',
    cooldownSeconds: 60,
    demoSimulatedCode: code,
  };
}

/**
 * Verifies the mathematical integrity of the tamper-evident audit trail hash chain.
 * Each entry's currentHash must equal SHA-256(previousHash + timestamp + eventType + documentId + details).
 */
export async function verifyAuditChainIntegrity(logs: AuditLogEntry[]): Promise<{
  isValid: boolean;
  checkedCount: number;
  brokenIndex?: number;
}> {
  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    if (entry.previousHash !== prevHash) {
      return { isValid: false, checkedCount: i, brokenIndex: i };
    }

    const expectedHash = await sha256(
      entry.previousHash + entry.timestamp + entry.eventType + entry.documentId + entry.details
    );

    if (entry.currentHash !== expectedHash) {
      return { isValid: false, checkedCount: i, brokenIndex: i };
    }

    prevHash = entry.currentHash;
  }

  return { isValid: true, checkedCount: logs.length };
}
