import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { encryptDocumentBuffer, decryptDocumentBuffer, validateFileMagicBytes } from '../services/crypto';
import { logAuditEvent } from '../services/audit';

export const documentsRouter = Router();

// All document management routes require authentication
documentsRouter.use(requireAuth);

const UploadSchema = z.object({
  title: z.string().min(1).max(150),
  filename: z.string().min(1).max(255),
  fileType: z.enum(['pdf', 'docx', 'txt', 'md']),
  classification: z.enum(['Confidential', 'Restricted', 'Internal', 'Strictly Secret']).default('Confidential'),
  fileBase64: z.string().min(1, 'File content is required'),
});

/**
 * GET /api/documents
 * List all documents uploaded by the current authenticated user
 */
documentsRouter.get('/', (req, res) => {
  const user = req.user!;
  const docs = db
    .prepare(`
      SELECT id, title, filename, file_type, size_bytes, owner_id, classification,
             encrypted_ciphertext, iv, auth_tag, wrapped_key, checksum, created_at, updated_at
      FROM documents
      WHERE owner_id = ?
      ORDER BY datetime(created_at) DESC
    `)
    .all(user.id) as any[];

  // Also query active share counts for each document
  const docsWithStats = docs.map((doc) => {
    const shareStats = db
      .prepare(`
        SELECT COUNT(*) as total_shares,
               SUM(CASE WHEN revoked = 0 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now')) THEN 1 ELSE 0 END) as active_shares,
               SUM(view_count) as total_views
        FROM shares
        WHERE document_id = ?
      `)
      .get(doc.id) as any;

    return {
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      fileType: doc.file_type,
      sizeBytes: doc.size_bytes,
      ownerId: doc.owner_id,
      classification: doc.classification,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      cryptoProof: {
        algorithm: 'AES-256-GCM',
        keyWrapping: 'Envelope / Master Key AES-256-GCM Wrapped',
        checksumSha256: doc.checksum,
        ivHex: Buffer.from(doc.iv, 'base64').toString('hex'),
        authTagHex: Buffer.from(doc.auth_tag, 'base64').toString('hex'),
        wrappedKeyLength: Buffer.from(doc.wrapped_key, 'base64').length,
        ciphertextBase64: doc.encrypted_ciphertext,
        ivBase64: doc.iv,
        authTagBase64: doc.auth_tag,
      },
      stats: {
        totalShares: shareStats?.total_shares || 0,
        activeShares: shareStats?.active_shares || 0,
        totalViews: shareStats?.total_views || 0,
      },
    };
  });

  res.json({ documents: docsWithStats });
});

/**
 * POST /api/documents
 * Upload, validate magic-bytes, and envelope-encrypt document in memory
 */
documentsRouter.post('/', async (req, res) => {
  try {
    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { title, filename, fileType, classification, fileBase64 } = parsed.data;
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    // 25MB max limit
    if (fileBuffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds maximum allowed limit of 25MB' });
    }

    // Magic-byte check (not just file extension!)
    const magicCheck = validateFileMagicBytes(fileBuffer, fileType);
    if (!magicCheck.valid) {
      return res.status(400).json({
        error: `File signature mismatch: detected '${magicCheck.detectedMime}', expected valid signature for '${fileType}'`,
      });
    }

    // Zero-disk envelope encryption
    const encrypted = encryptDocumentBuffer(fileBuffer);

    const docId = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO documents (
        id, title, filename, file_type, size_bytes, owner_id,
        classification, encrypted_ciphertext, iv, auth_tag, wrapped_key,
        checksum, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      title,
      filename,
      fileType,
      fileBuffer.length,
      req.user!.id,
      classification,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      encrypted.wrappedKey,
      encrypted.checksum,
      now,
      now
    );

    // Write audit log entry
    logAuditEvent({
      eventType: 'DOC_UPLOADED',
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      targetType: 'document',
      targetId: docId,
      documentId: docId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        title,
        filename,
        fileType,
        sizeBytes: fileBuffer.length,
        classification,
        checksum: encrypted.checksum,
      },
    });

    res.status(201).json({
      success: true,
      document: {
        id: docId,
        title,
        filename,
        fileType,
        sizeBytes: fileBuffer.length,
        classification,
        createdAt: now,
        cryptoProof: {
          algorithm: 'AES-256-GCM',
          keyWrapping: 'Envelope / Master Key AES-256-GCM Wrapped',
          checksumSha256: encrypted.checksum,
          ivHex: Buffer.from(encrypted.iv, 'base64').toString('hex'),
          authTagHex: Buffer.from(encrypted.authTag, 'base64').toString('hex'),
          ciphertextBase64: encrypted.ciphertext,
          ivBase64: encrypted.iv,
          authTagBase64: encrypted.authTag,
        },
      },
    });
  } catch (err: any) {
    console.error('[Document Upload Error]', err);
    res.status(500).json({ error: err.message || 'Internal server error encrypting document' });
  }
});

/**
 * GET /api/documents/:id
 * Retrieve single document metadata with cryptographic proof inspection
 */
documentsRouter.get('/:id', (req, res) => {
  const user = req.user!;
  const doc = db
    .prepare(`
      SELECT id, title, filename, file_type, size_bytes, owner_id, classification,
             iv, auth_tag, wrapped_key, checksum, created_at, updated_at
      FROM documents
      WHERE id = ? AND owner_id = ?
    `)
    .get(req.params.id, user.id) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found or access denied' });
  }

  res.json({
    document: {
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      fileType: doc.file_type,
      sizeBytes: doc.size_bytes,
      ownerId: doc.owner_id,
      classification: doc.classification,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      cryptoProof: {
        algorithm: 'AES-256-GCM (Authenticated Encryption)',
        keyWrapping: 'Envelope Architecture (Master Key wrapping random 256-bit AES Data Key)',
        checksumSha256: doc.checksum,
        ivHex: Buffer.from(doc.iv, 'base64').toString('hex'),
        authTagHex: Buffer.from(doc.auth_tag, 'base64').toString('hex'),
        wrappedKeyLength: Buffer.from(doc.wrapped_key, 'base64').length,
        storageMode: 'Encrypted at rest (SQLite WAL), decrypted strictly in-memory (zero server disk writes)',
      },
    },
  });
});

/**
 * DELETE /api/documents/:id
 * Remove document and cascade-delete all active shares and OTPs
 */
documentsRouter.delete('/:id', (req, res) => {
  const user = req.user!;
  const doc = db
    .prepare('SELECT id, title, filename FROM documents WHERE id = ? AND owner_id = ?')
    .get(req.params.id, user.id) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found or access denied' });
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);

  logAuditEvent({
    eventType: 'ACCESS_REVOKED',
    actorId: user.id,
    actorEmail: user.email,
    targetType: 'document',
    targetId: doc.id,
    documentId: doc.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: {
      action: 'DOCUMENT_PERMANENTLY_DELETED',
      title: doc.title,
    },
  });

  res.json({ success: true, message: 'Document and all associated shares deleted successfully' });
});

/**
 * POST /api/documents/:id/test-decrypt
 * Tests in-memory AES-256-GCM envelope decryption in volatile RAM without disk writes
 */
documentsRouter.post('/:id/test-decrypt', (req, res) => {
  const user = req.user!;
  const doc = db
    .prepare(`
      SELECT id, title, filename, file_type, size_bytes, owner_id, classification,
             encrypted_ciphertext, iv, auth_tag, wrapped_key, checksum
      FROM documents
      WHERE id = ? AND owner_id = ?
    `)
    .get(req.params.id, user.id) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found or access denied' });
  }

  const start = performance.now();
  try {
    const plaintext = decryptDocumentBuffer({
      ciphertext: doc.encrypted_ciphertext,
      iv: doc.iv,
      authTag: doc.auth_tag,
      wrappedKey: doc.wrapped_key,
      checksum: doc.checksum,
    });

    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const calculatedChecksum = crypto.createHash('sha256').update(plaintext).digest('hex');

    let previewText = '(Encrypted Binary Buffer)';
    if (doc.file_type === 'txt' || doc.file_type === 'md') {
      previewText = plaintext.toString('utf8', 0, 300).replace(/[^\x20-\x7E\n]/g, '·');
    } else if (doc.file_type === 'pdf') {
      previewText = `Verified PDF: ${plaintext.toString('ascii', 0, 80).replace(/[^\x20-\x7E\n]/g, '·')}`;
    }

    res.json({
      success: true,
      durationMs,
      byteSize: plaintext.length,
      calculatedChecksum,
      checksumMatches: calculatedChecksum === doc.checksum,
      previewText,
    });
  } catch (err: any) {
    console.error('[Test Decrypt Error]', err);
    res.status(500).json({ error: err.message || 'Decryption test failed' });
  }
});

