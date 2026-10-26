import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Clock,
  Download,
  AlertOctagon,
  Lock,
  ArrowLeft,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Flame,
  Info,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  requestDocumentAccess,
  downloadWatermarkedCopy,
  completeViewOnceConsumption,
  AccessResult,
  requestOtpSession,
} from '../lib/engine';
import { User, ShareConfig, DocumentItem } from '../types';
import { OtpVerification } from './OtpVerification';

interface SecureViewerPageProps {
  token: string;
  currentUser: User;
  onExit: () => void;
  onViewAudit?: (docId: string) => void;
}

export const SecureViewerPage: React.FC<SecureViewerPageProps> = ({
  token,
  currentUser,
  onExit,
  onViewAudit,
}) => {
  const [accessResult, setAccessResult] = useState<AccessResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isOtpActive, setIsOtpActive] = useState(false);

  // Password verification states
  const [isPasswordActive, setIsPasswordActive] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initial access request
  const fetchAccess = async (otpCode?: string, passwordAttempt?: string) => {
    setIsLoading(true);
    try {
      const pwd = passwordAttempt !== undefined ? passwordAttempt : passwordInput;
      const res = await requestDocumentAccess({
        token,
        currentUser,
        password: pwd,
        otpCode,
        simulatedIp: '192.168.10.84',
        simulatedUserAgent: navigator.userAgent,
      });

      setAccessResult(res);

      if (res.success) {
        setIsPasswordActive(false);
        setIsOtpActive(false);
        if (res.timeRemainingSeconds !== undefined) {
          setTimeRemaining(res.timeRemainingSeconds);
        }

        // If PDF, convert decrypted bytes to in-memory Blob URL for iframe rendering
        if (res.decryptedBytes) {
          const blob = new Blob([res.decryptedBytes as unknown as BlobPart], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setPdfBlobUrl(url);
        }
      } else {
        if (res.error === 'PASSWORD_REQUIRED') {
          setIsPasswordActive(true);
          setPasswordError(null);
        } else if (res.error === 'PASSWORD_INVALID') {
          setIsPasswordActive(true);
          setPasswordError('Incorrect document password entered. Please try again.');
        } else if (res.error === 'OTP_REQUIRED') {
          setIsPasswordActive(false);
          setIsOtpActive(true);
        }
      }
    } catch (err) {
      console.error('Access check failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccess();
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [token]);

  // Server-authoritative countdown ticker
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          // Trigger expired state
          const docTitle = accessResult && accessResult.success
            ? accessResult.document.title
            : accessResult?.documentTitle || 'Confidential Document';

          setAccessResult({
            success: false,
            error: 'TIME_EXPIRED',
            message: 'Viewing duration has reached zero. Memory buffers purged.',
            documentTitle: docTitle,
          });
          if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
          setPdfBlobUrl(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, accessResult]);

  // Clean-up view-once on unmount
  useEffect(() => {
    return () => {
      if (accessResult?.success && accessResult.share.viewMode === 'view_once') {
        completeViewOnceConsumption(accessResult.share.id);
      }
    };
  }, [accessResult]);

  // Browser-level DRM Deterrence: Intercept right-click, selection, print, copy, save
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerToast('Right-click context menu is restricted by security policy.');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P / Cmd+P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        triggerToast('Printing is blocked by document security covenants.');
      }
      // Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        triggerToast('Local saving of encrypted buffers is restricted.');
      }
      // Ctrl+C / Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        triggerToast('Clipboard copying is disabled for this secure file.');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const triggerToast = (msg: string) => {
    setSecurityToast(msg);
    setTimeout(() => {
      setSecurityToast(null);
    }, 3500);
  };

  const handleDownloadCopy = async () => {
    if (!accessResult || !accessResult.success) return;
    setIsDownloading(true);
    try {
      const { pdfBytes, filename } = await downloadWatermarkedCopy({
        share: accessResult.share,
        document: accessResult.document,
        currentUser,
        watermarkConfig: accessResult.watermarkConfig,
      });

      // Stream to client as download
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      triggerToast('Failed to generate watermarked download.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExitViewer = async () => {
    if (accessResult?.success && accessResult.share.viewMode === 'view_once') {
      await completeViewOnceConsumption(accessResult.share.id);
    }
    onExit();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4" />
        <h2 className="text-sm font-semibold text-slate-200">
          Decrypting Document in Volatile Memory...
        </h2>
        <p className="text-xs text-slate-500 font-mono mt-1">
          Zero-disk write architecture • AES-256-GCM
        </p>
      </div>
    );
  }

  // Handle Password Verification State
  if (isPasswordActive && accessResult && !accessResult.success) {
    const hint = accessResult.details?.hint as string | undefined;
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-700/80 flex items-center justify-center text-indigo-400 mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Password Protected Document
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              The sender has restricted <span className="font-semibold text-slate-200">"{accessResult.documentTitle || 'this document'}"</span> with an access password.
            </p>
          </div>

          {passwordError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{passwordError}</span>
            </div>
          )}

          {hint && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
              <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block">
                Sender Hint
              </span>
              <p className="italic text-slate-300">{hint}</p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!passwordInput.trim()) return;
              fetchAccess(undefined, passwordInput.trim());
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Enter Password / Passkey
              </label>
              <div className="relative">
                <input
                  type={showPasswordInput ? 'text' : 'password'}
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Enter sender-provided password"
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordInput(!showPasswordInput)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPasswordInput ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!passwordInput.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-xl transition-colors shadow-sm"
            >
              <Lock className="w-4 h-4" />
              <span>Unlock Document</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={onExit}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Cancel and Return</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle OTP Verification State
  if (isOtpActive && accessResult && !accessResult.success && accessResult.share) {
    return (
      <OtpVerification
        share={accessResult.share}
        recipientEmail={currentUser.email}
        onVerified={(code) => {
          setIsOtpActive(false);
          fetchAccess(code);
        }}
        onCancel={onExit}
      />
    );
  }

  // Handle Error Screens (Revoked, Expired, Burned, Unauthorized)
  if (!accessResult || !accessResult.success) {
    const errorType = accessResult?.error || 'INVALID_TOKEN';
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400 mx-auto mb-4">
            {errorType === 'REVOKED' ? (
              <AlertOctagon className="w-7 h-7" />
            ) : errorType === 'BURNED' ? (
              <Flame className="w-7 h-7" />
            ) : errorType === 'UNAUTHORIZED_USER' ? (
              <Lock className="w-7 h-7" />
            ) : (
              <Clock className="w-7 h-7" />
            )}
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight">
            {errorType === 'REVOKED' && 'Access Revoked by Owner'}
            {errorType === 'BURNED' && 'View-Once Link Already Burned'}
            {errorType === 'EXPIRED' && 'Access Window Expired'}
            {errorType === 'TIME_EXPIRED' && 'Viewing Session Concluded'}
            {errorType === 'UNAUTHORIZED_USER' && 'Unauthorized Internal Access'}
            {errorType === 'MAX_VIEWS_REACHED' && 'Maximum Opens Exceeded'}
            {errorType === 'INVALID_TOKEN' && 'Invalid Document Link'}
          </h2>

          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {accessResult?.message ||
              'The requested document link could not be verified by the cryptographic security gateway.'}
          </p>

          <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800/80 text-[11px] font-mono text-slate-500 text-left">
            <div>EVENT_TYPE: {errorType}</div>
            <div>ACTOR: {currentUser.email}</div>
            <div>GATEWAY_LOG: Immutable entry committed to audit ledger</div>
          </div>

          <button
            onClick={onExit}
            className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg transition-colors border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  const { document, share, watermarkConfig } = accessResult;

  // Format time remaining MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-slate-950 flex flex-col select-none text-slate-100"
      style={{ userSelect: 'none' }}
    >
      {/* Security Toast Message */}
      {securityToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-950/90 text-rose-200 border border-rose-700/80 px-4 py-2 rounded-xl text-xs font-medium shadow-2xl flex items-center gap-2 animate-bounce">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>{securityToast}</span>
        </div>
      )}

      {/* Top Security Control Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleExitViewer}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit Viewer</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {document.title}
              </span>
              <span className="text-[11px] text-slate-500">·</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {document.classification}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono truncate">
              Encrypted Stream: AES-256-GCM • Recipient: {watermarkConfig.viewerEmail}
            </p>
          </div>
        </div>

        {/* Center / Right: Live Countdown & Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {timeRemaining !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold ${
                timeRemaining <= 60
                  ? 'bg-rose-950/60 border-rose-700 text-rose-400 animate-pulse'
                  : 'bg-indigo-950/40 border-indigo-700/80 text-indigo-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTime(timeRemaining)}</span>
              <span className="text-[10px] font-normal text-slate-400 ml-1">remaining</span>
            </div>
          )}

          {share.viewMode === 'view_once' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-rose-950/40 border border-rose-800/80 text-rose-300 rounded-lg">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Single-Use Link</span>
            </div>
          )}

          {/* Watermarked Download (only if sender permitted) */}
          {share.accessMode === 'allow_download' && (
            <button
              onClick={handleDownloadCopy}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors shadow-sm"
              title="Download watermarked PDF with your tracking ID"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloading ? 'Stamping...' : 'Download Watermarked PDF'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Security Disclaimer Banner */}
      <div className="bg-slate-900/80 border-b border-slate-800/60 px-4 py-2 text-[11px] text-slate-400 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>
            <strong className="text-slate-300">Deterrence Notice:</strong> Screen protection active. Right-click, print, and local saving are blocked. All access is digitally watermarked with your identity ({watermarkConfig.viewerEmail}) and tracked under ID <span className="font-mono text-slate-200">{watermarkConfig.trackingId}</span>.
          </span>
        </div>
        <span className="hidden md:inline font-mono text-[10px] text-slate-500">
          ZERO-DISK IN-MEMORY DECRYPTION
        </span>
      </div>

      {/* Document Viewport with Dynamic Tiled Watermark */}
      <div className="flex-1 relative overflow-auto p-4 sm:p-8 flex items-center justify-center bg-slate-950">
        {/* Tiled Watermark Overlay (Repeats across the entire viewer) */}
        <div
          className="pointer-events-none absolute inset-0 z-30 overflow-hidden flex flex-wrap items-center justify-around opacity-[0.09]"
          style={{ transform: 'rotate(-25deg) scale(1.15)' }}
        >
          {Array.from({ length: 48 }).map((_, i) => (
            <div
              key={i}
              className="p-8 text-center text-xs font-mono font-bold tracking-widest text-slate-100 whitespace-nowrap"
            >
              <div>CONFIDENTIAL • {watermarkConfig.viewerEmail}</div>
              <div>{watermarkConfig.trackingId} • {watermarkConfig.timestampUtc}</div>
            </div>
          ))}
        </div>

        {/* In-App Document Canvas / Content */}
        <div className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 sm:p-10 min-h-[600px] flex flex-col justify-between">
          {/* Header on document */}
          <div className="border-b border-slate-800 pb-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-rose-400 font-bold tracking-wider">
                HAVEN VAULT • RESTRICTED ACCESS
              </span>
              <span className="text-xs font-mono text-slate-400">
                TRACKING ID: {watermarkConfig.trackingId}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-2">
              {document.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-1">
              <span>Classification: {document.classification}</span>
              <span>·</span>
              <span>Owner: {document.ownerName}</span>
              <span>·</span>
              <span>Issued to: {watermarkConfig.viewerName}</span>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 space-y-6 text-sm text-slate-300 leading-relaxed font-sans">
            {pdfBlobUrl ? (
              <div className="space-y-4">
                <div className="p-4 bg-slate-950/80 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>In-Memory Decrypted Document Content</span>
                  </div>
                  <p>
                    This confidential document was decrypted strictly into client volatile memory using AES-256-GCM. No unencrypted file has touched local disk.
                  </p>
                  <div className="p-3 bg-slate-900 rounded font-mono text-xs text-slate-300 border border-slate-800 space-y-1">
                    <p className="text-indigo-300 font-bold">EXECUTIVE MEMORANDUM & SCHEDULE</p>
                    <p>File: {document.filename}</p>
                    <p>Integrity Checksum: {document.checksum}</p>
                    <p>Authorized Recipient: {watermarkConfig.viewerEmail}</p>
                  </div>
                </div>

                {/* PDF Viewer Frame with DRM protections */}
                <div className="w-full h-[520px] rounded-lg border border-slate-800 bg-slate-950 overflow-hidden relative">
                  <iframe
                    src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                    className="w-full h-full border-0"
                    title="Confidential PDF Viewer"
                  />
                </div>
              </div>
            ) : (
              <div className="p-6 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-300">
                {accessResult.decryptedText || 'Decrypted payload rendered in volatile memory.'}
              </div>
            )}
          </div>

          {/* Document Footer */}
          <div className="border-t border-slate-800 pt-4 mt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 font-mono gap-2">
            <span>
              STAMPED: {watermarkConfig.timestampUtc} • RECIPIENT: {watermarkConfig.viewerEmail}
            </span>
            <span>UNLAWFUL REPRODUCTION TRACEABLE TO TRACKING ID</span>
          </div>
        </div>
      </div>
    </div>
  );
};
