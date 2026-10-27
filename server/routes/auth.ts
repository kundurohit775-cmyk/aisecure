import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest, rateLimit } from '../middleware/auth';
import { sendEmailVerification, sendPasswordResetEmail } from '../services/email';
import { UserRecord } from '../services/permissions';

export const authRouter = Router();

const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  department: z.string().min(2, 'Department is required'),
  inviteToken: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid reset token'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Helper to set cookie
function setSessionCookie(res: Response, token: string) {
  res.cookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });
}

/**
 * POST /api/auth/register
 * First user to register in the organization becomes Admin (Department Head).
 */
authRouter.post('/register', rateLimit('register', 10, 3600), async (req: Request, res: Response) => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Invalid input' });
      return;
    }

    const { name, email, password, department, inviteToken } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const existing = db
      .prepare<[string], { id: string }>('SELECT id FROM users WHERE email = ?')
      .get(normalizedEmail);

    if (existing) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    // Check existing users count to determine if this is the first user
    const totalUsersCount = db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM users')
      .get()?.count || 0;

    let role: 'admin' | 'manager' | 'employee' = 'employee';
    let assignedDept = department.trim();
    let managerId: string | null = null;
    let autoVerify = false;

    if (totalUsersCount === 0) {
      // First user becomes organization Admin
      role = 'admin';
      autoVerify = true; // Auto-verify the founding administrator
    } else if (inviteToken) {
      // Check invitation
      const invite = db
        .prepare<[string, string], { token: string; email: string; role: string; department: string; manager_id: string | null }>(
          'SELECT token, email, role, department, manager_id FROM user_invites WHERE token = ? AND expires_at > datetime("now") AND accepted_at IS NULL'
        )
        .get(inviteToken, new Date().toISOString());

      if (invite) {
        if (invite.email.toLowerCase() !== normalizedEmail) {
          res.status(400).json({ error: 'Invite token does not match provided email address' });
          return;
        }
        role = invite.role as 'admin' | 'manager' | 'employee';
        assignedDept = invite.department;
        managerId = invite.manager_id;
        autoVerify = true; // Email verified via invite token

        // Mark invite accepted
        db.prepare('UPDATE user_invites SET accepted_at = ? WHERE token = ?').run(
          new Date().toISOString(),
          inviteToken
        );
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, email_verified, role, department, manager_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(userId, name.trim(), normalizedEmail, passwordHash, autoVerify ? 1 : 0, role, assignedDept, managerId, nowIso, nowIso);

    // If not auto-verified, send verification email
    if (!autoVerify) {
      const verifyToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      db.prepare('INSERT INTO email_verification_tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
        verifyToken,
        userId,
        expiresAt,
        nowIso
      );

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      await sendEmailVerification(normalizedEmail, name, verifyToken, appUrl);

      res.status(201).json({
        message: 'Account created successfully. Please check your email to verify your account.',
        requiresVerification: true,
      });
      return;
    }

    // Create session for auto-verified initial admin/invitee
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      sessionToken,
      userId,
      sessionExpires,
      nowIso
    );

    setSessionCookie(res, sessionToken);

    res.status(201).json({
      message: 'Account registered and activated.',
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        role,
        department: assignedDept,
        manager_id: managerId,
        email_verified: 1,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to complete registration' });
  }
});

/**
 * POST /api/auth/login
 */
authRouter.post('/login', rateLimit('login', 6, 900), async (req: Request, res: Response) => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Invalid email or password' });
      return;
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Query user
    const user = db
      .prepare<[string], UserRecord & { password_hash: string; email_verified: number }>(
        'SELECT id, name, email, password_hash, email_verified, role, department, manager_id, is_active, created_at FROM users WHERE email = ?'
      )
      .get(normalizedEmail);

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'Your account has been deactivated. Please contact your organization administrator.' });
      return;
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check email verification
    if (!user.email_verified) {
      res.status(403).json({
        error: 'Please verify your email address before logging in.',
        requiresVerification: true,
        email: user.email,
      });
      return;
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      sessionToken,
      user.id,
      sessionExpires,
      nowIso
    );

    setSessionCookie(res, sessionToken);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        manager_id: user.manager_id,
        email_verified: user.email_verified,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication service error' });
  }
});

/**
 * GET /api/auth/me
 */
authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  if (req.sessionToken) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionToken);
  }
  res.clearCookie('session_token');
  res.json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/verify-email
 */
authRouter.get('/verify-email', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ error: 'Verification token is required' });
    return;
  }

  const record = db
    .prepare<[string, string], { user_id: string }>(
      'SELECT user_id FROM email_verification_tokens WHERE token = ? AND expires_at > ?'
    )
    .get(token, new Date().toISOString());

  if (!record) {
    res.status(400).json({ error: 'Verification token is invalid or expired' });
    return;
  }

  // Update user
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    record.user_id
  );

  // Remove token
  db.prepare('DELETE FROM email_verification_tokens WHERE token = ?').run(token);

  res.json({ message: 'Email address verified successfully. You may now log in.' });
});

/**
 * POST /api/auth/resend-verification
 */
authRouter.post('/resend-verification', rateLimit('resend_verification', 3, 300), async (req: Request, res: Response) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare<[string], { id: string; name: string; email_verified: number }>('SELECT id, name, email_verified FROM users WHERE email = ?').get(email);

  if (user && !user.email_verified) {
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO email_verification_tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      verifyToken,
      user.id,
      expiresAt,
      nowIso
    );

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    await sendEmailVerification(email, user.name, verifyToken, appUrl);
  }

  // Generic message
  res.json({ message: 'If an unverified account exists for that email, a verification link has been sent.' });
});

/**
 * POST /api/auth/forgot-password
 */
authRouter.post('/forgot-password', rateLimit('forgot_password', 3, 900), async (req: Request, res: Response) => {
  const parseResult = ForgotPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }

  const email = parseResult.data.email.trim().toLowerCase();
  const user = db.prepare<[string], { id: string; name: string }>('SELECT id, name FROM users WHERE email = ? AND is_active = 1').get(email);

  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour
    const nowIso = new Date().toISOString();

    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO password_reset_tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      resetToken,
      user.id,
      expiresAt,
      nowIso
    );

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    await sendPasswordResetEmail(email, user.name, resetToken, appUrl);
  }

  // Always return generic message to prevent email discovery
  res.json({ message: 'If that email is registered, password reset instructions have been sent.' });
});

/**
 * POST /api/auth/reset-password
 */
authRouter.post('/reset-password', rateLimit('reset_password', 5, 900), async (req: Request, res: Response) => {
  const parseResult = ResetPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Invalid request' });
    return;
  }

  const { token, password } = parseResult.data;
  const nowIso = new Date().toISOString();

  const resetRecord = db
    .prepare<[string, string], { user_id: string }>(
      'SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > ?'
    )
    .get(token, nowIso);

  if (!resetRecord) {
    res.status(400).json({ error: 'Password reset link is invalid or has expired' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Update user password and clear all existing sessions for security
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    nowIso,
    resetRecord.user_id
  );
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(resetRecord.user_id);
  db.prepare('DELETE FROM password_reset_tokens WHERE token = ?').run(token);

  res.json({ message: 'Password has been successfully updated. Please log in with your new password.' });
});
