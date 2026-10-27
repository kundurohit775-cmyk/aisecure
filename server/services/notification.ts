import crypto from 'crypto';
import { db } from '../db';

export function createNotification(params: {
  userId: string;
  eventType: string;
  title: string;
  description: string;
  documentId?: string | null;
  shareId?: string | null;
}) {
  const id = `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO notifications (id, user_id, event_type, title, description, document_id, share_id, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    params.userId,
    params.eventType,
    params.title,
    params.description,
    params.documentId || null,
    params.shareId || null,
    now
  );

  return { id, createdAt: now };
}
