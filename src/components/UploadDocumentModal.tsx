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
} from 'lucide-react';
import { DocumentClassification, DocumentItem, User } from '../types';
import { uploadAndEncryptDocument } from '../lib/engine';
import { createSamplePdf } from '../lib/pdfWatermark';

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

  const [isEncrypting, setIsEncrypting] = useState(false);
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

    try {
      let fileBytes: Uint8Array;
      let filename: string;
      let fileType: DocumentItem['fileType'] = 'pdf';

      if (mode === 'upload' && selectedFile) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        fileBytes = new Uint8Array(arrayBuffer);
        filename = selectedFile.name;
        if (selectedFile.type.includes('pdf')) {
          fileType = 'pdf';
        } else if (selectedFile.type.includes('image')) {
          fileType = 'image';
        } else {
          fileType = 'text';
        }
      } else {
        // Compose mode: generate PDF on the fly using pdf-lib
        const samplePdfBytes = await createSamplePdf(memoSubject, [
          {
            heading: 'Confidential Memorandum',
            paragraphs: memoBody.split('\n\n').filter(Boolean),
          },
        ]);
        fileBytes = samplePdfBytes;
        filename = `${memoSubject.replace(/[^a-zA-Z0-9]/g, '_')}_Confidential.pdf`;
        fileType = 'pdf';
      }

      const doc = await uploadAndEncryptDocument({
        title: title || memoSubject || 'Confidential Document',
        filename,
        fileBytes,
        fileType,
        classification,
        currentUser,
      });

      onDocumentUploaded(doc);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to encrypt and store document.');
    } finally {
      setIsEncrypting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Encrypt & Upload to Vault
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
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
              onClick={() => setMode('upload')}
              className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                mode === 'upload' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'
              }`}
            >
              Upload Existing File
            </button>
            <button
              type="button"
              onClick={() => setMode('compose')}
              className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                mode === 'compose' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'
              }`}
            >
              Compose Confidential Memo
            </button>
          </div>

          {mode === 'upload' ? (
            /* Upload file zone */
            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Document Title</label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Executive Compensation Strategy"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/80 bg-slate-950/60 rounded-xl p-6 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-300">
                  {selectedFile ? selectedFile.name : 'Click to select a file'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Supports PDF, TXT, Markdown, PNG, JPG (Encrypted in memory with AES-256-GCM)
                </p>
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
                <label className="block text-slate-400 mb-1 font-semibold">Memo Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Strategic Restructuring Phase II"
                  value={memoSubject}
                  onChange={(e) => {
                    setMemoSubject(e.target.value);
                    setTitle(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Memo Content</label>
                <textarea
                  rows={4}
                  placeholder="Enter classified notes or covenants..."
                  value={memoBody}
                  onChange={(e) => setMemoBody(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                />
              </div>
            </div>
          )}

          {/* Classification Selector */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-semibold">
              Security Classification
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Strictly Confidential', 'Confidential', 'Internal Only'] as DocumentClassification[]).map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setClassification(c)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      classification === c
                        ? 'bg-indigo-950/40 border-indigo-500 text-white font-semibold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="truncate">{c}</div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] text-slate-400 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              Your browser will encrypt these bytes using Web Crypto AES-256-GCM before saving. No plaintext touches unencrypted storage.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
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
