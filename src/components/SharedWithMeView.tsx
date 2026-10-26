import React from 'react';
import {
  Inbox,
  FileText,
  Clock,
  Flame,
  Lock,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { ShareConfig, DocumentItem, User } from '../types';

interface SharedWithMeViewProps {
  currentUser: User;
  shares: ShareConfig[];
  documents: DocumentItem[];
  onOpenViewerWithToken: (token: string) => void;
}

export const SharedWithMeView: React.FC<SharedWithMeViewProps> = ({
  currentUser,
  shares,
  documents,
  onOpenViewerWithToken,
}) => {
  // Find shares targeted directly to current user or where current user is the target user
  const internalShares = shares.filter(
    (s) => s.targetType === 'team_member' && s.targetUserId === currentUser.id
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          Documents Shared With You
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Confidential internal documents cryptographically delegated to your account ({currentUser.name}).
        </p>
      </div>

      {/* Recipient Persona Badge */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold">
            {currentUser.name.charAt(0)}
          </div>
          <div>
            <div className="font-semibold text-slate-200">
              Authenticated Identity: {currentUser.name}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Role: <span className="uppercase text-indigo-400">{currentUser.role}</span> · {currentUser.department}
            </div>
          </div>
        </div>

        <div className="text-right text-[11px] text-slate-400 font-mono">
          <span>{internalShares.length} internal files delegated</span>
        </div>
      </div>

      {/* List of Shares */}
      {internalShares.length === 0 ? (
        <div className="border border-slate-800 rounded-xl p-12 text-center bg-slate-900/40">
          <Inbox className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">
            No confidential documents shared with your account yet
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Switch persona to an Admin or Manager in the top navbar to delegate a confidential document to {currentUser.name}.
          </p>
        </div>
      ) : (
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/60 divide-y divide-slate-800/80">
          {internalShares.map((share) => {
            const doc = documents.find((d) => d.id === share.documentId);
            const isRevoked = share.status === 'revoked';
            const isBurned = share.status === 'burned';
            const isExpired = share.status === 'expired';
            const isActive = share.status === 'active';

            return (
              <div
                key={share.id}
                className="p-5 hover:bg-slate-800/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {doc?.title || 'Confidential Document'}
                      </h3>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs font-mono text-slate-400">
                        Sender: {share.createdByName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                      <span>Policy:</span>
                      {share.viewMode === 'time_limited' && (
                        <span className="text-indigo-400">
                          {Math.floor((share.timeLimitSeconds || 0) / 60)} min time-limited
                        </span>
                      )}
                      {share.viewMode === 'view_once' && (
                        <span className="text-rose-400">View-Once Single Use</span>
                      )}
                      {share.viewMode === 'max_views' && (
                        <span className="text-amber-400">Max {share.maxViews} opens</span>
                      )}
                      {share.viewMode === 'unlimited' && <span>Unlimited opens</span>}
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span>
                        {share.accessMode === 'viewer_only' ? 'In-App Viewer Only' : 'Download Permitted'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                      <span>Shared: {new Date(share.createdAt).toLocaleDateString()}</span>
                      {share.firstOpenedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-indigo-300">
                            First opened: {new Date(share.firstOpenedAt).toLocaleTimeString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Status & Action */}
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  {isActive ? (
                    <button
                      onClick={() => onOpenViewerWithToken(share.token)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors"
                    >
                      <span>Open Secure Viewer</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono font-semibold text-slate-400">
                      {isRevoked && 'ACCESS REVOKED'}
                      {isBurned && 'SINGLE-USE CONSUMED'}
                      {isExpired && 'LINK EXPIRED'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
