import React, { useState } from 'react';
import {
  X,
  Link2,
  Users,
  Clock,
  Flame,
  Calendar,
  Lock,
  Download,
  Eye,
  EyeOff,
  Shield,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  UserCheck,
  Search,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { DocumentItem, User, ViewMode, AccessMode, ShareConfig } from '../types';
import { createShareLink } from '../lib/engine';
import { safeFetchJson } from '../lib/apiHelper';
import { getAuthorizedRecipients } from '../lib/store';

interface ShareModalProps {
  document: DocumentItem;
  currentUser: User;
  onClose: () => void;
  onShareCreated: (newShare: ShareConfig) => void;
  onOpenViewerWithToken: (token: string) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  document,
  currentUser,
  onClose,
  onShareCreated,
  onOpenViewerWithToken,
}) => {
  const [tab, setTab] = useState<'link' | 'team_member'>('link');

  // Share control states
  const [viewMode, setViewMode] = useState<ViewMode>('time_limited');
  const [timeLimitPreset, setTimeLimitPreset] = useState<number>(600); // 10 minutes default
  const [customTimeMinutes, setCustomTimeMinutes] = useState<string>('15');
  const [maxViews, setMaxViews] = useState<number>(3);
  const [enableCalendarExpiry, setEnableCalendarExpiry] = useState<boolean>(false);
  const [calendarExpiryDate, setCalendarExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [accessMode, setAccessMode] = useState<AccessMode>('viewer_only');
  const [requireOtp, setRequireOtp] = useState<boolean>(false);

  // Password Protection states
  const [requirePassword, setRequirePassword] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [passwordHint, setPasswordHint] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isPasswordCopied, setIsPasswordCopied] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Team member selection state
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeamMember, setSelectedTeamMember] = useState<User | null>(null);
  const [authorizedMembers, setAuthorizedMembers] = useState<User[]>([]);

  // Load real team members from organization directory
  React.useEffect(() => {
    async function loadDirectory() {
      try {
        const res = await safeFetchJson<{ recipients?: any[] }>('/api/org/directory', { credentials: 'include' });
        if (res.ok && res.data?.recipients && res.data.recipients.length > 0) {
          setAuthorizedMembers(
            res.data.recipients.map((r: any) => ({
              id: r.id,
              name: r.name,
              email: r.email,
              role: r.role,
              department: r.department,
              managerId: r.manager_id,
            }))
          );
          return;
        }
      } catch (err) {
        console.warn('[ShareModal] Remote directory fallback:', err);
      }
      // Fallback to client-side authorized recipients
      setAuthorizedMembers(getAuthorizedRecipients(currentUser));
    }
    loadDirectory();
  }, [currentUser]);

  // Completed share link state
  const [createdShare, setCreatedShare] = useState<ShareConfig | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredTeamMembers = authorizedMembers.filter(
    (u) =>
      u.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(teamSearch.toLowerCase()) ||
      u.role.toLowerCase().includes(teamSearch.toLowerCase())
  );

  const effectiveTimeSeconds =
    timeLimitPreset === -1
      ? Math.max(30, (parseInt(customTimeMinutes, 10) || 10) * 60)
      : timeLimitPreset;

  const generateRandomPasskey = () => {
    const words = ['Aegis', 'Haven', 'Cipher', 'Vanguard', 'Matrix', 'Nexus', 'Shield', 'Vault'];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const pass = `${word}-${num}`;
    setPassword(pass);
    setRequirePassword(true);
    setFormError(null);
  };

  const handleCopyPassword = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setIsPasswordCopied(true);
    setTimeout(() => setIsPasswordCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    if (tab === 'team_member' && !selectedTeamMember) {
      setFormError('Please select a recipient from your authorized team member list.');
      return;
    }

    if (requirePassword && !password.trim()) {
      setFormError('Please enter a document password or click Generate to create a passkey.');
      return;
    }

    setIsSubmitting(true);
    try {
      const share = await createShareLink({
        documentId: document.id,
        currentUser,
        targetType: tab,
        targetUser: tab === 'team_member' ? selectedTeamMember || undefined : undefined,
        viewMode,
        timeLimitSeconds: viewMode === 'time_limited' ? effectiveTimeSeconds : undefined,
        maxViews: viewMode === 'max_views' ? maxViews : viewMode === 'view_once' ? 1 : undefined,
        calendarExpiryIso: enableCalendarExpiry ? new Date(calendarExpiryDate).toISOString() : undefined,
        accessMode,
        requireOtp,
        requirePassword,
        password: password.trim(),
        passwordHint: passwordHint.trim() || undefined,
      });

      setCreatedShare(share);
      onShareCreated(share);
    } catch (err) {
      console.error(err);
      setFormError('Failed to generate secure share link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getShareUrl = (token: string) => {
    const url = new URL(window.location.href);
    url.hash = `#/share/${token}`;
    return url.toString();
  };

  const handleCopyLink = () => {
    if (!createdShare) return;
    navigator.clipboard.writeText(getShareUrl(createdShare.token));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Share Confidential Document
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">
              {document.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdShare ? (
          /* Success Screen: Link Generated */
          <div className="p-6 space-y-6">
            <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-200">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Encrypted Share Link Active</span>
              </div>
              <p className="text-xs text-emerald-300/80 mt-1">
                Server limits are active. All access will be stamped with the recipient's tracking watermark and immutably logged.
              </p>
            </div>

            {/* Generated Link Display */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Secure Link (Single-Click Access)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getShareUrl(createdShare.token)}
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* If Password Protected: Display Passkey to Sender */}
            {createdShare.requirePassword && password && (
              <div className="p-3.5 bg-indigo-950/40 border border-indigo-700/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Sender-Provided Passkey</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
                  >
                    {isPasswordCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Passkey</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800">
                  <span className="font-mono text-sm font-bold text-white tracking-wider">
                    {password}
                  </span>
                  {createdShare.passwordHint && (
                    <span className="text-[11px] text-slate-400 italic">
                      Hint: {createdShare.passwordHint}
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 leading-normal">
                  Provide this passkey out-of-band (e.g. via SMS, phone call, or secure chat) to the recipient. The document cannot be decrypted without it.
                </p>
              </div>
            )}

            {/* Link Summary Details */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Target:</span>
                <span className="font-medium text-slate-200">
                  {createdShare.targetType === 'team_member'
                    ? `Internal (${createdShare.targetUserName})`
                    : 'External / General Link'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">View Policy:</span>
                <span className="font-medium text-slate-200">
                  {createdShare.viewMode === 'time_limited' &&
                    `Time-Limited (${Math.floor((createdShare.timeLimitSeconds || 0) / 60)} min)`}
                  {createdShare.viewMode === 'view_once' && 'View-Once (Single use cutoff)'}
                  {createdShare.viewMode === 'max_views' && `Max ${createdShare.maxViews} opens`}
                  {createdShare.viewMode === 'unlimited' && 'Unlimited opens'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Access Mode:</span>
                <span className="font-medium text-slate-200">
                  {createdShare.accessMode === 'viewer_only'
                    ? 'In-App Viewer Only (No download)'
                    : 'Allow Watermarked Download'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Password Lock:</span>
                <span className="font-medium text-slate-200">
                  {createdShare.requirePassword ? 'Enforced (Passkey Required)' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">OTP Auth:</span>
                <span className="font-medium text-slate-200">
                  {createdShare.requireOtp ? 'Enforced (6-digit Email OTP)' : 'None'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose();
                  onOpenViewerWithToken(createdShare.token);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg transition-colors shadow-sm"
              >
                <Eye className="w-4 h-4" />
                <span>Test As Recipient (Open Viewer)</span>
              </button>
            </div>
          </div>
        ) : (
          /* Form: Configuration */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {formError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            {/* Target Tab Navigation */}
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setTab('link')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                  tab === 'link'
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Share via Link</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('team_member')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                  tab === 'team_member'
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Share with Team Member</span>
              </button>
            </div>

            {/* Team Member Picker (when tab === 'team_member') */}
            {tab === 'team_member' && (
              <div className="space-y-2 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Authorized Recipient Hierarchy</span>
                  <span className="font-mono text-[10px] text-indigo-400">
                    {authorizedMembers.length} available
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search team member..."
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-slate-800/40">
                  {filteredTeamMembers.length === 0 ? (
                    <div className="py-3 text-center text-xs text-slate-500">
                      No authorized team members match filter
                    </div>
                  ) : (
                    filteredTeamMembers.map((member) => {
                      const isSelected = selectedTeamMember?.id === member.id;
                      return (
                        <div
                          key={member.id}
                          onClick={() => setSelectedTeamMember(member)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                            isSelected
                              ? 'bg-indigo-950/60 border border-indigo-700/60 text-white'
                              : 'hover:bg-slate-800/60 text-slate-300'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-200 truncate">
                                {member.name}
                              </span>
                              <span className="text-[10px] text-slate-400 capitalize">
                                ({member.role})
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate font-mono">
                              {member.email}
                            </p>
                          </div>
                          {isSelected && <UserCheck className="w-4 h-4 text-indigo-400 shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </div>

                <p className="text-[11px] text-slate-500 italic">
                  Internal shares are cryptographically locked to the selected employee. Other users cannot open this token.
                </p>
              </div>
            )}

            {/* View Mode Controls */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                View Policy & Enforcement
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Time Limited */}
                <button
                  type="button"
                  onClick={() => setViewMode('time_limited')}
                  className={`p-3 text-left rounded-xl border transition-all text-xs ${
                    viewMode === 'time_limited'
                      ? 'bg-indigo-950/30 border-indigo-500 text-white shadow-sm'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-indigo-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Time Limited</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Countdown triggers at first open.
                  </p>
                </button>

                {/* View Once */}
                <button
                  type="button"
                  onClick={() => setViewMode('view_once')}
                  className={`p-3 text-left rounded-xl border transition-all text-xs ${
                    viewMode === 'view_once'
                      ? 'bg-indigo-950/30 border-indigo-500 text-white shadow-sm'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                    <Flame className="w-3.5 h-3.5" />
                    <span>View Once</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Burns link immediately after single open.
                  </p>
                </button>

                {/* Max Views */}
                <button
                  type="button"
                  onClick={() => setViewMode('max_views')}
                  className={`p-3 text-left rounded-xl border transition-all text-xs ${
                    viewMode === 'max_views'
                      ? 'bg-indigo-950/30 border-indigo-500 text-white shadow-sm'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Max Views</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Hard cap on total allowed opens.
                  </p>
                </button>
              </div>

              {/* Time Limited Preset Buttons */}
              {viewMode === 'time_limited' && (
                <div className="p-3 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-2 mt-2">
                  <span className="text-[11px] text-slate-400">Viewing Duration:</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                      { label: '2 min', seconds: 120 },
                      { label: '10 min', seconds: 600 },
                      { label: '30 min', seconds: 1800 },
                      { label: '1 hour', seconds: 3600 },
                      { label: 'Custom', seconds: -1 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setTimeLimitPreset(p.seconds)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          timeLimitPreset === p.seconds
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {timeLimitPreset === -1 && (
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <span className="text-slate-400">Custom minutes:</span>
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={customTimeMinutes}
                        onChange={(e) => setCustomTimeMinutes(e.target.value)}
                        className="w-20 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Max Views Options */}
              {viewMode === 'max_views' && (
                <div className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-800/80 rounded-xl text-xs">
                  <span className="text-slate-400">Maximum Allowed Opens:</span>
                  <div className="flex items-center gap-1.5">
                    {[1, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setMaxViews(num)}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                          maxViews === num
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Access Mode: Viewer Only vs Allow Watermarked Download */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Document Form & Export Permissions
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAccessMode('viewer_only')}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    accessMode === 'viewer_only'
                      ? 'bg-indigo-950/30 border-indigo-500 text-white'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>In-App Viewer Only</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    No download, save, or print controls. Screen protected with tiled watermark.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAccessMode('allow_download')}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    accessMode === 'allow_download'
                      ? 'bg-indigo-950/30 border-indigo-500 text-white'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Watermarked Download</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Allows PDF export stamped diagonally on every page with recipient email & DL ID.
                  </p>
                </button>
              </div>
            </div>

            {/* Password Protection Field */}
            <div className="p-3 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200">Password Protection</span>
                    <p className="text-[11px] text-slate-400">
                      Requires recipient to enter a sender-provided password before viewing the document.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={requirePassword}
                  onChange={(e) => {
                    setRequirePassword(e.target.checked);
                    if (e.target.checked && !password) {
                      generateRandomPasskey();
                    }
                  }}
                  className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-0 focus:ring-offset-0"
                />
              </div>

              {requirePassword && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-slate-300">
                        Document Password / Passkey <span className="text-rose-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={generateRandomPasskey}
                        className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Generate Passkey</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setFormError(null);
                        }}
                        placeholder="Enter secret password (e.g. Haven-4921)"
                        className="w-full pl-3 pr-10 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Password Hint <span className="text-slate-600">(Optional - visible on recipient unlock screen)</span>
                    </label>
                    <input
                      type="text"
                      value={passwordHint}
                      onChange={(e) => setPasswordHint(e.target.value)}
                      placeholder="e.g. Discussed in bilateral security briefing"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <p className="text-[10px] text-slate-500">
                    Dual Verification: Recipient must enter this secret passkey before memory decryption begins. Can be combined with Email OTP for layered authentication.
                  </p>
                </div>
              )}
            </div>

            {/* Security Toggles: OTP & Calendar Cutoff */}
            <div className="p-3 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Require Email OTP</span>
                  <p className="text-[11px] text-slate-400">
                    Recipient must verify identity with single-use 6-digit code.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={requireOtp}
                  onChange={(e) => setRequireOtp(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-0 focus:ring-offset-0"
                />
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Calendar Expiration Cutoff</span>
                  <p className="text-[11px] text-slate-400">
                    Hard date boundary after which the link becomes unreachable.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enableCalendarExpiry}
                  onChange={(e) => setEnableCalendarExpiry(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-0 focus:ring-offset-0"
                />
              </div>

              {enableCalendarExpiry && (
                <div className="pt-1 flex items-center gap-2">
                  <span className="text-slate-400">Cutoff Date:</span>
                  <input
                    type="date"
                    value={calendarExpiryDate}
                    onChange={(e) => setCalendarExpiryDate(e.target.value)}
                    className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (tab === 'team_member' && !selectedTeamMember)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors shadow-sm"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Generating...' : 'Create Secure Share'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
