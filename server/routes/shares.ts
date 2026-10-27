import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import {
  hashShareToken,
  decryptDocumentBuffer,
  createViewerSessionToken,
  verifyViewerSessionToken,
} from '../services/crypto';
import { logAuditEvent } from '../services/audit';
import { createNotification } from '../services/notification';
import { sendEmail } from '../services/email';
import { canShare } from '../services/permissions';
import { stampWatermarkedPdf, stampWatermarkedText } from '../services/watermark';

export const sharesRouter = Router();

// ============================================================================
// 1. Authenticated Sender Endpoints
// ============================================================================

const CreateShareSchema = z.object({
  documentId: z.string().min(1),
  shareScope: z.enum(['external_link', 'internal_user']),
  recipientEmail: z.string().email().optional(),
  sharedWithUserId: z.string().optional(),
  accessType: z.enum(['view_once', 'time_limited', 'standard']),
  durationSeconds: z.number().int().min(10).max(86400).optional(),
  maxViews: z.number().int().min(1).max(100).optional(),
  expiresAt: z.string().datetime().optional(),
  allowDownload: z.boolean().default(false),
  password: z.string().min(1).max(100).optional(),
});

/**
 * Helper to compute live share status
 */
function computeShareStatus(share: any): 'active' | 'expired' | 'revoked' | 'used' {
  if (share.revoked) return 'revoked';

  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return 'expired';
  }

  if (share.max_views && share.view_count >= share.max_views) {
    return 'used';
  }

  if (share.access_type === 'view_once' && share.view_count >= 1) {
    return 'used';
  }

  if (share.access_type === 'time_limited' && share.first_opened_at && share.duration_seconds) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(share.first_opened_at).getTime()) / 1000);
    if (elapsedSeconds >= share.duration_seconds) {
      return 'expired';
    }
  }

  return 'active';
}

/**
 * GET /api/shares
 * Returns all shares created by the authenticated user
 */
sharesRouter.get('/', requireAuth, (req, res) => {
  const user = req.user!;
  const rows = db
    .prepare(`
      SELECT s.*, d.title as document_title, d.file_type as document_file_type, d.classification as document_classification
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      WHERE s.created_by = ?
      ORDER BY datetime(s.created_at) DESC
    `)
    .all(user.id) as any[];

  const shares = rows.map((s) => {
    const status = computeShareStatus(s);
    let remainingSeconds: number | null = null;
    if (s.access_type === 'time_limited' && s.duration_seconds) {
      if (s.first_opened_at) {
        const elapsed = Math.floor((Date.now() - new Date(s.first_opened_at).getTime()) / 1000);
        remainingSeconds = Math.max(0, s.duration_seconds - elapsed);
      } else {
        remainingSeconds = s.duration_seconds;
      }
    }

    return {
      id: s.id,
      documentId: s.document_id,
      documentTitle: s.document_title,
      documentFileType: s.document_file_type,
      documentClassification: s.document_classification,
      createdBy: s.created_by,
      shareScope: s.share_scope,
      sharedWithUserId: s.shared_with_user_id,
      recipientEmail: s.recipient_email,
      accessType: s.access_type,
      durationSeconds: s.duration_seconds,
      remainingSeconds,
      maxViews: s.max_views,
      viewCount: s.view_count,
      expiresAt: s.expires_at,
      firstOpenedAt: s.first_opened_at,
      allowDownload: Boolean(s.allow_download),
      hasPassword: Boolean(s.password_hash),
      revoked: Boolean(s.revoked),
      status,
      createdAt: s.created_at,
    };
  });

  res.json({ shares });
});

/**
 * GET /api/shares/document/:documentId
 * Returns shares for a specific document owned by user
 */
sharesRouter.get('/document/:documentId', requireAuth, (req, res) => {
  const user = req.user!;
  const doc = db
    .prepare('SELECT id, title FROM documents WHERE id = ? AND owner_id = ?')
    .get(req.params.documentId, user.id);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found or access denied' });
  }

  const rows = db
    .prepare('SELECT * FROM shares WHERE document_id = ? ORDER BY datetime(created_at) DESC')
    .all(req.params.documentId) as any[];

  res.json({
    shares: rows.map((s) => ({
      ...s,
      allowDownload: Boolean(s.allow_download),
      hasPassword: Boolean(s.password_hash),
      revoked: Boolean(s.revoked),
      status: computeShareStatus(s),
    })),
  });
});

/**
 * GET /api/shares/shared-with-me
 * Returns documents actively shared with the current authenticated user
 */
sharesRouter.get('/shared-with-me', requireAuth, (req, res) => {
  const user = req.user!;
  const rows = db
    .prepare(`
      SELECT s.*, d.title as document_title, d.file_type as document_file_type,
             d.classification as document_classification, d.size_bytes as document_size_bytes,
             u.name as sender_name, u.email as sender_email
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      JOIN users u ON s.created_by = u.id
      WHERE (s.shared_with_user_id = ? OR s.recipient_email = ?)
      ORDER BY datetime(s.created_at) DESC
    `)
    .all(user.id, user.email) as any[];

  const sharedWithMe = rows.map((s) => ({
    id: s.id,
    documentId: s.document_id,
    documentTitle: s.document_title,
    documentFileType: s.document_file_type,
    documentClassification: s.document_classification,
    documentSizeBytes: s.document_size_bytes,
    senderName: s.sender_name,
    senderEmail: s.sender_email,
    accessType: s.access_type,
    durationSeconds: s.duration_seconds,
    maxViews: s.max_views,
    viewCount: s.view_count,
    expiresAt: s.expires_at,
    allowDownload: Boolean(s.allow_download),
    hasPassword: Boolean(s.password_hash),
    status: computeShareStatus(s),
    createdAt: s.created_at,
  }));

  res.json({ shares: sharedWithMe });
});

/**
 * POST /api/shares
 * Create a new protected share link
 */
sharesRouter.post('/', requireAuth, async (req, res) => {
  try {
    const parsed = CreateShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const {
      documentId,
      shareScope,
      recipientEmail,
      sharedWithUserId,
      accessType,
      durationSeconds,
      maxViews,
      expiresAt,
      allowDownload,
      password,
    } = parsed.data;

    const user = req.user!;

    // 1. Verify sender owns document
    const doc = db
      .prepare('SELECT id, title, classification FROM documents WHERE id = ? AND owner_id = ?')
      .get(documentId, user.id) as any;

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or you do not have permission to share it' });
    }

    // 2. If internal user share, verify organizational hierarchy permissions
    if (shareScope === 'internal_user') {
      if (!sharedWithUserId) {
        return res.status(400).json({ error: 'sharedWithUserId is required for internal sharing' });
      }

      const recipientUser = db
        .prepare('SELECT id, name, email, role, department, manager_id, is_active, created_at FROM users WHERE id = ?')
        .get(sharedWithUserId) as any;

      if (!recipientUser) {
        return res.status(400).json({ error: 'Recipient user not found' });
      }

      if (!canShare(user as any, recipientUser)) {
        return res.status(403).json({
          error: `Organization policy violation: ${user.role} (${user.department}) is not permitted to share documents with ${recipientUser.name} (${recipientUser.role}, ${recipientUser.department})`,
        });
      }
    }

    // 3. Generate 32-byte cryptographically secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashShareToken(token);

    // 4. Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const shareId = `share_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO shares (
        id, document_id, created_by, share_scope, shared_with_user_id,
        recipient_email, share_token_hash, access_type, duration_seconds,
        max_views, view_count, expires_at, first_opened_at, allow_download,
        password_hash, revoked, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, 0, ?)
    `).run(
      shareId,
      documentId,
      user.id,
      shareScope,
      sharedWithUserId || null,
      recipientEmail || null,
      tokenHash,
      accessType,
      accessType === 'time_limited' ? durationSeconds || 600 : null,
      accessType === 'view_once' ? 1 : maxViews || null,
      expiresAt || null,
      allowDownload ? 1 : 0,
      passwordHash,
      now
    );

    // Audit log
    logAuditEvent({
      eventType: 'SHARE_CREATED',
      actorId: user.id,
      actorEmail: user.email,
      targetType: 'share',
      targetId: shareId,
      documentId,
      shareId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        documentTitle: doc.title,
        shareScope,
        recipientEmail: recipientEmail || (sharedWithUserId ? 'internal' : 'anonymous'),
        accessType,
        durationSeconds,
        maxViews,
        allowDownload,
        hasPassword: Boolean(password),
      },
    });

    const appUrl = process.env.APP_URL || '';
    const shareUrl = `${appUrl}/#/share/${token}`;

    res.status(201).json({
      success: true,
      share: {
        id: shareId,
        documentId,
        token, // ONLY returned once upon creation!
        shareUrl,
        shareScope,
        recipientEmail,
        accessType,
        durationSeconds,
        maxViews,
        expiresAt,
        allowDownload,
        hasPassword: Boolean(password),
        createdAt: now,
      },
    });
  } catch (err: any) {
    console.error('[Create Share Error]', err);
    res.status(500).json({ error: err.message || 'Internal server error creating share' });
  }
});

/**
 * POST /api/shares/:id/revoke
 * Instantly revoke access to a share link
 */
sharesRouter.post('/:id/revoke', requireAuth, (req, res) => {
  const user = req.user!;
  const share = db
    .prepare(`
      SELECT s.*, d.title as document_title
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      WHERE s.id = ? AND s.created_by = ?
    `)
    .get(req.params.id, user.id) as any;

  if (!share) {
    return res.status(404).json({ error: 'Share link not found or you do not have permission to revoke it' });
  }

  db.prepare('UPDATE shares SET revoked = 1 WHERE id = ?').run(share.id);

  logAuditEvent({
    eventType: 'ACCESS_REVOKED',
    actorId: user.id,
    actorEmail: user.email,
    targetType: 'share',
    targetId: share.id,
    documentId: share.document_id,
    shareId: share.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: {
      documentTitle: share.document_title,
      reason: 'Sender revoked access manually',
    },
  });

  res.json({ success: true, message: 'Share link revoked immediately' });
});

// ============================================================================
// 2. Recipient In-App Viewer & Access Control Flow (Token-based)
// ============================================================================

/**
 * POST or GET /api/shares/access/init
 * Step 1 of viewing: Recipient submits token to inspect access requirements (OTP, Password)
 */
sharesRouter.all('/access/init', async (req, res) => {
  const token = (req.body?.token || req.query?.token) as string;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Share token is required' });
  }

  const tokenHash = hashShareToken(token);
  const share = db
    .prepare(`
      SELECT s.*, d.title as doc_title, d.file_type as doc_file_type, d.classification as doc_classification,
             u.name as sender_name, u.email as sender_email
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      JOIN users u ON s.created_by = u.id
      WHERE s.share_token_hash = ?
    `)
    .get(tokenHash) as any;

  if (!share) {
    logAuditEvent({
      eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { reason: 'Invalid or forged share token' },
    });
    return res.status(404).json({ error: 'Share link not found or has been removed' });
  }

  // Check Revoked
  if (share.revoked) {
    logAuditEvent({
      eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      targetId: share.id,
      documentId: share.document_id,
      shareId: share.id,
      ipAddress: req.ip,
      metadata: { reason: 'Attempt to access revoked share' },
    });
    return res.status(403).json({ error: 'Access to this document has been revoked by the sender', code: 'REVOKED' });
  }

  // Check Expiry Date
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    logAuditEvent({
      eventType: 'DOC_EXPIRED',
      targetId: share.id,
      documentId: share.document_id,
      shareId: share.id,
      ipAddress: req.ip,
      metadata: { reason: 'Calendar cutoff reached' },
    });
    return res.status(403).json({ error: 'This secure link has reached its expiration date', code: 'EXPIRED' });
  }

  // Check Max Views / View Once
  if (share.access_type === 'view_once' && share.view_count >= 1) {
    return res.status(403).json({ error: 'This is a view-once document and has already been accessed', code: 'VIEW_ONCE_USED' });
  }

  if (share.max_views && share.view_count >= share.max_views) {
    return res.status(403).json({ error: `This link has exceeded its maximum view limit (${share.max_views} views)`, code: 'MAX_VIEWS_EXCEEDED' });
  }

  // Check Time-Limited expiration
  if (share.access_type === 'time_limited' && share.first_opened_at && share.duration_seconds) {
    const elapsed = Math.floor((Date.now() - new Date(share.first_opened_at).getTime()) / 1000);
    if (elapsed >= share.duration_seconds) {
      return res.status(403).json({ error: 'The authorized viewing time window has expired', code: 'TIME_EXPIRED' });
    }
  }

  const requiresPassword = Boolean(share.password_hash);
  const requiresOtp = Boolean(share.recipient_email);

  // If requires OTP: generate cryptographic 6-digit code and dispatch email
  if (requiresOtp && share.recipient_email) {
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const otpId = `otp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const nowMs = Date.now();
    const expiresAtMs = nowMs + 10 * 60 * 1000; // 10 minutes

    // Invalidate prior unconsumed OTPs for this share
    db.prepare('UPDATE share_otps SET consumed = 1 WHERE share_id = ? AND consumed = 0').run(share.id);

    db.prepare(`
      INSERT INTO share_otps (id, share_id, email, code_hash, attempts, locked_until, expires_at, consumed, created_at)
      VALUES (?, ?, ?, ?, 0, 0, ?, 0, ?)
    `).run(otpId, share.id, share.recipient_email, codeHash, expiresAtMs, nowMs);

    // Send real email - notice code is NEVER exposed in the API response or logs
    await sendEmail({
      to: share.recipient_email,
      subject: `HavenVault Verification Code for "${share.doc_title}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Access Verification Required</h2>
          <p style="color: #475569;">You have been sent a secure, confidential document: <strong>${share.doc_title}</strong>.</p>
          <p style="color: #475569;">Your one-time verification passcode is:</p>
          <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0f172a;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 13px; margin-top: 20px;">This code will expire in 10 minutes. If you did not request this access, you can ignore this email.</p>
        </div>
      `,
    });
  }

  // Mask recipient email for display (e.g., s***h@example.com)
  let maskedEmail = null;
  if (share.recipient_email) {
    const [local, domain] = share.recipient_email.split('@');
    maskedEmail = `${local[0]}***${local.slice(-1)}@${domain}`;
  }

  res.json({
    shareId: share.id,
    docTitle: share.doc_title,
    fileType: share.doc_file_type,
    classification: share.doc_classification,
    senderName: share.sender_name,
    accessType: share.access_type,
    durationSeconds: share.duration_seconds,
    firstOpenedAt: share.first_opened_at,
    expiresAt: share.expires_at,
    requiresPassword,
    requiresOtp,
    recipientEmailMasked: maskedEmail,
  });
});

/**
 * POST /api/shares/access/verify
 * Step 2 of viewing: Submit Password and/or OTP to acquire an authorized viewer session
 */
sharesRouter.post('/access/verify', async (req, res) => {
  const { token, password, otpCode } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Share token is required' });
  }

  const tokenHash = hashShareToken(token);
  const share = db
    .prepare(`
      SELECT s.*, d.title as doc_title, d.file_type as doc_file_type, d.classification as doc_classification,
             u.id as owner_id, u.email as owner_email
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      JOIN users u ON s.created_by = u.id
      WHERE s.share_token_hash = ?
    `)
    .get(tokenHash) as any;

  if (!share || share.revoked) {
    return res.status(403).json({ error: 'Access revoked or invalid token' });
  }

  // Verify Password if required
  if (share.password_hash) {
    if (!password) {
      return res.status(400).json({ error: 'Password required to unlock this document' });
    }
    const passMatch = await bcrypt.compare(password, share.password_hash);
    if (!passMatch) {
      logAuditEvent({
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        shareId: share.id,
        documentId: share.document_id,
        ipAddress: req.ip,
        metadata: { reason: 'Incorrect document password entered' },
      });
      return res.status(401).json({ error: 'Incorrect document password' });
    }
  }

  // Verify OTP if required
  if (share.recipient_email) {
    if (!otpCode || typeof otpCode !== 'string') {
      return res.status(400).json({ error: 'Verification OTP code required' });
    }

    const activeOtp = db
      .prepare(`
        SELECT * FROM share_otps
        WHERE share_id = ? AND email = ? AND consumed = 0
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(share.id, share.recipient_email) as any;

    if (!activeOtp) {
      return res.status(400).json({ error: 'No active OTP verification session found. Please re-open link.' });
    }

    if (Date.now() > activeOtp.expires_at) {
      return res.status(400).json({ error: 'OTP code has expired. Please request a new code.' });
    }

    if (activeOtp.attempts >= 5) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Link access is locked.' });
    }

    const inputHash = crypto.createHash('sha256').update(otpCode.trim()).digest('hex');
    if (inputHash !== activeOtp.code_hash) {
      db.prepare('UPDATE share_otps SET attempts = attempts + 1 WHERE id = ?').run(activeOtp.id);
      logAuditEvent({
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        shareId: share.id,
        documentId: share.document_id,
        ipAddress: req.ip,
        metadata: { reason: 'Invalid OTP code entered', attempt: activeOtp.attempts + 1 },
      });
      return res.status(401).json({ error: `Incorrect verification code. ${4 - activeOtp.attempts} attempts remaining.` });
    }

    // Mark OTP consumed
    db.prepare('UPDATE share_otps SET consumed = 1 WHERE id = ?').run(activeOtp.id);
  }

  // Update Access Count and First Opened Timestamp
  const now = new Date();
  const nowIso = now.toISOString();

  let firstOpenedAt = share.first_opened_at;
  if (!firstOpenedAt) {
    firstOpenedAt = nowIso;
    db.prepare('UPDATE shares SET first_opened_at = ?, view_count = view_count + 1 WHERE id = ?').run(nowIso, share.id);
  } else {
    db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(share.id);
  }

  // Determine viewing session expiration time
  let sessionExpiresAtMs = Date.now() + 2 * 60 * 60 * 1000; // Default 2 hours max session
  if (share.access_type === 'time_limited' && share.duration_seconds) {
    const firstOpenedMs = new Date(firstOpenedAt).getTime();
    sessionExpiresAtMs = firstOpenedMs + share.duration_seconds * 1000;
  }

  const remainingSeconds = Math.max(0, Math.floor((sessionExpiresAtMs - Date.now()) / 1000));

  // Generate signed viewer session token
  const viewerSessionToken = createViewerSessionToken({
    shareId: share.id,
    recipientEmail: share.recipient_email || 'external.viewer@havenvault.local',
    expiresAt: sessionExpiresAtMs,
    allowDownload: Boolean(share.allow_download),
  });

  // Log Audit Event: DOC_OPENED
  logAuditEvent({
    eventType: 'DOC_OPENED',
    actorEmail: share.recipient_email || 'anonymous',
    targetType: 'document',
    targetId: share.document_id,
    documentId: share.document_id,
    shareId: share.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: {
      documentTitle: share.doc_title,
      viewNumber: share.view_count + 1,
      accessType: share.access_type,
    },
  });

  // Notify document owner
  createNotification({
    userId: share.owner_id,
    eventType: 'DOC_OPENED',
    title: 'Document Opened',
    description: `"${share.doc_title}" was opened by ${share.recipient_email || 'authorized recipient'}`,
    documentId: share.document_id,
    shareId: share.id,
  });

  res.json({
    viewerSessionToken,
    remainingSeconds,
    allowDownload: Boolean(share.allow_download),
    fileType: share.doc_file_type,
    title: share.doc_title,
    classification: share.doc_classification,
  });
});

/**
 * GET /api/shares/access/content
 * Step 3: Fetch in-memory decrypted document content for locked-down in-app viewer
 */
sharesRouter.get('/access/content', (req, res) => {
  const sessionToken = req.query.session as string;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Viewer session token required' });
  }

  const session = verifyViewerSessionToken(sessionToken);
  if (!session) {
    return res.status(403).json({ error: 'Viewing session expired or invalid' });
  }

  const share = db
    .prepare(`
      SELECT s.*, d.title, d.file_type, d.classification,
             d.encrypted_ciphertext, d.iv, d.auth_tag, d.wrapped_key, d.checksum
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      WHERE s.id = ?
    `)
    .get(session.shareId) as any;

  if (!share || share.revoked) {
    return res.status(403).json({ error: 'Access revoked' });
  }

  // Server-side enforcement of time limit
  if (share.access_type === 'time_limited' && share.first_opened_at && share.duration_seconds) {
    const elapsed = Math.floor((Date.now() - new Date(share.first_opened_at).getTime()) / 1000);
    if (elapsed >= share.duration_seconds) {
      return res.status(403).json({ error: 'Time limit expired' });
    }
  }

  try {
    // Decrypt entirely in memory - zero server disk writes!
    const plaintextBuffer = decryptDocumentBuffer({
      ciphertext: share.encrypted_ciphertext,
      iv: share.iv,
      authTag: share.auth_tag,
      wrappedKey: share.wrapped_key,
      checksum: share.checksum,
    });

    if (share.file_type === 'pdf') {
      res.json({
        fileType: 'pdf',
        title: share.title,
        classification: share.classification,
        contentBase64: plaintextBuffer.toString('base64'),
      });
    } else if (share.file_type === 'txt' || share.file_type === 'md') {
      res.json({
        fileType: share.file_type,
        title: share.title,
        classification: share.classification,
        textContent: plaintextBuffer.toString('utf8'),
      });
    } else if (share.file_type === 'docx') {
      res.json({
        fileType: 'docx',
        title: share.title,
        classification: share.classification,
        contentBase64: plaintextBuffer.toString('base64'),
      });
    } else {
      res.status(400).json({ error: 'Unsupported format' });
    }
  } catch (err: any) {
    console.error('[Decryption Error]', err);
    res.status(500).json({ error: 'Cryptographic decryption failed' });
  }
});

/**
 * POST /api/shares/access/download
 * Step 4: Stream dynamically watermarked copy in volatile memory
 */
sharesRouter.post('/access/download', async (req, res) => {
  const { session: sessionToken } = req.body;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Viewer session token required' });
  }

  const session = verifyViewerSessionToken(sessionToken);
  if (!session) {
    return res.status(403).json({ error: 'Viewing session expired or invalid' });
  }

  const share = db
    .prepare(`
      SELECT s.*, d.title, d.filename, d.file_type, d.classification,
             d.encrypted_ciphertext, d.iv, d.auth_tag, d.wrapped_key, d.checksum
      FROM shares s
      JOIN documents d ON s.document_id = d.id
      WHERE s.id = ?
    `)
    .get(session.shareId) as any;

  if (!share || share.revoked) {
    return res.status(403).json({ error: 'Access revoked' });
  }

  if (!share.allow_download) {
    logAuditEvent({
      eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      shareId: share.id,
      documentId: share.document_id,
      ipAddress: req.ip,
      metadata: { reason: 'Recipient attempted prohibited download' },
    });
    return res.status(403).json({ error: 'Download forbidden by sender security policy' });
  }

  try {
    // 1. Decrypt in memory
    const plaintextBuffer = decryptDocumentBuffer({
      ciphertext: share.encrypted_ciphertext,
      iv: share.iv,
      authTag: share.auth_tag,
      wrappedKey: share.wrapped_key,
      checksum: share.checksum,
    });

    const trackingId = `DL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const recipientEmail = session.recipientEmail;

    let watermarkedBuffer: Buffer;
    let contentType = 'application/octet-stream';
    let outputFilename = `CONFIDENTIAL_${share.filename}`;

    if (share.file_type === 'pdf') {
      watermarkedBuffer = await stampWatermarkedPdf(plaintextBuffer, {
        recipientEmail,
        trackingId,
      });
      contentType = 'application/pdf';
      outputFilename = outputFilename.endsWith('.pdf') ? outputFilename : `${outputFilename}.pdf`;
    } else if (share.file_type === 'txt' || share.file_type === 'md') {
      watermarkedBuffer = stampWatermarkedText(plaintextBuffer, {
        recipientEmail,
        trackingId,
      });
      contentType = share.file_type === 'md' ? 'text/markdown' : 'text/plain';
    } else {
      // DOCX fallback or raw
      watermarkedBuffer = plaintextBuffer;
    }

    // Write audit log
    logAuditEvent({
      eventType: 'DOC_DOWNLOADED',
      actorEmail: recipientEmail,
      targetType: 'document',
      targetId: share.document_id,
      documentId: share.document_id,
      shareId: share.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        trackingId,
        documentTitle: share.title,
        outputFilename,
      },
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Tracking-ID', trackingId);
    res.send(watermarkedBuffer);
  } catch (err: any) {
    console.error('[Download Watermark Error]', err);
    res.status(500).json({ error: 'Failed to generate watermarked document' });
  }
});
