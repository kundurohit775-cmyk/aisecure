import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DocumentList } from './components/DocumentList';
import { ShareModal } from './components/ShareModal';
import { ShareManagementModal } from './components/ShareManagementModal';
import { SharedWithMeView } from './components/SharedWithMeView';
import { AuditTrailView } from './components/AuditTrailView';
import { SecurityArchitectureView } from './components/SecurityArchitectureView';
import { SecureViewerPage } from './components/SecureViewerPage';
import { UploadDocumentModal } from './components/UploadDocumentModal';

import {
  DocumentItem,
  ShareConfig,
  AuditLogEntry,
  NotificationItem,
  User,
} from './types';
import { SYSTEM_USERS, initializeSeedData } from './lib/store';
import {
  getStoredDocuments,
  getStoredShares,
  getStoredAuditLogs,
  getStoredNotifications,
  saveNotifications,
} from './lib/engine';

export default function App() {
  // Current active persona (Admin by default)
  const [currentUser, setCurrentUser] = useState<User>(SYSTEM_USERS[0]);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<
    'vault' | 'shares' | 'shared-with-me' | 'audit' | 'security'
  >('vault');

  // Vault data state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [shares, setShares] = useState<ShareConfig[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Active recipient viewer state (when viewing a shared link)
  const [activeViewerToken, setActiveViewerToken] = useState<string | null>(null);

  // Modals
  const [sharingDocument, setSharingDocument] = useState<DocumentItem | null>(null);
  const [managingDocShares, setManagingDocShares] = useState<DocumentItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Audit tab filter
  const [auditDocFilter, setAuditDocFilter] = useState<string | null>(null);

  // Load and seed initial data
  const refreshAllData = () => {
    setDocuments(getStoredDocuments());
    setShares(getStoredShares());
    setAuditLogs(getStoredAuditLogs());
    setNotifications(getStoredNotifications());
  };

  useEffect(() => {
    async function init() {
      setIsInitializing(true);
      try {
        const seed = await initializeSeedData();
        setDocuments(seed.documents);
        setShares(seed.shares);
        setAuditLogs(seed.auditLogs);
        setNotifications(seed.notifications);
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    init();
  }, []);

  // Listen to hash changes for direct #/share/:token links
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/share/')) {
        const token = hash.replace('#/share/', '');
        if (token) {
          setActiveViewerToken(token);
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleOpenViewerWithToken = (token: string) => {
    window.location.hash = `#/share/${token}`;
    setActiveViewerToken(token);
  };

  const handleExitViewer = () => {
    window.location.hash = '';
    setActiveViewerToken(null);
    refreshAllData();
  };

  const handleMarkNotificationRead = (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifications(updated);
    saveNotifications(updated);
  };

  const handleMarkAllNotificationsRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    saveNotifications(updated);
  };

  const handleViewDocumentAudit = (docId: string) => {
    setAuditDocFilter(docId);
    setActiveTab('audit');
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin mb-3" />
        <p className="text-xs font-mono text-slate-400">
          Initializing HavenVault Encrypted Storage...
        </p>
      </div>
    );
  }

  // If in Secure Viewer mode, render locked-down viewer full-screen
  if (activeViewerToken) {
    return (
      <SecureViewerPage
        token={activeViewerToken}
        currentUser={currentUser}
        onExit={handleExitViewer}
        onViewAudit={handleViewDocumentAudit}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      {/* Top Navigation Bar */}
      <Navbar
        currentUser={currentUser}
        onSelectUser={(u) => {
          setCurrentUser(u);
          refreshAllData();
        }}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'audit') setAuditDocFilter(null);
        }}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'vault' && (
          <DocumentList
            documents={documents}
            shares={shares}
            currentUser={currentUser}
            onOpenShareModal={(doc) => setSharingDocument(doc)}
            onOpenManageShares={(doc) => setManagingDocShares(doc)}
            onOpenDirectViewer={(doc) => {
              // Create or find an active share token to test direct preview
              const existingShare = shares.find(
                (s) => s.documentId === doc.id && s.status === 'active'
              );
              if (existingShare) {
                handleOpenViewerWithToken(existingShare.token);
              } else {
                setSharingDocument(doc);
              }
            }}
            onViewDocumentAudit={handleViewDocumentAudit}
            onOpenUploadModal={() => setIsUploadModalOpen(true)}
          />
        )}

        {activeTab === 'shares' && (
          <ShareManagementModal
            document={null}
            shares={shares}
            documents={documents}
            currentUser={currentUser}
            onClose={() => setActiveTab('vault')}
            onShareUpdated={refreshAllData}
            onOpenViewerWithToken={handleOpenViewerWithToken}
            onViewAudit={handleViewDocumentAudit}
          />
        )}

        {activeTab === 'shared-with-me' && (
          <SharedWithMeView
            currentUser={currentUser}
            shares={shares}
            documents={documents}
            onOpenViewerWithToken={handleOpenViewerWithToken}
          />
        )}

        {activeTab === 'audit' && (
          <AuditTrailView
            auditLogs={auditLogs}
            initialFilterDocId={auditDocFilter}
            onClearDocFilter={() => setAuditDocFilter(null)}
          />
        )}

        {activeTab === 'security' && <SecurityArchitectureView />}
      </main>

      {/* Share Configuration Modal */}
      {sharingDocument && (
        <ShareModal
          document={sharingDocument}
          currentUser={currentUser}
          onClose={() => setSharingDocument(null)}
          onShareCreated={() => {
            refreshAllData();
          }}
          onOpenViewerWithToken={handleOpenViewerWithToken}
        />
      )}

      {/* Share Management Modal for Specific Document */}
      {managingDocShares && (
        <ShareManagementModal
          document={managingDocShares}
          shares={shares}
          documents={documents}
          currentUser={currentUser}
          onClose={() => setManagingDocShares(null)}
          onShareUpdated={refreshAllData}
          onOpenViewerWithToken={handleOpenViewerWithToken}
          onViewAudit={handleViewDocumentAudit}
        />
      )}

      {/* Upload and Encrypt Document Modal */}
      {isUploadModalOpen && (
        <UploadDocumentModal
          currentUser={currentUser}
          onClose={() => setIsUploadModalOpen(false)}
          onDocumentUploaded={(newDoc) => {
            refreshAllData();
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-xs text-slate-500 text-center font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>HavenVault Secure Document Sharing Platform · Zero-Disk Volatile Memory Decryption</span>
          <span>AES-256-GCM · SHA-256 Audit Chaining · DRM Deterrence</span>
        </div>
      </footer>
    </div>
  );
}
