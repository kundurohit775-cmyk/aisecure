import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'havenvault.db');
export const db = new Database(dbPath);

// Enable WAL mode and foreign keys for durability and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    -- Organization & Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      role TEXT CHECK(role IN ('admin', 'manager', 'employee')) NOT NULL DEFAULT 'employee',
      department TEXT NOT NULL,
      manager_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- User Sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Email Verification Tokens
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Password Reset Tokens
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- User Invitations
    CREATE TABLE IF NOT EXISTS user_invites (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'manager', 'employee')) NOT NULL DEFAULT 'employee',
      department TEXT NOT NULL,
      manager_id TEXT,
      invited_by TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Rate Limiting / Security Audits for Auth
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      action TEXT NOT NULL,
      identifier TEXT,
      attempted_at INTEGER NOT NULL
    );

    -- Documents (Schema prepared for Phase 2)
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      owner_id TEXT NOT NULL,
      classification TEXT NOT NULL DEFAULT 'Confidential',
      encrypted_ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      wrapped_key TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Share Engine (Schema prepared for Phase 3)
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      share_scope TEXT CHECK(share_scope IN ('external_link', 'internal_user')) NOT NULL,
      shared_with_user_id TEXT,
      recipient_email TEXT,
      share_token_hash TEXT UNIQUE NOT NULL,
      access_type TEXT CHECK(access_type IN ('view_once', 'time_limited', 'standard')) NOT NULL,
      duration_seconds INTEGER,
      max_views INTEGER,
      view_count INTEGER DEFAULT 0,
      expires_at TEXT,
      first_opened_at TEXT,
      allow_download INTEGER DEFAULT 0,
      password_hash TEXT,
      revoked INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- External Share OTP verification codes (Phase 4)
    CREATE TABLE IF NOT EXISTS share_otps (
      id TEXT PRIMARY KEY,
      share_id TEXT NOT NULL,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      locked_until INTEGER DEFAULT 0,
      expires_at INTEGER NOT NULL,
      consumed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
    );

    -- Hash-Chained Audit Ledger (Phase 6)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      sequence_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT,
      actor_email TEXT,
      target_type TEXT,
      target_id TEXT,
      document_id TEXT,
      share_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      previous_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- In-App Notifications (Phase 6)
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      document_id TEXT,
      share_id TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  console.log('[Database] Initialized SQLite tables and indices successfully.');
}
