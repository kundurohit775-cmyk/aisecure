import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  Lock,
  CheckCircle2,
  AlertTriangle,
  FilePlus,
  Shield,
  KeyRound,
  Hash,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { DocumentClassification, DocumentItem, User } from '../types';
import { uploadAndEncryptDocument } from '../lib/engine';
import { createSamplePdf } from '../lib/pdfWatermark';
import { convertToEncryptedPdfBuffer } from '../lib/docxHelper';

interface UploadDocumentModalProps {
  currentUser: User;
  onClose: () => void;
  onDocumentUploaded: (newDoc: DocumentItem) => void;
}

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  currentUser,
  onClose,
  onDocumentUploaded,
}) => {
  const [mode, setMode] = useState<'upload' | 'compose'>('upload');
  const [title, setTitle] = useState('');
  const [classification, setClassification] =
    useState<DocumentClassification>('Strictly Confidential');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Compose mode states
  const [memoSubject, setMemoSubject] = useState('');
  const [memoBody, setMemoBody] = useState('');

  // Live cryptographic pipeline steps
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [cryptoStep, setCryptoStep] = useState<number>(0);
  const [encryptionProof, setEncryptionProof] = useState<{
    ivPreview: string;
    saltPreview: string;
    ciphertextSnippet: string;
    checksum: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEncrypting) return;
    setError(null);

    if (mode === 'upload' && !selectedFile) {
      setError('Please select a file to encrypt and upload.');
      return;
    }

    if (mode === 'compose' && (!memoSubject.trim() || !memoBody.trim())) {
      setError('Please enter both subject and body for the confidential memo.');
      return;
    }

    setIsEncrypting(true);
    setCryptoStep(1);

    try {
      let fileBytes: Uint8Array;
      let filename: string;
      const fileType: DocumentItem['fileType'] = 'pdf';

      if (mode === 'upload' && selectedFile) {
        filename = selectedFile.name;
        const arrayBuffer = await selectedFile.arrayBuffer();

        // Step 1: Ingest into volatile memory
        setCryptoStep(2);
        await new Promise((r) => setTimeout(r, 200));

        // Format and convert non-PDF files (DOCX, text, etc.) into structured PDF in memory
        const lower = filename.toLowerCase();
        if (lower.endsWith('.pdf')) {
          fileBytes = new Uint8Array(arrayBuffer);
        } else {
          fileBytes = await convertToEncryptedPdfBuffer({
            filename,
            buffer: arrayBuffer,
            defaultTitle: title || filename.replace(/\.[^/.]+$/, ''),
          });
        }
      } else {
        filename = `${(memoSubject || 'Memorandum').replace(/[^a-zA-Z0-9]/g, '_')}_Confidential.pdf`;
        setCryptoStep(2);
        await new Promise((r) => setTimeout(r, 200));

        const samplePdfBytes = await createSamplePdf(memoSubject, [
          {
            heading: 'Confidential Memorandum',
            paragraphs: memoBody.split('\n\n').filter(Boolean),
          },
        ]);
        fileBytes = samplePdfBytes;
      }

      // Step 3: Key derivation via PBKDF2 (100,000 iterations)
      setCryptoStep(3);
      await new Promise((r) => setTimeout(r, 300));

      // Step 4: AES-256-GCM authenticated encryption
      setCryptoStep(4);
      await new Promise((r) => setTimeout(r, 250));

      const doc = await uploadAndEncryptDocument({
        title: title || memoSubject || filename,
        filename,
        fileBytes,
        fileType,
        classification,
        currentUser,
      });

      // Step 5: Verification & Checksum
      setCryptoStep(5);
      setEncryptionProof({
        ivPreview: doc.encryptedPayload?.iv || '',
        saltPreview: doc.encryptedPayload?.salt || '',
        ciphertextSnippet: (doc.encryptedPayload?.ciphertext || 'CIPHERTEXT_REST').substring(0, 80) + '...',
        checksum: doc.checksum,
      });

      await new Promise((r) => setTimeout(r, 400));
      onDocumentUploaded(doc);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to encrypt and store document.');
      setIsEncrypting(false);
      setCryptoStep(0);
    }
  };

  const getFileExtension = (name: string) => {
    const ext = name.split('.').pop()?.toUpperCase() || 'FILE';
    return ext;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Encrypt & Upload to Vault
              </h2>
              <p className="text-xs text-slate-400">
                AES-256-GCM zero-disk volatile memory pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isEncrypting}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              disabled={isEncrypting}
              onClick={() => setMode('upload')}
              className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                mode === 'upload' ? 'bg-slate-800 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Upload Document (PDF, Word, TXT, Images)
            </button>
            <button
              type="button"
              disabled={isEncrypting}
              onClick={() => setMode('compose')}
              className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                mode === 'compose' ? 'bg-slate-800 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compose Confidential Memo
            </button>
          </div>

          {mode === 'upload' ? (
            /* Upload file zone */
            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Document Title</label>
                <input
                  type="text"
                  disabled={isEncrypting}
                  placeholder="e.g. Q4 Executive Restructuring Matrix"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div
                onClick={() => !isEncrypting && fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/80 bg-slate-950/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-950/60 border border-indigo-700/60 flex items-center justify-center text-indigo-400 mx-auto mb-2">
                  <Upload className="w-5 h-5" />
                </div>
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-200 text-sm">{selectedFile.name}</p>
                    <p className="text-[11px] text-indigo-400 font-mono">
                      {getFileExtension(selectedFile.name)} · {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-300">
                      Click to browse or drop file here
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Supports PDF, Word (.docx), TXT, Markdown, PNG, JPG
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          ) : (
            /* Compose memo zone */
            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Memo Subject</label>
                <input
                  type="text"
                  disabled={isEncrypting}
                  placeholder="e.g. Bilateral Corporate Restructuring Directives"
                  value={memoSubject}
                  onChange={(e) => {
                    setMemoSubject(e.target.value);
                    setTitle(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Classified Memo Body</label>
                <textarea
                  rows={4}
                  disabled={isEncrypting}
                  placeholder="Enter confidential memorandum text, covenants, and notes..."
                  value={memoBody}
                  onChange={(e) => setMemoBody(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                />
              </div>
            </div>
          )}

          {/* Classification Selector */}
          <div>
            <label className="block text-slate-300 mb-1.5 font-semibold">
              Security Classification Tier
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Strictly Confidential', 'Confidential', 'Internal Only'] as DocumentClassification[]).map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={isEncrypting}
                    onClick={() => setClassification(c)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      classification === c
                        ? 'bg-indigo-950/40 border-indigo-500 text-white font-semibold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="truncate font-medium">{c}</div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Real-Time Cryptographic Pipeline Progress */}
          {isEncrypting && (
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5 font-mono text-[11px]">
              <div className="flex items-center justify-between text-indigo-300 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Executing Cryptographic Pipeline...</span>
                </span>
                <span>Step {cryptoStep} / 5</span>
              </div>

              <div className="space-y-1 text-slate-400">
                <div className={cryptoStep >= 1 ? 'text-emerald-400' : 'text-slate-600'}>
                  {cryptoStep >= 1 ? '✓' : '○'} 1. Stream buffer into volatile RAM (io.BytesIO / ArrayBuffer)
                </div>
                <div className={cryptoStep >= 2 ? 'text-emerald-400' : 'text-slate-600'}>
                  {cryptoStep >= 2 ? '✓' : '○'} 2. Generate 12-byte CSPRNG IV nonce & 16-byte random salt
                </div>
                <div className={cryptoStep >= 3 ? 'text-emerald-400' : 'text-slate-600'}>
                  {cryptoStep >= 3 ? '✓' : '○'} 3. Derive 256-bit AES key via PBKDF2 (100,000 SHA-256 iterations)
                </div>
                <div className={cryptoStep >= 4 ? 'text-emerald-400' : 'text-slate-600'}>
                  {cryptoStep >= 4 ? '✓' : '○'} 4. Encrypt buffer with AES-256-GCM authenticated cipher
                </div>
                <div className={cryptoStep >= 5 ? 'text-emerald-400' : 'text-slate-600'}>
                  {cryptoStep >= 5 ? '✓' : '○'} 5. Calculate SHA-256 tamper-evident checksum & commit to vault
                </div>
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] text-slate-400 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Zero-Disk Guarantee: Web Crypto API encrypts file bytes strictly in client memory. Only the AES-256-GCM ciphertext payload is saved in storage.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isEncrypting}
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isEncrypting}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-white rounded-lg transition-colors shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isEncrypting ? 'Encrypting with AES-256...' : 'Encrypt & Store'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
