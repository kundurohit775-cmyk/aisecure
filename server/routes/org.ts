import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest, requireAdmin } from '../middleware/auth';
import { getShareableRecipients, UserRecord } from '../services/permissions';
import { sendUserInviteEmail } from '../services/email';

export const orgRouter = Router();

const InviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'manager', 'employee']),
  department: z.string().min(2, 'Department is required'),
  managerId: z.string().nullable().optional(),
});

const UpdateUserSchema = z.object({
  role: z.enum(['admin', 'manager', 'employee']).optional(),
  department: z.string().min(2).optional(),
  managerId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/org/directory
 * Returns only the users the current user may see / share to.
 */
orgRouter.get('/directory', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const currentUser = req.user!;
  const recipients = getShareableRecipients(currentUser);
  res.json({ recipients });
});

/**
 * GET /api/org/users
 * Admin only: returns all organization users, roles, departments, reporting hierarchy
 */
orgRouter.get('/users', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const users = db
    .prepare<[], UserRecord & { manager_name: string | null }>(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.email_verified, 
        u.role, 
        u.department, 
        u.manager_id, 
        u.is_active, 
        u.created_at,
        m.name as manager_name
      FROM users u
      LEFT JOIN users m ON u.manager_id = m.id
      ORDER BY u.department ASC, u.role ASC, u.name ASC
    `)
    .all();

  const invites = db
    .prepare<[], { token: string; email: string; role: string; department: string; expires_at: string; created_at: string }>(`
      SELECT token, email, role, department, expires_at, created_at
      FROM user_invites
      WHERE accepted_at IS NULL AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `)
    .all();

  res.json({ users, pendingInvites: invites });
});

/**
 * POST /api/org/invite
 * Admin only: invites a user into the organization with specified role and manager
 */
orgRouter.post('/invite', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parseResult = InviteUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Invalid invite data' });
      return;
    }

    const { email, role, department, managerId } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = db.prepare<[string], { id: string }>('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'A user with this email address is already registered in the system.' });
      return;
    }

    // Verify manager exists if provided
    if (managerId) {
      const manager = db.prepare<[string], { id: string }>('SELECT id FROM users WHERE id = ?').get(managerId);
      if (!manager) {
        res.status(400).json({ error: 'Assigned manager not found' });
        return;
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); // 7 days

    // Upsert into user_invites
    db.prepare(`
      INSERT INTO user_invites (token, email, role, department, manager_id, invited_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(token, normalizedEmail, role, department.trim(), managerId || null, req.user!.id, expiresAt, nowIso);

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    await sendUserInviteEmail(normalizedEmail, role, department.trim(), token, appUrl);

    res.status(201).json({
      message: `Invitation successfully sent to ${normalizedEmail}`,
      invite: {
        email: normalizedEmail,
        role,
        department: department.trim(),
        expiresAt,
        inviteUrl: `${appUrl}/#/accept-invite?token=${token}`,
      },
    });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to create organization invitation' });
  }
});

/**
 * PATCH /api/org/users/:id
 * Admin only: update user role, department, manager or active status
 */
orgRouter.patch('/users/:id', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const parseResult = UpdateUserSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Invalid payload' });
    return;
  }

  const existing = db.prepare<[string], UserRecord>('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { role, department, managerId, isActive } = parseResult.data;

  // Prevent self-demotion or self-deactivation if only 1 admin remains
  if (targetId === req.user!.id) {
    if (role && role !== 'admin') {
      const adminCount = db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM users WHERE role = "admin" AND is_active = 1').get()?.count || 0;
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot remove your own admin privileges when you are the sole active administrator.' });
        return;
      }
    }
    if (isActive === false) {
      res.status(400).json({ error: 'Cannot deactivate your own administrator account.' });
      return;
    }
  }

  const newRole = role !== undefined ? role : existing.role;
  const newDept = department !== undefined ? department : existing.department;
  const newManagerId = managerId !== undefined ? managerId : existing.manager_id;
  const newIsActive = isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active;
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE users 
    SET role = ?, department = ?, manager_id = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).run(newRole, newDept, newManagerId, newIsActive, nowIso, targetId);

  // If user deactivated, revoke all their active sessions immediately
  if (newIsActive === 0) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
  }

  res.json({ message: 'User updated successfully' });
});
