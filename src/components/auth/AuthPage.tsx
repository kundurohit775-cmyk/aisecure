import React, { useState, useEffect } from 'react';
import { Shield, Lock, Mail, User, Building, AlertCircle, CheckCircle2, ArrowRight, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AuthPageProps {
  initialMode?: 'login' | 'register' | 'forgot';
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login' }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'verify' | 'reset'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Executive Leadership');
  const [inviteToken, setInviteToken] = useState('');

  // Reset password states
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Check URL hash for direct auth actions like verify-email, reset-password, accept-invite
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/verify-email')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const token = params.get('token');
      if (token) {
        setMode('verify');
        handleVerifyEmailToken(token);
      }
    } else if (hash.startsWith('#/reset-password')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const token = params.get('token');
      if (token) {
        setResetToken(token);
        setMode('reset');
      }
    } else if (hash.startsWith('#/accept-invite')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const token = params.get('token');
      if (token) {
        setInviteToken(token);
        setMode('register');
        setSuccessMessage('Invitation detected. Complete registration below to claim your account.');
      }
    }
  }, []);

  const handleVerifyEmailToken = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/verify-email?token=${token}`);
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(data.message || 'Email verified successfully! You can now log in.');
      } else {
        setErrorMessage(data.error || 'Failed to verify email. Token may be expired.');
      }
    } catch {
      setErrorMessage('Network error during verification');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    const result = await login(email, password);
    setLoading(false);

    if (!result.success) {
      if (result.requiresVerification) {
        setErrorMessage('Your email address has not been verified yet. Check your inbox for the activation link.');
      } else {
        setErrorMessage(result.error || 'Login failed. Please check your credentials.');
      }
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    const result = await register({
      name,
      email,
      password,
      department,
      inviteToken: inviteToken || undefined,
    });
    setLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Registration failed');
    } else {
      if (result.requiresVerification) {
        setSuccessMessage('Registration successful! Please check your email to verify your account.');
        setMode('login');
      }
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setSuccessMessage(data.message || 'If that email is registered, password reset instructions have been sent.');
    } catch {
      setErrorMessage('Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage('Password reset successfully. You can now log in with your new credentials.');
        window.location.hash = '';
        setMode('login');
      } else {
        setErrorMessage(data.error || 'Failed to reset password');
      }
    } catch {
      setErrorMessage('Network error during password reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 text-slate-100">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 mb-2 shadow-lg shadow-indigo-950/50">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">HavenVault</h1>
          <p className="text-xs text-slate-400">
            Zero-Disk In-Memory Decryption & Cryptographic Document Sharing
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Messages */}
          {errorMessage && (
            <div className="mb-4 p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3.5 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Mode Switcher Tabs for Login/Register */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex border-b border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                }}
                className={`flex-1 pb-3 text-xs font-semibold text-center transition-colors border-b-2 ${
                  mode === 'login'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                }}
                className={`flex-1 pb-3 text-xs font-semibold text-center transition-colors border-b-2 ${
                  mode === 'register'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In to Vault'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-slate-500">
                  First user to register becomes Organization Administrator.
                </p>
              </div>
            </form>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sarah Lin"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah.lin@company.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Department</label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Executive Leadership / Engineering / Finance"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {inviteToken && (
                <div className="p-2.5 bg-indigo-950/40 border border-indigo-800/60 rounded-lg text-[11px] text-indigo-300 font-mono">
                  Invite Token: {inviteToken.slice(0, 16)}...
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <span>{loading ? 'Creating Account...' : 'Register Account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Reset Password</h3>
                <p className="text-xs text-slate-400">
                  Enter your work email address and we'll send you a secure password reset link.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{loading ? 'Sending...' : 'Send Reset Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition-colors pt-1"
              >
                Back to Sign In
              </button>
            </form>
          )}

          {/* RESET PASSWORD FORM */}
          {mode === 'reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Set New Password</h3>
                <p className="text-xs text-slate-400">Choose a new secure password for your account.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition-colors"
              >
                <span>{loading ? 'Updating Password...' : 'Save New Password'}</span>
              </button>
            </form>
          )}

          {/* EMAIL VERIFICATION STATUS */}
          {mode === 'verify' && (
            <div className="space-y-4 text-center py-4">
              <h3 className="text-sm font-semibold text-white">Email Verification</h3>
              <p className="text-xs text-slate-400">
                {loading ? 'Verifying your activation token with the security server...' : 'Verification complete.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.hash = '';
                  setMode('login');
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="text-center text-[11px] text-slate-500 font-mono">
          <span>End-to-End Encrypted Session · HTTP-Only SameSite Cookies</span>
        </div>
      </div>
    </div>
  );
};
