import {
  User,
  DocumentItem,
  ShareConfig,
  AuditLogEntry,
  NotificationItem,
  OtpSession,
} from '../types';
import { encryptBuffer, sha256 } from './crypto';
import { createSamplePdf } from './pdfWatermark';

export const SYSTEM_USERS: User[] = [
  {
    id: 'usr-admin-elena',
    name: 'Elena Rostova',
    email: 'elena.rostova@acme-corp.internal',
    role: 'admin',
    department: 'Engineering & Information Security',
  },
  {
    id: 'usr-mgr-marcus',
    name: 'Marcus Vance',
    email: 'marcus.vance@acme-corp.internal',
    role: 'manager',
    department: 'Engineering & Information Security',
    managerId: 'usr-admin-elena',
  },
  {
    id: 'usr-mgr-diana',
    name: 'Diana Prince',
    email: 'diana.prince@acme-corp.internal',
    role: 'manager',
    department: 'Engineering & Information Security',
    managerId: 'usr-admin-elena',
  },
  {
    id: 'usr-emp-sarah',
    name: 'Sarah Chen',
    email: 'sarah.chen@acme-corp.internal',
    role: 'employee',
    department: 'Engineering & Information Security',
    managerId: 'usr-mgr-marcus',
  },
  {
    id: 'usr-emp-david',
    name: 'David Kim',
    email: 'david.kim@acme-corp.internal',
    role: 'employee',
    department: 'Engineering & Information Security',
    managerId: 'usr-mgr-marcus',
  },
  {
    id: 'usr-emp-alex',
    name: 'Alex Rivera',
    email: 'alex.rivera@acme-corp.internal',
    role: 'employee',
    department: 'Engineering & Information Security',
    managerId: 'usr-mgr-diana',
  },
];

/**
 * Checks whether user `sender` is permitted to share documents to `target`
 * Rules:
 * - Admin can share to anyone in department
 * - Manager can share to direct reports and their own Admin
 * - Employees cannot initiate shares
 */
export function canUserShareTo(sender: User, target: User): { allowed: boolean; reason?: string } {
  if (sender.role === 'employee') {
    return {
      allowed: false,
      reason: 'Role restriction: Employees do not possess document sharing delegation privileges.',
    };
  }

  if (sender.role === 'admin') {
    return { allowed: true };
  }

  if (sender.role === 'manager') {
    // Can share to direct reports
    if (target.managerId === sender.id) {
      return { allowed: true };
    }
    // Can share to their own admin
    if (sender.managerId === target.id) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Manager delegation boundary: You can only share with direct reports or your department head (${SYSTEM_USERS.find(u => u.id === sender.managerId)?.name}).`,
    };
  }

  return { allowed: false, reason: 'Unauthorized role.' };
}

/**
 * Returns list of team members a given user is authorized to share with
 */
export function getAuthorizedRecipients(sender: User): User[] {
  if (sender.role === 'employee') return [];
  if (sender.role === 'admin') {
    return SYSTEM_USERS.filter((u) => u.id !== sender.id);
  }
  if (sender.role === 'manager') {
    return SYSTEM_USERS.filter(
      (u) => (u.managerId === sender.id || u.id === sender.managerId) && u.id !== sender.id
    );
  }
  return [];
}

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'haven_vault_current_user_id',
  DOCUMENTS: 'haven_vault_documents_v2',
  SHARES: 'haven_vault_shares_v2',
  AUDIT_LOGS: 'haven_vault_audit_logs_v2',
  NOTIFICATIONS: 'haven_vault_notifications_v2',
  OTP_SESSIONS: 'haven_vault_otp_sessions_v2',
};

/**
 * Initialize default seed data with real in-memory encrypted PDFs
 */
export async function initializeSeedData(): Promise<{
  documents: DocumentItem[];
  shares: ShareConfig[];
  auditLogs: AuditLogEntry[];
  notifications: NotificationItem[];
}> {
  // Check if already in localStorage
  const existingDocs = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
  const existingShares = localStorage.getItem(STORAGE_KEYS.SHARES);
  const existingLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
  const existingNotifs = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);

  if (existingDocs && existingShares && existingLogs && existingNotifs) {
    try {
      return {
        documents: JSON.parse(existingDocs),
        shares: JSON.parse(existingShares),
        auditLogs: JSON.parse(existingLogs),
        notifications: JSON.parse(existingNotifs),
      };
    } catch {
      // In case of parsing error, proceed to reseed
    }
  }

  // 1. Create sample PDF 1: Restructuring & Compensation Matrix
  const pdfBytes1 = await createSamplePdf(
    'Q3 Strategic Restructuring & Executive Comp Matrix',
    [
      {
        heading: 'Executive Summary & Confidentiality Directive',
        paragraphs: [
          'This memorandum contains classified corporate restructuring proposals, planned engineering team realignment, and executive compensation adjustments for Q3/Q4. Dissemination outside the Compensation & Governance Committee is strictly prohibited.',
          'All access, screen renderings, and downloads are cryptographically watermarked with recipient identity, session tracking hash, and exact UTC timestamp for leak attribution.',
        ],
      },
      {
        heading: '1. Department Realignment & Headcount Allocations',
        paragraphs: [
          'Platform Infrastructure and Cryptographic Services will be consolidated under unified Engineering Direction. Targeted net reduction in redundant administrative overhead will fund 18 senior cryptographic engineering requisitions.',
          'Transition milestones: Phase 1 starts on the 1st of next month; full leadership sign-off required within 14 calendar days.',
        ],
      },
      {
        heading: '2. Executive Compensation Bands (Confidential)',
        paragraphs: [
          'L7 Staff Principal Engineer base band adjusted to $245,000 - $310,000 with 40% equity weighting.',
          'Retention grants approved for key infrastructure custodians under Schedule C covenants.',
        ],
      },
    ]
  );

  // 2. Create sample PDF 2: Project Aegis - M&A Due Diligence
  const pdfBytes2 = await createSamplePdf(
    'Project Aegis - M&A Due Diligence & Technical Valuation',
    [
      {
        heading: 'Acquisition Target Analysis',
        paragraphs: [
          'Project Aegis encompasses the potential strategic asset acquisition of CipherMatrix Corp. This document includes proprietary intellectual property audits, zero-knowledge verification patents, and valuation scenarios ranging from $42M to $58M.',
        ],
      },
      {
        heading: 'Technical Architecture Evaluation',
        paragraphs: [
          'CipherMatrix infrastructure exhibits high compliance with SOC2 Type II and FedRAMP High baselines. Cryptographic primitives have been audited by independent cryptanalysis contractors with zero critical vulnerabilities reported.',
        ],
      },
    ]
  );

  // 3. Create sample PDF 3: NDA Partner Tier
  const pdfBytes3 = await createSamplePdf(
    'Mutual Non-Disclosure Agreement (Partner Tier)',
    [
      {
        heading: 'Standard Confidentiality Covenants',
        paragraphs: [
          'The Receiving Party shall safeguard all Proprietary Material with at least the degree of care it exercises with respect to its own sensitive information of like nature, but not less than reasonable care.',
          'Term of non-disclosure shall remain in full force for three (3) years from date of execution.',
        ],
      },
    ]
  );

  // 4. Create sample PDF 4: Security Architecture SOP
  const pdfBytes4 = await createSamplePdf(
    'Cryptographic Key Management SOP & Zero-Disk Architecture',
    [
      {
        heading: 'Standard Operating Procedure: Ephemeral Key Lifetime',
        paragraphs: [
          'Document encryption keys are derived through PBKDF2 with 100,000 iterations and 16-byte random salts. Ciphertexts are encrypted using AES-256 in Galois/Counter Mode (GCM).',
          'Decrypted buffers are maintained strictly in volatile heap space (io.BytesIO / ArrayBuffer) and zeroed out upon session termination or client disconnect.',
        ],
      },
    ]
  );

  // Encrypt each PDF in memory into encrypted payloads
  const enc1 = await encryptBuffer(pdfBytes1);
  const enc2 = await encryptBuffer(pdfBytes2);
  const enc3 = await encryptBuffer(pdfBytes3);
  const enc4 = await encryptBuffer(pdfBytes4);

  const checksum1 = await sha256(pdfBytes1);
  const checksum2 = await sha256(pdfBytes2);
  const checksum3 = await sha256(pdfBytes3);
  const checksum4 = await sha256(pdfBytes4);

  const now = new Date();
  const isoNow = now.toISOString();

  const documents: DocumentItem[] = [
    {
      id: 'doc-001',
      title: 'Q3 Strategic Restructuring & Comp Matrix',
      filename: 'Q3_Restructuring_CompMatrix_Confidential.pdf',
      fileType: 'pdf',
      sizeBytes: pdfBytes1.byteLength,
      classification: 'Strictly Confidential',
      createdAt: new Date(now.getTime() - 86400000 * 2).toISOString(),
      updatedAt: new Date(now.getTime() - 86400000 * 2).toISOString(),
      ownerId: 'usr-admin-elena',
      ownerName: 'Elena Rostova',
      encryptedPayload: enc1,
      checksum: checksum1,
      pageCount: 1,
    },
    {
      id: 'doc-002',
      title: 'Project Aegis - M&A Technical Valuation',
      filename: 'Project_Aegis_MA_Valuation_v4.pdf',
      fileType: 'pdf',
      sizeBytes: pdfBytes2.byteLength,
      classification: 'Strictly Confidential',
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 86400000).toISOString(),
      ownerId: 'usr-admin-elena',
      ownerName: 'Elena Rostova',
      encryptedPayload: enc2,
      checksum: checksum2,
      pageCount: 1,
    },
    {
      id: 'doc-003',
      title: 'Mutual Non-Disclosure Agreement (Partner Tier)',
      filename: 'NDA_Executive_PartnerTier_2026.pdf',
      fileType: 'pdf',
      sizeBytes: pdfBytes3.byteLength,
      classification: 'Confidential',
      createdAt: new Date(now.getTime() - 3600000 * 6).toISOString(),
      updatedAt: new Date(now.getTime() - 3600000 * 6).toISOString(),
      ownerId: 'usr-mgr-marcus',
      ownerName: 'Marcus Vance',
      encryptedPayload: enc3,
      checksum: checksum3,
      pageCount: 1,
    },
    {
      id: 'doc-004',
      title: 'Cryptographic Key Management SOP',
      filename: 'SOP_Crypto_KeyManagement_ZeroDisk.pdf',
      fileType: 'pdf',
      sizeBytes: pdfBytes4.byteLength,
      classification: 'Internal Only',
      createdAt: new Date(now.getTime() - 3600000 * 2).toISOString(),
      updatedAt: new Date(now.getTime() - 3600000 * 2).toISOString(),
      ownerId: 'usr-emp-sarah',
      ownerName: 'Sarah Chen',
      encryptedPayload: enc4,
      checksum: checksum4,
      pageCount: 1,
    },
  ];

  // Seed initial Shares
  const shares: ShareConfig[] = [
    {
      id: 'share-time-10m',
      documentId: 'doc-001',
      token: 'tok-time-limited-sample-10m',
      createdById: 'usr-admin-elena',
      createdByName: 'Elena Rostova',
      createdAt: new Date(now.getTime() - 1800000).toISOString(),
      targetType: 'link',
      viewMode: 'time_limited',
      timeLimitSeconds: 600, // 10 minutes
      viewsCount: 0,
      accessMode: 'viewer_only',
      requireOtp: false,
      status: 'active',
    },
    {
      id: 'share-view-once',
      documentId: 'doc-002',
      token: 'tok-view-once-sample-nda',
      createdById: 'usr-admin-elena',
      createdByName: 'Elena Rostova',
      createdAt: new Date(now.getTime() - 3600000).toISOString(),
      targetType: 'link',
      viewMode: 'view_once',
      maxViews: 1,
      viewsCount: 0,
      accessMode: 'allow_download',
      requireOtp: true,
      status: 'active',
    },
    {
      id: 'share-team-marcus',
      documentId: 'doc-001',
      token: 'tok-team-share-marcus-comp',
      createdById: 'usr-admin-elena',
      createdByName: 'Elena Rostova',
      createdAt: new Date(now.getTime() - 7200000).toISOString(),
      targetType: 'team_member',
      targetUserId: 'usr-mgr-marcus',
      targetUserName: 'Marcus Vance',
      targetUserEmail: 'marcus.vance@acme-corp.internal',
      viewMode: 'time_limited',
      timeLimitSeconds: 1800, // 30 minutes
      viewsCount: 1,
      firstOpenedAt: new Date(now.getTime() - 600000).toISOString(),
      accessMode: 'viewer_only',
      requireOtp: false,
      status: 'active',
      lastAccessedAt: new Date(now.getTime() - 600000).toISOString(),
    },
    {
      id: 'share-password-protected-sample',
      documentId: 'doc-002',
      token: 'tok-password-protected-sample',
      createdById: 'usr-admin-elena',
      createdByName: 'Elena Rostova',
      createdAt: new Date(now.getTime() - 900000).toISOString(),
      targetType: 'link',
      viewMode: 'time_limited',
      timeLimitSeconds: 1800, // 30 minutes
      viewsCount: 0,
      accessMode: 'viewer_only',
      requireOtp: false,
      requirePassword: true,
      passwordHash: await sha256('Aegis-2026'),
      passwordHint: 'Target acquisition codename and year (e.g. Aegis-2026)',
      status: 'active',
    },
    {
      id: 'share-revoked-demo',
      documentId: 'doc-003',
      token: 'tok-revoked-sample-demo',
      createdById: 'usr-mgr-marcus',
      createdByName: 'Marcus Vance',
      createdAt: new Date(now.getTime() - 14400000).toISOString(),
      targetType: 'link',
      viewMode: 'unlimited',
      viewsCount: 2,
      accessMode: 'viewer_only',
      requireOtp: false,
      status: 'revoked',
      revokedAt: new Date(now.getTime() - 3600000).toISOString(),
      revokedBy: 'Marcus Vance',
    },
  ];

  // Seed immutable Audit Logs with SHA-256 hash chaining
  const genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';
  let prevHash = genesisHash;

  const rawAuditEntries = [
    {
      id: 'log-001',
      timestamp: new Date(now.getTime() - 86400000 * 2).toISOString(),
      eventType: 'DOCUMENT_CREATED' as const,
      documentId: 'doc-001',
      documentTitle: 'Q3 Strategic Restructuring & Comp Matrix',
      userId: 'usr-admin-elena',
      userEmail: 'elena.rostova@acme-corp.internal',
      userName: 'Elena Rostova',
      ipAddress: '192.168.10.42',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      details: 'Document uploaded and encrypted in memory using AES-256-GCM. Salt: 16B, IV: 12B.',
    },
    {
      id: 'log-002',
      timestamp: new Date(now.getTime() - 7200000).toISOString(),
      eventType: 'SHARE_LINK_CREATED' as const,
      documentId: 'doc-001',
      documentTitle: 'Q3 Strategic Restructuring & Comp Matrix',
      userId: 'usr-admin-elena',
      userEmail: 'elena.rostova@acme-corp.internal',
      userName: 'Elena Rostova',
      token: 'tok-team-share-marcus-comp',
      shareId: 'share-team-marcus',
      ipAddress: '192.168.10.42',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      details: 'Internal role-locked share granted to Marcus Vance (Engineering Manager). Mode: 30m Time-Limited.',
    },
    {
      id: 'log-003',
      timestamp: new Date(now.getTime() - 600000).toISOString(),
      eventType: 'DOC_OPENED' as const,
      documentId: 'doc-001',
      documentTitle: 'Q3 Strategic Restructuring & Comp Matrix',
      userId: 'usr-mgr-marcus',
      userEmail: 'marcus.vance@acme-corp.internal',
      userName: 'Marcus Vance',
      token: 'tok-team-share-marcus-comp',
      shareId: 'share-team-marcus',
      ipAddress: '192.168.12.108',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0.0.0',
      details: 'First open recorded. 30-minute server countdown initiated. In-app tiled watermark applied.',
    },
    {
      id: 'log-004',
      timestamp: new Date(now.getTime() - 3600000).toISOString(),
      eventType: 'DOC_REVOKED' as const,
      documentId: 'doc-003',
      documentTitle: 'Mutual Non-Disclosure Agreement (Partner Tier)',
      userId: 'usr-mgr-marcus',
      userEmail: 'marcus.vance@acme-corp.internal',
      userName: 'Marcus Vance',
      token: 'tok-revoked-sample-demo',
      shareId: 'share-revoked-demo',
      ipAddress: '192.168.12.108',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0.0.0',
      details: 'Instant cutoff executed by sender. Link invalidated across all active client sockets.',
    },
  ];

  const auditLogs: AuditLogEntry[] = [];
  for (const entry of rawAuditEntries) {
    const hash = await sha256(
      prevHash + entry.timestamp + entry.eventType + entry.documentId + entry.details
    );
    auditLogs.push({
      ...entry,
      previousHash: prevHash,
      currentHash: hash,
    });
    prevHash = hash;
  }

  // Seed Notifications
  const notifications: NotificationItem[] = [
    {
      id: 'notif-001',
      timestamp: new Date(now.getTime() - 600000).toISOString(),
      type: 'DOC_OPENED',
      title: 'Confidential Document Opened',
      message: 'Marcus Vance opened "Q3 Strategic Restructuring & Comp Matrix". 30m countdown started.',
      read: false,
      documentId: 'doc-001',
      shareId: 'share-team-marcus',
      severity: 'info',
    },
    {
      id: 'notif-002',
      timestamp: new Date(now.getTime() - 3600000).toISOString(),
      type: 'DOC_REVOKED',
      title: 'Share Access Revoked',
      message: 'Marcus Vance revoked share link for "Mutual Non-Disclosure Agreement (Partner Tier)".',
      read: true,
      documentId: 'doc-003',
      shareId: 'share-revoked-demo',
      severity: 'warning',
    },
  ];

  // Save to localStorage
  localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(documents));
  localStorage.setItem(STORAGE_KEYS.SHARES, JSON.stringify(shares));
  localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));

  return { documents, shares, auditLogs, notifications };
}
