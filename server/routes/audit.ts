import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';
import { verifyAuditChain } from '../services/audit';

export const auditRouter = Router();

auditRouter.use(requireAuth);

/**
 * GET /api/audit-logs
 * List tamper-evident audit logs with optional filters
 */
auditRouter.get('/', (req, res) => {
  const { documentId, eventType, limit = '100' } = req.query;

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (documentId && typeof documentId === 'string') {
    query += ' AND document_id = ?';
    params.push(documentId);
  }

  if (eventType && typeof eventType === 'string') {
    query += ' AND event_type = ?';
    params.push(eventType);
  }

  query += ' ORDER BY sequence_number DESC LIMIT ?';
  params.push(Math.min(parseInt(limit as string, 10) || 100, 500));

  const rows = db.prepare(query).all(...params) as any[];

  // Map to frontend-friendly structure
  const logs = rows.map((r) => ({
    id: r.id,
    sequenceNumber: r.sequence_number,
    eventType: r.event_type,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    targetType: r.target_type,
    targetId: r.target_id,
    documentId: r.document_id,
    shareId: r.share_id,
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    metadata: JSON.parse(r.metadata_json || '{}'),
    previousHash: r.previous_hash,
    entryHash: r.entry_hash,
    createdAt: r.created_at,
  }));

  res.json({ logs });
});

/**
 * GET /api/audit-logs/verify
 * Traverse entire ledger and verify SHA-256 hash chain integrity
 */
auditRouter.get('/verify', (req, res) => {
  const verification = verifyAuditChain();
  res.json({
    verified: verification.verified,
    totalEntries: verification.totalEntries,
    brokenAtSequence: verification.brokenAtSequence || null,
    headHash: verification.headHash || null,
    status: verification.verified ? 'CHAIN_INTACT' : 'TAMPER_DETECTED',
  });
});

/**
 * GET /api/audit-logs/export
 * Export audit ledger as CSV with cryptographic hashes
 */
auditRouter.get('/export', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY sequence_number ASC')
    .all() as any[];

  const headers = [
    'Sequence',
    'Timestamp (UTC)',
    'Event Type',
    'Actor Email',
    'Target ID',
    'Document ID',
    'IP Address',
    'Previous Hash (SHA-256)',
    'Entry Hash (SHA-256)',
    'Metadata',
  ];

  const csvLines = [headers.join(',')];

  for (const row of rows) {
    const line = [
      row.sequence_number,
      `"${row.created_at}"`,
      `"${row.event_type}"`,
      `"${row.actor_email || 'system'}"`,
      `"${row.target_id || ''}"`,
      `"${row.document_id || ''}"`,
      `"${row.ip_address || ''}"`,
      `"${row.previous_hash}"`,
      `"${row.entry_hash}"`,
      `"${(row.metadata_json || '').replace(/"/g, '""')}"`,
    ];
    csvLines.push(line.join(','));
  }

  const csvContent = csvLines.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="havenvault_audit_ledger_${Date.now()}.csv"`);
  res.send(csvContent);
});
