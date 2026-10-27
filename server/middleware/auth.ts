import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { UserRecord } from '../services/permissions';

declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
      sessionToken?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
  sessionToken?: string;
}

export const requireAuth = authMiddleware;

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.session_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const nowIso = new Date().toISOString();

  // Find active session
  const session = db
    .prepare<[string, string], { id: string; user_id: string; expires_at: string }>(
      'SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND expires_at > ?'
    )
    .get(token, nowIso);

  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  // Find user
  const user = db
    .prepare<[string], UserRecord>(
      'SELECT id, name, email, role, department, manager_id, is_active, created_at FROM users WHERE id = ?'
    )
    .get(session.user_id);

  if (!user || !user.is_active) {
    res.status(403).json({ error: 'User account is inactive or disabled' });
    return;
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }
  next();
}

/**
 * Rate limiter for sensitive auth routes (login, forgot password, OTP)
 * Limits attempts per IP/identifier within a given window
 */
export function rateLimit(action: string, maxAttempts: number, windowSeconds: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    // Clean up old entries
    db.prepare('DELETE FROM auth_rate_limits WHERE attempted_at < ?').run(now - 86400);

    // Count attempts in current window
    const countRow = db
      .prepare<[string, string, number], { count: number }>(
        'SELECT COUNT(*) as count FROM auth_rate_limits WHERE ip = ? AND action = ? AND attempted_at >= ?'
      )
      .get(ip, action, windowStart);

    if (countRow && countRow.count >= maxAttempts) {
      res.status(429).json({
        error: `Too many attempts for ${action}. Please try again in ${Math.ceil(windowSeconds / 60)} minutes.`,
      });
      return;
    }

    // Record attempt
    db.prepare('INSERT INTO auth_rate_limits (ip, action, identifier, attempted_at) VALUES (?, ?, ?, ?)').run(
      ip,
      action,
      req.body?.email || null,
      now
    );

    next();
  };
}
