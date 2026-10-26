import React from 'react';
import {
  ShieldCheck,
  Lock,
  Cpu,
  Eye,
  Server,
  FileCheck,
  AlertTriangle,
  KeyRound,
  Layers,
  Terminal,
  Clock,
  Ban,
  CheckCircle2,
} from 'lucide-react';

export const SecurityArchitectureView: React.FC = () => {
  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          Security Architecture & Production Deployment Layer
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Technical specifications, cryptographic primitives, and threat model boundary definitions.
        </p>
      </div>

      {/* Grid of Key Architecture Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pillar 1: Zero-Disk In-Memory Decryption */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">1. Zero-Disk In-Memory Decryption</h3>
              <p className="text-[11px] text-emerald-400 font-mono">AES-256-GCM · PBKDF2 Key Derivation</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Documents are encrypted at rest using AES-256 in Galois/Counter Mode with 12-byte cryptographic IVs and 16-byte random salts. When an authorized request arrives, decryption and watermarking occur strictly in volatile RAM (<code className="text-indigo-300 font-mono">io.BytesIO / ArrayBuffer</code>) and stream directly to the client socket. No unencrypted file ever touches server disk or persistent cache.
          </p>
        </div>

        {/* Pillar 2: Server-Authoritative Share Controls */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">2. Server-Authoritative Enforcement</h3>
              <p className="text-[11px] text-indigo-400 font-mono">Clock Spoofing Resistant</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            All limits (View Once, time countdown, maximum views, and calendar cutoff) are validated on the backend for every request. The client countdown ticker is purely cosmetic; modifying device system clocks or freezing JavaScript timers has zero effect on the server's session cutoff.
          </p>
        </div>

        {/* Pillar 3: Browser DRM Deterrence & Disclaimer */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">3. Locked-Down Viewer & Deterrence</h3>
              <p className="text-[11px] text-amber-400 font-mono">Anti-Casual Copying Protocol</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            The in-app viewer suppresses right-click menus, text highlighting, clipboard copying, and intercepting print / save hotkeys (<code className="text-amber-300 font-mono">Ctrl+P / Ctrl+S</code>). CSS print media rules hide document markup entirely. A visible security disclaimer clarifies that external optical capture (phone cameras, external capture cards) cannot be prevented by web software, which is why watermarking is mandatory for leak attribution.
          </p>
        </div>

        {/* Pillar 4: Dynamic Watermarked Downloads */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-800/80 flex items-center justify-center text-purple-400">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">4. Dynamic Diagonal Watermarking</h3>
              <p className="text-[11px] text-purple-400 font-mono">Tracking ID: DL-xxxx · Per-Page Stamp</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            If watermarked downloads are permitted by the sender, the engine modifies the PDF stream on the fly using <code className="text-purple-300 font-mono">pdf-lib</code>. Each page is diagonally stamped with the downloader's verified identity, email, UTC timestamp, and a unique tracking ID, committed permanently to the audit log.
          </p>
        </div>
      </div>

      {/* Internal Role-Based Sharing Hierarchy Diagram */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">
            Internal Role-Based Access Control (RBAC) & Reporting Graph
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">Admin (Department Head)</span>
              <span className="text-[10px] font-mono text-emerald-400">FULL DELEGATION</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Elena Rostova (VP Engineering). Can delegate and share documents to any team member across all department tiers.
            </p>
          </div>

          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">Manager (Engineering & Product)</span>
              <span className="text-[10px] font-mono text-indigo-400">RESTRICTED SCOPE</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Marcus Vance & Diana Prince. Permitted to share strictly with direct reports and upward to their department head.
            </p>
          </div>

          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">Employee (Engineers & Analysts)</span>
              <span className="text-[10px] font-mono text-rose-400">NO SHARING PRIVILEGE</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Sarah Chen, David Kim, Alex Rivera. Recipient-only accounts. Cannot initiate internal or external shares per governance policy.
            </p>
          </div>
        </div>
      </div>

      {/* Multi-Layered Authentication: Password Passkey & Email OTP */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">
            Multi-Layered Authentication: Sender Passkey & Email OTP Verification
          </h2>
        </div>
        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 font-mono text-[11px]">
            <div className="text-indigo-400 font-semibold mb-1">[PASSWORD PASSKEY LAYER]</div>
            <div className="text-emerald-400">✓ Out-of-Band Sender Passkey: Sender defines secret passkey communicated out-of-band (e.g. phone/SMS)</div>
            <div className="text-emerald-400">✓ SHA-256 Memory Hashing: Plaintext passkey is never logged or stored; verified via cryptographic hash match</div>
            <div className="text-emerald-400">✓ Dual Verification Support: Can run standalone or chained with Email OTP for true 2-factor authentication</div>
            <div className="text-indigo-400 font-semibold mt-2 mb-1">[EMAIL OTP LAYER]</div>
            <div className="text-emerald-400">✓ 6-Digit Single-Use Passcodes: Cryptographically generated via CSPRNG with 5-minute expiry</div>
            <div className="text-emerald-400">✓ Brute Force Lock: Automatically locks and burns token after 5 incorrect verification attempts</div>
            <div className="text-emerald-400">✓ Rate Limiting & Cooldown: Enforces 60-second cooldown between resend requests</div>
            <div className="text-emerald-400">✓ Enumeration Resistance: Dispatches identical generic message regardless of email validity</div>
          </div>
        </div>
      </div>

      {/* Production Deployment Layer Checklist */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">
            Production Deployment & Security Hardening
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="font-semibold text-slate-200">Email Infrastructure (Resend / SendGrid)</div>
            <p className="text-slate-400 text-[11px]">
              Configured on verified corporate domains with SPF, DKIM, and DMARC enforcement. Webhooks ingest bounce and complaint events to maintain suppression blacklists.
            </p>
          </div>

          <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="font-semibold text-slate-200">Redis Token Bucket Rate Limiting</div>
            <p className="text-slate-400 text-[11px]">
              Distributed rate limiting per IP and per share token prevents automated code probing and credential stuffing on verification endpoints.
            </p>
          </div>

          <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="font-semibold text-slate-200">HTTP Security Headers</div>
            <p className="text-slate-400 text-[11px] font-mono">
              Strict-Transport-Security: max-age=63072000; includeSubDomains<br />
              Content-Security-Policy: frame-ancestors 'self'<br />
              X-Content-Type-Options: nosniff
            </p>
          </div>

          <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="font-semibold text-slate-200">Tamper-Evident SHA-256 Audit Chaining</div>
            <p className="text-slate-400 text-[11px]">
              Each audit entry cryptographically seals the previous hash, creating a blockchain-like immutable ledger that detects retroactive tampering.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
