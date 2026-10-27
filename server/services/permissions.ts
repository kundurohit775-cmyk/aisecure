import { db } from '../db';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  department: string;
  manager_id: string | null;
  is_active: number;
  created_at: string;
}

/**
 * Checks if a sender has the organizational authority to share a document with a given recipient.
 * Business rules:
 * - Admin: can share with anyone in their own department
 * - Manager: can share to their direct reports (employee.manager_id == manager.id) and their own admin (manager.manager_id == recipient.id or department admin)
 * - Employee: cannot initiate shares (TODO: confirm this business rule - currently employees cannot initiate shares)
 */
export function canShare(sender: UserRecord, recipient: UserRecord): boolean {
  if (!sender.is_active || !recipient.is_active) {
    return false;
  }

  // Prevent self-sharing
  if (sender.id === recipient.id) {
    return false;
  }

  // Admin rule: can share to anyone in their department
  if (sender.role === 'admin') {
    return sender.department === recipient.department;
  }

  // Manager rule: can share to direct reports (employee.manager_id == manager.id) AND their own admin
  if (sender.role === 'manager') {
    // 1. Direct reports
    if (recipient.manager_id === sender.id) {
      return true;
    }
    // 2. Their own admin / manager
    if (recipient.role === 'admin' && recipient.department === sender.department) {
      return true;
    }
    if (sender.manager_id === recipient.id) {
      return true;
    }
    return false;
  }

  // Employee rule: cannot initiate shares
  // TODO: confirm this business rule - currently employees cannot initiate shares
  if (sender.role === 'employee') {
    return false;
  }

  return false;
}

/**
 * Returns the list of users that the sender is authorized to share documents with.
 */
export function getShareableRecipients(sender: UserRecord): UserRecord[] {
  if (!sender.is_active) {
    return [];
  }

  // Employee: cannot initiate shares
  // TODO: confirm this business rule - currently employees cannot initiate shares
  if (sender.role === 'employee') {
    return [];
  }

  if (sender.role === 'admin') {
    // Admin can share to anyone active in their department
    const stmt = db.prepare<[string, string], UserRecord>(`
      SELECT id, name, email, role, department, manager_id, is_active, created_at
      FROM users
      WHERE department = ? AND id != ? AND is_active = 1
      ORDER BY role ASC, name ASC
    `);
    return stmt.all(sender.department, sender.id);
  }

  if (sender.role === 'manager') {
    // Manager can share to direct reports and their own department admin
    const stmt = db.prepare<[string, string, string, string], UserRecord>(`
      SELECT id, name, email, role, department, manager_id, is_active, created_at
      FROM users
      WHERE is_active = 1 AND id != ? AND (
        manager_id = ? OR 
        (role = 'admin' AND department = ?) OR
        id = ?
      )
      ORDER BY role ASC, name ASC
    `);
    return stmt.all(sender.id, sender.id, sender.department, sender.manager_id || '');
  }

  return [];
}
