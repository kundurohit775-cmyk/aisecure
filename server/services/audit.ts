import crypto from 'crypto';
import { db } from '../db';

export const GENESIS_HASH = 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditLogInput {
  eventType:
    | 'DOC_UPLOADED'
    | 'SHARE_CREATED'
    | 'DOC_OPENED'
    | 'DOC_DOWNLOADED'
    | 'ACCESS_REVOKED'
    | 'UNAUTHORIZED_ACCESS_ATTEMPT'
    | 'DOC_EXPIRED'
    | 'USER_INVITED'
    | 'USER_ROLE_UPDATED';
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  documentId?: string | null;
  shareId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any>;
}

export function logAuditEvent(input: AuditLogInput): { id: string; sequenceNumber: number; entryHash: string } {
  // Use a database transaction to ensure sequential integrity and avoid race conditions
  const runTx = db.transaction(() => {
    // 1. Get the last audit record to find current sequence number and previous hash
    const lastRecord = db
      .prepare('SELECT sequence_number, entry_hash FROM audit_logs ORDER BY sequence_number DESC LIMIT 1')
      .get() as { sequence_number: number; entry_hash: string } | undefined;

    const sequenceNumber = lastRecord ? lastRecord.sequence_number + 1 : 1;
    const previousHash = lastRecord ? lastRecord.entry_hash : GENESIS_HASH;

    const id = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const createdAt = new Date().toISOString();
    const metadataJson = JSON.stringify(input.metadata || {});

    // 2. Compute SHA-256 entry hash: sha256(previousHash + sequenceNumber + eventType + actorEmail + targetId + createdAt + metadataJson)
    const rawToHash = [
      previousHash,
      sequenceNumber.toString(),
      input.eventType,
      input.actorEmail || 'system',
      input.targetId || '',
      createdAt,
      metadataJson,
    ].join('|');

    const entryHash = crypto.createHash('sha256').update(rawToHash).digest('hex');

    // 3. Insert into database
    db.prepare(`
      INSERT INTO audit_logs (
        id, sequence_number, event_type, actor_id, actor_email,
        target_type, target_id, document_id, share_id, ip_address,
        user_agent, metadata_json, previous_hash, entry_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sequenceNumber,
      input.eventType,
      input.actorId || null,
      input.actorEmail || null,
      input.targetType || null,
      input.targetId || null,
      input.documentId || null,
      input.shareId || null,
      input.ipAddress || null,
      input.userAgent || null,
      metadataJson,
      previousHash,
      entryHash,
      createdAt
    );

    return { id, sequenceNumber, entryHash };
  });

  return runTx();
}

/**
 * Validates the entire SHA-256 cryptographic hash chain from Genesis to Head
 */
export function verifyAuditChain(): {
  verified: boolean;
  totalEntries: number;
  brokenAtSequence?: number;
  headHash?: string;
} {
  const records = db
    .prepare('SELECT * FROM audit_logs ORDER BY sequence_number ASC')
    .all() as any[];

  if (records.length === 0) {
    return { verified: true, totalEntries: 0, headHash: GENESIS_HASH };
  }

  let expectedPreviousHash = GENESIS_HASH;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const expectedSeq = i + 1;

    if (record.sequence_number !== expectedSeq) {
      return { verified: false, totalEntries: records.length, brokenAtSequence: record.sequence_number };
    }

    if (record.previous_hash !== expectedPreviousHash) {
      return { verified: false, totalEntries: records.length, brokenAtSequence: record.sequence_number };
    }

    const rawToHash = [
      record.previous_hash,
      record.sequence_number.toString(),
      record.event_type,
      record.actor_email || 'system',
      record.target_id || '',
      record.created_at,
      record.metadata_json || '{}',
    ].join('|');

    const calculatedHash = crypto.createHash('sha256').update(rawToHash).digest('hex');
    if (calculatedHash !== record.entry_hash) {
      return { verified: false, totalEntries: records.length, brokenAtSequence: record.sequence_number };
    }

    expectedPreviousHash = record.entry_hash;
  }

  return {
    verified: true,
    totalEntries: records.length,
    headHash: expectedPreviousHash,
  };
}
