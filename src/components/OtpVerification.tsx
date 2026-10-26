import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowLeft,
  Clock,
  AlertTriangle,
  RefreshCw,
  Inbox,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { ShareConfig } from '../types';
import { requestOtpSession } from '../lib/engine';

interface OtpVerificationProps {
  share: ShareConfig;
  recipientEmail: string;
  onVerified: (code: string) => void;
  onCancel: () => void;
}

export const OtpVerification: React.FC<OtpVerificationProps> = ({
  share,
  recipientEmail,
  onVerified,
  onCancel,
}) => {
  const [emailInput, setEmailInput] = useState(recipientEmail);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simulatedInboxCode, setSimulatedInboxCode] = useState<string | null>(null);
  const [showSimulatedEmailDrawer, setShowSimulatedEmailDrawer] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isCodeRequested, setIsCodeRequested] = useState(false);

  // Auto request initial OTP code
  useEffect(() => {
    handleRequestCode();
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleRequestCode = async () => {
    if (cooldownSeconds > 0 || isRequesting) return;
    setIsRequesting(true);
    setErrorMessage(null);

    try {
      const res = await requestOtpSession(share.id, emailInput.trim());
      setInfoMessage(res.message);
      if (res.cooldownSeconds) {
        setCooldownSeconds(res.cooldownSeconds);
      }
      if (res.demoSimulatedCode) {
        setSimulatedInboxCode(res.demoSimulatedCode);
      }
      setIsCodeRequested(true);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to dispatch verification code.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...codeDigits];
    newDigits[index] = value.slice(-1);
    setCodeDigits(newDigits);

    // Auto advance to next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }

    // Auto submit if full 6 digits
    const fullCode = newDigits.join('');
    if (fullCode.length === 6 && !newDigits.includes('')) {
      onVerified(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleAutofillDemoCode = () => {
    if (!simulatedInboxCode) return;
    const digits = simulatedInboxCode.split('');
    setCodeDigits(digits);
    onVerified(simulatedInboxCode);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-700/80 flex items-center justify-center text-indigo-400 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Two-Factor Verification Required
          </h2>
          <p className="text-xs text-slate-400">
            This confidential document is protected by hashed single-use email authentication.
          </p>
        </div>

        {/* Generic Response Info Notice */}
        {infoMessage && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{infoMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        {/* 6-Digit OTP Input Form */}
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-slate-300 text-center">
            Enter 6-Digit Verification Code
          </label>
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            {codeDigits.map((digit, idx) => (
              <input
                key={idx}
                id={`otp-input-${idx}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono text-lg font-bold bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
            <span className="font-mono text-[11px]">Valid for 5 minutes</span>
            <button
              type="button"
              onClick={handleRequestCode}
              disabled={cooldownSeconds > 0 || isRequesting}
              className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1 font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRequesting ? 'animate-spin' : ''}`} />
              <span>
                {cooldownSeconds > 0 ? `Resend code (${cooldownSeconds}s)` : 'Resend code'}
              </span>
            </button>
          </div>
        </div>

        {/* Simulated Email Inbox Preview (For Demo & Testing) */}
        {simulatedInboxCode && (
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Inbox className="w-3.5 h-3.5 text-indigo-400" />
                <span>Simulated Email Delivery Inbox</span>
              </span>
              <button
                type="button"
                onClick={handleAutofillDemoCode}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline"
              >
                Autofill ({simulatedInboxCode})
              </button>
            </div>
            <div className="text-[11px] font-mono text-slate-400 bg-slate-900 p-2.5 rounded border border-slate-800/80 space-y-1">
              <div>From: HavenVault Security &lt;auth@havenvault.internal&gt;</div>
              <div>To: {emailInput}</div>
              <div className="text-white pt-1">
                Security Passcode: <span className="text-indigo-400 font-bold text-sm tracking-widest">{simulatedInboxCode}</span>
              </div>
              <div className="text-slate-500 text-[10px]">
                Single-use • 5 wrong attempts lock this token • Rate-limited
              </div>
            </div>
          </div>
        )}

        {/* Cancel / Return */}
        <div className="pt-2 border-t border-slate-800">
          <button
            onClick={onCancel}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancel and Return</span>
          </button>
        </div>
      </div>
    </div>
  );
};
