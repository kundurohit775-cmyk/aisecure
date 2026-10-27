import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Building,
  Mail,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { safeFetchJson } from '../lib/apiHelper';
import { SYSTEM_USERS } from '../lib/store';

interface OrgUser {
  id: string;
  name: string;
  email: string;
  email_verified: number;
  role: 'admin' | 'manager' | 'employee';
  department: string;
  manager_id: string | null;
  manager_name: string | null;
  is_active: number;
  created_at: string;
}

interface PendingInvite {
  token: string;
  email: string;
  role: string;
  department: string;
  expires_at: string;
  created_at: string;
}

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'employee'>('employee');
  const [inviteDepartment, setInviteDepartment] = useState(currentUser?.department || 'Executive Leadership');
  const [inviteManagerId, setInviteManagerId] = useState<string>('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'manager' | 'employee'>('employee');
  const [editDepartment, setEditDepartment] = useState('');
  const [editManagerId, setEditManagerId] = useState<string>('');

  const getFallbackUsers = (): OrgUser[] => {
    return SYSTEM_USERS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      email_verified: 1,
      role: u.role,
      department: u.department,
      manager_id: u.managerId || null,
      manager_name: SYSTEM_USERS.find((m) => m.id === u.managerId)?.name || null,
      is_active: 1,
      created_at: new Date().toISOString(),
    }));
  };

  const fetchOrgUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await safeFetchJson<{ users: OrgUser[]; pendingInvites: PendingInvite[] }>('/api/org/users');
      if (res.ok && res.data) {
        setUsers(res.data.users || []);
        setPendingInvites(res.data.pendingInvites || []);
      } else {
        // Fallback to client demo directory
        setUsers(getFallbackUsers());
        setPendingInvites([]);
      }
    } catch {
      setUsers(getFallbackUsers());
      setPendingInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgUsers();
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSubmitting(true);
    setError(null);
    setCreatedInviteUrl(null);

    try {
      const res = await safeFetchJson<{ invite?: { inviteUrl?: string } }>('/api/org/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          department: inviteDepartment,
          managerId: inviteManagerId || null,
        }),
      });

      if (res.ok && res.data) {
        setSuccess(`Invitation created for ${inviteEmail}`);
        if (res.data.invite?.inviteUrl) {
          setCreatedInviteUrl(res.data.invite.inviteUrl);
        }
      } else {
        // Client fallback mock invite URL
        const mockToken = `inv-${Date.now()}`;
        const mockUrl = `${window.location.origin}/#/accept-invite?token=${mockToken}`;
        setCreatedInviteUrl(mockUrl);
        setPendingInvites((prev) => [
          ...prev,
          {
            token: mockToken,
            email: inviteEmail,
            role: inviteRole,
            department: inviteDepartment,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            created_at: new Date().toISOString(),
          },
        ]);
        setSuccess(`Mock invitation created for ${inviteEmail}`);
      }

      setInviteEmail('');
    } catch (err: any) {
      setError(err?.message || 'Failed to create invite.');
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleToggleActive = async (targetUser: OrgUser) => {
    const newStatus = targetUser.is_active ? 0 : 1;
    try {
      await safeFetchJson(`/api/org/users/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: Boolean(newStatus) }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_active: newStatus } : u))
      );
      setSuccess(`User ${targetUser.name} ${newStatus ? 'activated' : 'deactivated'}.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveEditUser = async (userId: string) => {
    try {
      await safeFetchJson(`/api/org/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: editRole,
          department: editDepartment,
          managerId: editManagerId || null,
        }),
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                role: editRole,
                department: editDepartment,
                manager_id: editManagerId || null,
                manager_name: users.find((m) => m.id === editManagerId)?.name || null,
              }
            : u
        )
      );
      setSuccess('User updated successfully.');
      setEditingUserId(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStartEdit = (user: OrgUser) => {
    setEditingUserId(user.id);
    setEditRole(user.role);
    setEditDepartment(user.department);
    setEditManagerId(user.manager_id || '');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Organization & User Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage organization members, assign roles, enforce reporting structures, and issue invites.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchOrgUsers}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg transition-colors"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setIsInviteModalOpen(true);
              setError(null);
              setSuccess(null);
              setCreatedInviteUrl(null);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Team Member</span>
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-start gap-2.5 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Users Directory Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">Active Members</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-mono text-slate-300">
              {users.length}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono">Department Head / Manager / Employee Roles</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Reports To</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {users.map((u) => {
                const isEditing = editingUserId === u.id;
                const isSelf = currentUser?.id === u.id;

                return (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* User info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center font-bold text-xs text-indigo-300">
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {isSelf && <span className="text-[10px] text-indigo-400 font-mono">(You)</span>}
                          </div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">
                      {isEditing ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as any)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="employee">Employee</option>
                        </select>
                      ) : (
                        <span
                          className={`font-mono text-xs font-semibold ${
                            u.role === 'admin'
                              ? 'text-rose-400'
                              : u.role === 'manager'
                              ? 'text-amber-400'
                              : 'text-indigo-400'
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      )}
                    </td>

                    {/* Department */}
                    <td className="py-3.5 px-4 text-slate-300">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDepartment}
                          onChange={(e) => setEditDepartment(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-32"
                        />
                      ) : (
                        <span>{u.department}</span>
                      )}
                    </td>

                    {/* Reports To */}
                    <td className="py-3.5 px-4 text-slate-400">
                      {isEditing ? (
                        <select
                          value={editManagerId}
                          onChange={(e) => setEditManagerId(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="">None (Top Level)</option>
                          {users
                            .filter((m) => m.id !== u.id && m.role !== 'employee')
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.role})
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span>{u.manager_name || '—'}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[11px] ${
                          u.is_active ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span>{u.is_active ? 'Active' : 'Disabled'}</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSaveEditUser(u.id)}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingUserId(null)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartEdit(u)}
                            className="text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            Edit
                          </button>
                          {!isSelf && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              className={`text-xs ${
                                u.is_active
                                  ? 'text-rose-400 hover:text-rose-300'
                                  : 'text-emerald-400 hover:text-emerald-300'
                              }`}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-slate-200">Pending Invitations ({pendingInvites.length})</h3>
          <div className="divide-y divide-slate-800/80">
            {pendingInvites.map((inv) => (
              <div key={inv.token} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-200">{inv.email}</span>
                  <span className="text-slate-500 ml-2 font-mono">
                    [{inv.role.toUpperCase()} · {inv.department}]
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Expires {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <span>Invite Team Member</span>
              </h3>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdInviteUrl ? (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-950/40 border border-emerald-800 rounded-xl text-xs text-emerald-300 space-y-2">
                  <p className="font-semibold">Invitation Created Successfully!</p>
                  <p className="text-emerald-400/80">
                    The invitation email has been sent. You can also copy the direct invitation link below:
                  </p>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-2 text-xs font-mono text-slate-300">
                  <span className="truncate">{createdInviteUrl}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteUrl);
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 2000);
                    }}
                    className="p-1.5 hover:bg-slate-800 text-indigo-400 rounded shrink-0"
                  >
                    {copiedInvite ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => setIsInviteModalOpen(false)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Department</label>
                    <input
                      type="text"
                      required
                      value={inviteDepartment}
                      onChange={(e) => setInviteDepartment(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Manager</label>
                  <select
                    value={inviteManagerId}
                    onChange={(e) => setInviteManagerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">None (Reports to Department Head)</option>
                    {users
                      .filter((u) => u.role !== 'employee')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role.toUpperCase()} · {u.department})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteSubmitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg"
                  >
                    {inviteSubmitting ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
