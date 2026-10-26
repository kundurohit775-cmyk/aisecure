import React, { useState } from 'react';
import {
  History,
  ShieldCheck,
  Search,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileText,
  UserCheck,
  Lock,
  Flame,
  Clock,
  Ban,
  ArrowDownToLine,
  RefreshCw,
} from 'lucide-react';
import { AuditLogEntry, AuditEventType } from '../types';
import { verifyAuditChainIntegrity } from '../lib/engine';

interface AuditTrailViewProps {
  auditLogs: AuditLogEntry[];
  initialFilterDocId?: string | null;
  onClearDocFilter?: () => void;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({
  auditLogs,
  initialFilterDocId,
  onClearDocFilter,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Hash chain verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    checkedCount: number;
    brokenIndex?: number;
  } | null>(null);

  const filteredLogs = auditLogs.filter((log) => {
    const matchesDoc = initialFilterDocId ? log.documentId === initialFilterDocId : true;
    const matchesEvent = eventTypeFilter === 'all' || log.eventType === eventTypeFilter;
    const matchesSearch =
      log.documentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.userEmail && log.userEmail.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.trackingId && log.trackingId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      log.eventType.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDoc && matchesEvent && matchesSearch;
  });

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await verifyAuditChainIntegrity(auditLogs);
      setVerificationResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const dlAnchor = window.document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `havenvault_audit_ledger_${Date.now()}.json`);
    dlAnchor.click();
  };

  const handleExportCsv = () => {
    const headers = [
      'Timestamp UTC',
      'Event Type',
      'Document ID',
      'Document Title',
      'User Email',
      'User Name',
      'IP Address',
      'Tracking ID',
      'Details',
      'Previous Hash',
      'Current Hash (SHA-256)',
    ];

    const rows = auditLogs.map((l) => [
      l.timestamp,
      l.eventType,
      l.documentId,
      `"${l.documentTitle.replace(/"/g, '""')}"`,
      l.userEmail || '',
      `"${(l.userName || '').replace(/"/g, '""')}"`,
      l.ipAddress,
      l.trackingId || '',
      `"${l.details.replace(/"/g, '""')}"`,
      l.previousHash,
      l.currentHash,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = window.document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `havenvault_audit_ledger_${Date.now()}.csv`);
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const getEventBadge = (type: AuditEventType) => {
    switch (type) {
      case 'DOCUMENT_CREATED':
        return <span className="text-emerald-400 font-mono text-[11px] font-semibold">DOC_CREATED</span>;
      case 'SHARE_LINK_CREATED':
        return <span className="text-indigo-400 font-mono text-[11px] font-semibold">SHARE_CREATED</span>;
      case 'DOC_OPENED':
        return <span className="text-blue-400 font-mono text-[11px] font-semibold">DOC_OPENED</span>;
      case 'DOC_DOWNLOADED':
        return <span className="text-purple-400 font-mono text-[11px] font-semibold">WATERMARK_DL</span>;
      case 'DOC_REVOKED':
        return <span className="text-rose-400 font-mono text-[11px] font-semibold">DOC_REVOKED</span>;
      case 'DOC_EXPIRED':
        return <span className="text-amber-400 font-mono text-[11px] font-semibold">DOC_EXPIRED</span>;
      case 'UNAUTHORIZED_ACCESS_ATTEMPT':
        return <span className="text-rose-500 font-mono text-[11px] font-bold">UNAUTHORIZED</span>;
      case 'OTP_REQUESTED':
        return <span className="text-cyan-400 font-mono text-[11px]">OTP_REQ</span>;
      case 'OTP_VERIFIED':
        return <span className="text-emerald-300 font-mono text-[11px]">OTP_VERIFIED</span>;
      case 'OTP_FAILED':
        return <span className="text-rose-400 font-mono text-[11px]">OTP_FAILED</span>;
      default:
        return <span className="text-slate-400 font-mono text-[11px]">{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Verification */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Immutable Audit Trail & Ledger
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Every access, watermarked download, revocation, and security violation is cryptographically hash-chained (SHA-256).
          </p>
        </div>

        {/* Verification and Export Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isVerifying ? 'Verifying...' : 'Verify Hash Chain'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Hash Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            verificationResult.isValid
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {verificationResult.isValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">
                {verificationResult.isValid
                  ? `Cryptographic Audit Chain Intact (100% Verified)`
                  : 'Hash Chain Tampering Detected!'}
              </p>
              <p className="text-[11px] opacity-90 mt-0.5">
                {verificationResult.isValid
                  ? `All ${verificationResult.checkedCount} ledger entries mathematically validated against SHA-256 genesis anchor.`
                  : `Discrepancy identified at block index #${verificationResult.brokenIndex}. Ledger has been flagged.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setVerificationResult(null)}
            className="text-xs opacity-75 hover:opacity-100 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active Document Filter Notification */}
      {initialFilterDocId && (
        <div className="flex items-center justify-between p-2.5 bg-indigo-950/40 border border-indigo-800/60 rounded-lg text-xs text-indigo-300">
          <span>Filtering audit records for document: <strong className="font-mono text-white">{initialFilterDocId}</strong></span>
          <button
            onClick={onClearDocFilter}
            className="text-indigo-400 hover:text-indigo-200 font-medium underline"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search audit events, users, IP, DL ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Event Type Filter */}
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1 sm:pb-0">
          <span className="text-slate-400 text-[11px] whitespace-nowrap">Event:</span>
          {['all', 'DOC_OPENED', 'DOC_DOWNLOADED', 'UNAUTHORIZED_ACCESS_ATTEMPT', 'DOC_REVOKED'].map(
            (ev) => (
              <button
                key={ev}
                onClick={() => setEventTypeFilter(ev)}
                className={`px-2 py-1 rounded-md text-[11px] font-mono whitespace-nowrap transition-colors ${
                  eventTypeFilter === ev
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ev === 'all'
                  ? 'All'
                  : ev === 'UNAUTHORIZED_ACCESS_ATTEMPT'
                  ? 'Unauthorized'
                  : ev.replace('DOC_', '')}
              </button>
            )
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] bg-slate-950/60">
                <th className="py-3 px-4 font-semibold">Timestamp (UTC)</th>
                <th className="py-3 px-4 font-semibold">Event</th>
                <th className="py-3 px-4 font-semibold">Document</th>
                <th className="py-3 px-4 font-semibold">Actor / Recipient</th>
                <th className="py-3 px-4 font-semibold">Fingerprint / IP</th>
                <th className="py-3 px-4 font-semibold">Tracking ID</th>
                <th className="py-3 px-4 font-semibold font-mono">SHA-256 Checksum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedEntry(log)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    {/* Timestamp */}
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {log.timestamp.replace('T', ' ').substring(0, 19)}
                    </td>

                    {/* Event Type */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getEventBadge(log.eventType)}
                    </td>

                    {/* Document */}
                    <td className="py-3 px-4 text-slate-200 font-sans font-medium truncate max-w-[180px]">
                      {log.documentTitle}
                    </td>

                    {/* Actor */}
                    <td className="py-3 px-4 text-slate-300 font-sans truncate max-w-[180px]">
                      {log.userName || log.userEmail || 'System Gateway'}
                    </td>

                    {/* IP */}
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {log.ipAddress}
                    </td>

                    {/* Tracking ID */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.trackingId ? (
                        <span className="text-purple-300 font-bold">{log.trackingId}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* SHA-256 Hash */}
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap" title={log.currentHash}>
                      {log.currentHash.substring(0, 12)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Entry Detail Drawer / Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Audit Entry Record</h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-500">Timestamp:</span>
                <span>{selectedEntry.timestamp}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-500">Event:</span>
                <span>{selectedEntry.eventType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-500">Document:</span>
                <span className="font-sans font-medium text-white">{selectedEntry.documentTitle}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-500">Actor Email:</span>
                <span>{selectedEntry.userEmail || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-500">Client IP:</span>
                <span>{selectedEntry.ipAddress}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-500">Tracking DL ID:</span>
                <span className="text-purple-300">{selectedEntry.trackingId || 'N/A'}</span>
              </div>
              <div className="py-1">
                <span className="text-slate-500 block mb-1">Details:</span>
                <p className="font-sans text-xs text-slate-200 bg-slate-950 p-2.5 rounded border border-slate-800 leading-relaxed">
                  {selectedEntry.details}
                </p>
              </div>
              <div className="py-1">
                <span className="text-slate-500 block mb-1">Previous Hash:</span>
                <p className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded break-all border border-slate-800">
                  {selectedEntry.previousHash}
                </p>
              </div>
              <div className="py-1">
                <span className="text-slate-500 block mb-1">Current SHA-256 Hash:</span>
                <p className="text-[10px] text-emerald-400 bg-slate-950 p-2 rounded break-all border border-slate-800">
                  {selectedEntry.currentHash}
                </p>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
