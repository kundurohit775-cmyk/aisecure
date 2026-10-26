import React, { useState } from 'react';
import {
  X,
  Share2,
  Clock,
  Flame,
  Eye,
  Lock,
  Copy,
  Check,
  Ban,
  ExternalLink,
  History,
  AlertOctagon,
  ShieldAlert,
} from 'lucide-react';
import { ShareConfig, DocumentItem, User } from '../types';
import { revokeShare } from '../lib/engine';

interface ShareManagementModalProps {
  document?: DocumentItem | null; // If passed, filter for this doc; if null, show all user's shares
  shares: ShareConfig[];
  documents: DocumentItem[];
  currentUser: User;
  onClose: () => void;
  onShareUpdated: () => void;
  onOpenViewerWithToken: (token: string) => void;
  onViewAudit: (docId: string) => void;
}

export const ShareManagementModal: React.FC<ShareManagementModalProps> = ({
  document,
  shares,
  documents,
  currentUser,
  onClose,
  onShareUpdated,
  onOpenViewerWithToken,
  onViewAudit,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredShares = shares.filter((s) => {
    const matchesDoc = document ? s.documentId === document.id : true;
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchesDoc && matchesStatus;
  });

  const getShareUrl = (token: string) => {
    const url = new URL(window.location.href);
    url.hash = `#/share/${token}`;
    return url.toString();
  };

  const handleCopyLink = (share: ShareConfig) => {
    navigator.clipboard.writeText(getShareUrl(share.token));
    setCopiedId(share.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExecuteRevoke = async (shareId: string) => {
    try {
      await revokeShare(shareId, currentUser);
      setConfirmRevokeId(null);
      onShareUpdated();
    } catch (err) {
      console.error(err);
      alert('Failed to revoke share link.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              {document ? `Shared Links · ${document.title}` : 'Active & Historical Share Links'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live view counts, time limits, and instantaneous server-side kill switches.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 mr-1">Status:</span>
            {['all', 'active', 'burned', 'expired', 'revoked'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  filterStatus === st
                    ? 'bg-slate-800 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <span className="text-xs font-mono text-slate-500">
            {filteredShares.length} links recorded
          </span>
        </div>

        {/* Shares Table */}
        <div className="p-6 overflow-x-auto">
          {filteredShares.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No share links found matching filter criteria.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="pb-3 font-semibold">Document & Target</th>
                  <th className="pb-3 font-semibold">Policy</th>
                  <th className="pb-3 font-semibold">Opens</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Created</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredShares.map((share) => {
                  const doc = documents.find((d) => d.id === share.documentId);
                  const isRevoked = share.status === 'revoked';
                  const isBurned = share.status === 'burned';
                  const isExpired = share.status === 'expired';
                  const isActive = share.status === 'active';

                  return (
                    <tr key={share.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Document & Target */}
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-200 truncate max-w-[200px]">
                          {doc?.title || 'Confidential Document'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                          {share.targetType === 'team_member' ? (
                            <span className="text-indigo-400">
                              Locked to {share.targetUserName}
                            </span>
                          ) : (
                            <span className="text-slate-500">General Link</span>
                          )}
                          {share.requirePassword && (
                            <span className="text-amber-400 font-medium"> · Password Locked</span>
                          )}
                          {share.requireOtp && ' · OTP Required'}
                        </div>
                      </td>

                      {/* Policy */}
                      <td className="py-3 pr-4 font-mono text-[11px] text-slate-300">
                        {share.viewMode === 'time_limited' && (
                          <div className="flex items-center gap-1 text-indigo-400">
                            <Clock className="w-3 h-3" />
                            <span>{Math.floor((share.timeLimitSeconds || 0) / 60)} min countdown</span>
                          </div>
                        )}
                        {share.viewMode === 'view_once' && (
                          <div className="flex items-center gap-1 text-rose-400">
                            <Flame className="w-3 h-3" />
                            <span>View-Once Single Use</span>
                          </div>
                        )}
                        {share.viewMode === 'max_views' && (
                          <div className="flex items-center gap-1 text-amber-400">
                            <Eye className="w-3 h-3" />
                            <span>Max {share.maxViews} opens</span>
                          </div>
                        )}
                        {share.viewMode === 'unlimited' && (
                          <span className="text-slate-400">Unlimited opens</span>
                        )}
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {share.accessMode === 'viewer_only' ? 'Viewer Only' : 'Download Allowed'}
                        </div>
                      </td>

                      {/* Opens */}
                      <td className="py-3 pr-4 font-mono text-slate-300">
                        <span className="font-semibold">{share.viewsCount}</span>
                        {share.maxViews && (
                          <span className="text-slate-500"> / {share.maxViews}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 pr-4">
                        {isActive && (
                          <span className="text-emerald-400 font-semibold font-mono text-[11px]">
                            ACTIVE
                          </span>
                        )}
                        {isRevoked && (
                          <span className="text-rose-400 font-semibold font-mono text-[11px]">
                            REVOKED
                          </span>
                        )}
                        {isBurned && (
                          <span className="text-amber-400 font-semibold font-mono text-[11px]">
                            BURNED
                          </span>
                        )}
                        {isExpired && (
                          <span className="text-slate-500 font-semibold font-mono text-[11px]">
                            EXPIRED
                          </span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="py-3 pr-4 text-[11px] text-slate-400 font-mono">
                        {new Date(share.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copy Link */}
                          <button
                            onClick={() => handleCopyLink(share)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                            title="Copy link"
                          >
                            {copiedId === share.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Test As Recipient */}
                          <button
                            onClick={() => {
                              onClose();
                              onOpenViewerWithToken(share.token);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-md transition-colors"
                            title="Open in secure viewer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {/* Instant Revoke Switch */}
                          {isActive && (
                            <>
                              {confirmRevokeId === share.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleExecuteRevoke(share.id)}
                                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-semibold transition-colors"
                                  >
                                    Confirm Kill
                                  </button>
                                  <button
                                    onClick={() => setConfirmRevokeId(null)}
                                    className="px-1 py-0.5 text-slate-400 hover:text-white text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmRevokeId(share.id)}
                                  className="flex items-center gap-1 px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/80 text-rose-300 rounded-md text-[11px] font-medium transition-colors"
                                  title="Instantly cut off access"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>Revoke</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
