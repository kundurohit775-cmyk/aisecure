import React, { useState } from 'react';
import {
  FileText,
  Lock,
  Share2,
  Eye,
  SlidersHorizontal,
  Search,
  ShieldAlert,
  HardDriveDownload,
  AlertCircle,
  ExternalLink,
  History,
} from 'lucide-react';
import { DocumentItem, DocumentClassification, User, ShareConfig } from '../types';

interface DocumentListProps {
  documents: DocumentItem[];
  shares: ShareConfig[];
  currentUser: User;
  onOpenShareModal: (doc: DocumentItem) => void;
  onOpenManageShares: (doc: DocumentItem) => void;
  onOpenDirectViewer: (doc: DocumentItem) => void;
  onViewDocumentAudit: (docId: string) => void;
  onOpenUploadModal: () => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  shares,
  currentUser,
  onOpenShareModal,
  onOpenManageShares,
  onOpenDirectViewer,
  onViewDocumentAudit,
  onOpenUploadModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassification, setSelectedClassification] = useState<string>('all');
  const [roleRestrictionMessage, setRoleRestrictionMessage] = useState<string | null>(null);

  // Filter documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.ownerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass =
      selectedClassification === 'all' || doc.classification === selectedClassification;
    return matchesSearch && matchesClass;
  });

  const handleShareClick = (doc: DocumentItem) => {
    if (currentUser.role === 'employee') {
      setRoleRestrictionMessage(
        `Role Restriction: As an Employee (${currentUser.name}), your account is restricted from initiating external or internal document shares. Document delegation must be initiated by your department manager (${
          currentUser.managerId ? 'Marcus Vance' : 'Department Lead'
        }) or department head.`
      );
      return;
    }
    onOpenShareModal(doc);
  };

  return (
    <div className="space-y-6">
      {/* Role Restriction Banner if triggered */}
      {roleRestrictionMessage && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-start justify-between gap-3 text-amber-200 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{roleRestrictionMessage}</p>
          </div>
          <button
            onClick={() => setRoleRestrictionMessage(null)}
            className="text-amber-400 hover:text-amber-300 font-semibold px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Encrypted Document Vault
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Documents are encrypted at rest with AES-256-GCM and decrypted only in volatile memory.
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-48 sm:w-60"
            />
          </div>

          {/* Classification segmented filter */}
          <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setSelectedClassification('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                selectedClassification === 'all'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedClassification('Strictly Confidential')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                selectedClassification === 'Strictly Confidential'
                  ? 'bg-slate-800 text-rose-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Strictly Conf.
            </button>
            <button
              onClick={() => setSelectedClassification('Confidential')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                selectedClassification === 'Confidential'
                  ? 'bg-slate-800 text-amber-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Confidential
            </button>
          </div>
        </div>
      </div>

      {/* Document Grid / Table */}
      {filteredDocs.length === 0 ? (
        <div className="border border-slate-800 rounded-xl p-12 text-center bg-slate-900/40">
          <FileText className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">No documents found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No confidential documents matched your search filter. Upload a new encrypted document to begin.
          </p>
          <button
            onClick={onOpenUploadModal}
            className="mt-4 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white rounded-lg transition-colors"
          >
            Upload Document
          </button>
        </div>
      ) : (
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/60 divide-y divide-slate-800/80">
          {filteredDocs.map((doc) => {
            const activeSharesForDoc = shares.filter(
              (s) => s.documentId === doc.id && s.status === 'active'
            );

            return (
              <div
                key={doc.id}
                className="p-4 sm:p-5 hover:bg-slate-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Document info */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {doc.title}
                      </h3>
                      {/* Zero-Pill unboxed metadata */}
                      <span className="text-xs text-slate-500">·</span>
                      <span
                        className={`text-xs font-medium ${
                          doc.classification === 'Strictly Confidential'
                            ? 'text-rose-400'
                            : doc.classification === 'Confidential'
                            ? 'text-amber-400'
                            : 'text-indigo-400'
                        }`}
                      >
                        {doc.classification}
                      </span>
                    </div>

                    {/* Technical Metadata Row */}
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                      <span>{doc.filename}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="tabular-nums">{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Lock className="w-3 h-3" />
                        AES-256-GCM
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-400">Owner: {doc.ownerName}</span>
                    </div>

                    {/* Active shares indicators */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1.5">
                      <span>Active Shares:</span>
                      <span className="font-mono font-semibold text-slate-200">
                        {activeSharesForDoc.length}
                      </span>
                      {activeSharesForDoc.length > 0 && (
                        <>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span className="text-indigo-300">
                            {activeSharesForDoc.some((s) => s.viewMode === 'time_limited') && 'Time-Limited · '}
                            {activeSharesForDoc.some((s) => s.viewMode === 'view_once') && 'View-Once · '}
                            {activeSharesForDoc.reduce((acc, s) => acc + s.viewsCount, 0)} total opens
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {/* Share button */}
                  <button
                    onClick={() => handleShareClick(doc)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-lg transition-colors whitespace-nowrap shadow-sm"
                    title={
                      currentUser.role === 'employee'
                        ? 'Employees cannot initiate document shares'
                        : 'Configure granular view controls'
                    }
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>

                  {/* Manage Shares button */}
                  <button
                    onClick={() => onOpenManageShares(doc)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                    <span>Manage</span>
                  </button>

                  {/* Direct In-App Preview */}
                  <button
                    onClick={() => onOpenDirectViewer(doc)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap"
                    title="Open in locked-down in-app viewer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>View</span>
                  </button>

                  {/* Audit button */}
                  <button
                    onClick={() => onViewDocumentAudit(doc.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                    title="View tamper-evident audit ledger for this document"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
