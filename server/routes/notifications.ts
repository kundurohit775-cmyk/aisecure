import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

/**
 * GET /api/notifications
 * Get alerts and security notifications for current user
 */
notificationsRouter.get('/', (req, res) => {
  const user = req.user!;
  const rows = db
    .prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 100
    `)
    .all(user.id) as any[];

  const notifications = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    eventType: r.event_type,
    title: r.title,
    description: r.description,
    documentId: r.document_id,
    shareId: r.share_id,
    read: Boolean(r.read),
    createdAt: r.created_at,
  }));

  const unreadCount = notifications.filter((n) => !n.read).length;

  res.json({ notifications, unreadCount });
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read
 */
notificationsRouter.patch('/:id/read', (req, res) => {
  const user = req.user!;
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, user.id);
  res.json({ success: true });
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
notificationsRouter.post('/read-all', (req, res) => {
  const user = req.user!;
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id);
  res.json({ success: true });
});
