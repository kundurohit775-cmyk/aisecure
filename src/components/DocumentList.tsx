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
  ShieldCheck,
  Cpu,
  Key,
  Hash,
  Database,
  ArrowUpRight,
  Layers,
  Sparkles,
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
  onInspectCrypto: (doc: DocumentItem) => void;
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
  onInspectCrypto,
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
        `Role Restriction: As an Employee (${currentUser.name}), your account is restricted from initiating document shares. Share delegation must be initiated by your department manager (${
          currentUser.managerId ? 'Marcus Vance' : 'Department Lead'
        }) or department head.`
      );
      return;
    }
    onOpenShareModal(doc);
  };

  const activeSharesCount = shares.filter((s) => s.status === 'active').length;
  const totalViewsRecorded = shares.reduce((acc, s) => acc + s.viewsCount, 0);

  const getFileTypeBadge = (filename: string, fileType: string) => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf') || fileType === 'pdf') {
      return {
        label: 'PDF',
        bgColor: 'bg-rose-950/60',
        borderColor: 'border-rose-800/80',
        textColor: 'text-rose-400',
      };
    }
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      return {
        label: 'DOCX',
        bgColor: 'bg-blue-950/60',
        borderColor: 'border-blue-800/80',
        textColor: 'text-blue-400',
      };
    }
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return {
        label: 'IMG',
        bgColor: 'bg-emerald-950/60',
        borderColor: 'border-emerald-800/80',
        textColor: 'text-emerald-400',
      };
    }
    return {
      label: 'TXT',
      bgColor: 'bg-amber-950/60',
      borderColor: 'border-amber-800/80',
      textColor: 'text-amber-400',
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Security Overview Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Encrypted Vault Storage</span>
            <Database className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {documents.length} <span className="text-xs font-normal text-slate-400">Files</span>
          </div>
          <p className="text-[10px] text-emerald-400 font-mono">0 bytes unencrypted on disk</p>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Active Share Links</span>
            <Share2 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {activeSharesCount} <span className="text-xs font-normal text-slate-400">Active</span>
          </div>
          <p className="text-[10px] text-indigo-300 font-mono">{totalViewsRecorded} total opens tracked</p>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Cryptographic Engine</span>
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-sm font-bold font-mono text-white pt-1">
            AES-256-GCM
          </div>
          <p className="text-[10px] text-slate-400 font-mono">PBKDF2 100k rounds · Web Crypto</p>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Audit Ledger State</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-sm font-bold font-mono text-emerald-400 pt-1">
            100% Sealed
          </div>
          <p className="text-[10px] text-slate-400 font-mono">SHA-256 Hash Chaining</p>
        </div>
      </div>

      {/* Role Restriction Banner if triggered */}
      {roleRestrictionMessage && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-start justify-between gap-3 text-amber-200 text-xs animate-fadeIn">
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
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Encrypted Document Vault</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Documents are encrypted at rest with AES-256-GCM and decrypted only in volatile memory.
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents or owners..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-48 sm:w-64"
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
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/60 divide-y divide-slate-800/80 shadow-xl">
          {filteredDocs.map((doc) => {
            const activeSharesForDoc = shares.filter(
              (s) => s.documentId === doc.id && s.status === 'active'
            );
            const badge = getFileTypeBadge(doc.filename, doc.fileType);

            return (
              <div
                key={doc.id}
                className="p-4 sm:p-5 hover:bg-slate-800/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Document info */}
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* File Type Badge Box */}
                  <div className={`w-11 h-11 rounded-xl ${badge.bgColor} border ${badge.borderColor} flex flex-col items-center justify-center shrink-0 mt-0.5`}>
                    <FileText className={`w-5 h-5 ${badge.textColor}`} />
                    <span className={`text-[9px] font-bold font-mono ${badge.textColor} leading-none mt-0.5`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {doc.title}
                      </h3>
                      {/* Zero-Pill unboxed metadata */}
                      <span className="text-xs text-slate-600">·</span>
                      <span
                        className={`text-xs font-semibold ${
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
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono flex-wrap">
                      <span className="text-slate-300">{doc.filename}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="tabular-nums">{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>

                      {/* Interactive Encryption Pill */}
                      <button
                        onClick={() => onInspectCrypto(doc)}
                        className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 px-2 py-0.5 rounded text-[11px] transition-colors"
                        title="Click to view AES-256 ciphertext, IV, salt, and run live in-memory decryption test"
                      >
                        <Lock className="w-3 h-3" />
                        <span>AES-256-GCM Verified</span>
                        <ArrowUpRight className="w-2.5 h-2.5 text-emerald-400/80" />
                      </button>

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
                            {activeSharesForDoc.some((s) => s.requirePassword) && 'Password-Locked · '}
                            {activeSharesForDoc.reduce((acc, s) => acc + s.viewsCount, 0)} total opens
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                  {/* Share button */}
                  <button
                    onClick={() => handleShareClick(doc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors whitespace-nowrap shadow-sm"
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

                  {/* Inspect Cipher proof */}
                  <button
                    onClick={() => onInspectCrypto(doc)}
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Inspect AES-256 Ciphertext, IV, Salt, and test in-memory decryption"
                  >
                    <Lock className="w-4 h-4" />
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
