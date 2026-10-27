import React, { useState } from 'react';
import {
  ShieldCheck,
  Bell,
  Upload,
  FileText,
  Share2,
  Inbox,
  History,
  Shield,
  Users,
  LogOut,
  ChevronDown,
  Building,
} from 'lucide-react';
import { NotificationItem } from '../types';
import { useAuth, AuthUser } from '../context/AuthContext';

interface NavbarProps {
  currentUser: AuthUser;
  activeTab: 'vault' | 'shares' | 'shared-with-me' | 'audit' | 'security' | 'org';
  onSelectTab: (tab: 'vault' | 'shares' | 'shared-with-me' | 'audit' | 'security' | 'org') => void;
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onOpenUploadModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenUploadModal,
}) => {
  const { logout, loginAsDemoUser } = useAuth();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-16">
          {/* Brand */}
          <button
            onClick={() => onSelectTab('vault')}
            className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
                HavenVault
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider -mt-0.5">
                ENCRYPTED PLATFORM
              </span>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 text-sm font-medium">
            <button
              onClick={() => onSelectTab('vault')}
              className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'vault'
                  ? 'text-indigo-400 font-semibold border-b-2 border-indigo-500'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Document Vault</span>
            </button>

            <button
              onClick={() => onSelectTab('shares')}
              className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'shares'
                  ? 'text-indigo-400 font-semibold border-b-2 border-indigo-500'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span>Shared Links</span>
            </button>

            <button
              onClick={() => onSelectTab('shared-with-me')}
              className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'shared-with-me'
                  ? 'text-indigo-400 font-semibold border-b-2 border-indigo-500'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>Shared With Me</span>
            </button>

            <button
              onClick={() => onSelectTab('audit')}
              className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'audit'
                  ? 'text-indigo-400 font-semibold border-b-2 border-indigo-500'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Audit Ledger</span>
            </button>

            <button
              onClick={() => onSelectTab('org')}
              className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'org'
                  ? 'text-indigo-400 font-semibold border-b-2 border-indigo-500'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Organization</span>
            </button>

            <button
              onClick={() => onSelectTab('security')}
              className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'security'
                  ? 'text-indigo-400 font-semibold border-b-2 border-indigo-500'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Security</span>
            </button>
          </nav>

          {/* Controls & User Account */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifDropdown(!showNotifDropdown);
                  setShowUserDropdown(false);
                }}
                className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
                aria-label="View notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
                )}
              </button>

              {showNotifDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-2 z-50">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">Alerts & Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-rose-950/80 text-rose-400 border border-rose-800/50 rounded">
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No notifications logged
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => onMarkNotificationRead(notif.id)}
                          className={`px-3 py-2.5 text-xs cursor-pointer hover:bg-slate-800/50 transition-colors ${
                            !notif.read ? 'bg-indigo-950/20' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-slate-200">{notif.title}</span>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {new Date(notif.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
                            {notif.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Real Authenticated User Profile */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowUserDropdown(!showUserDropdown);
                  setShowNotifDropdown(false);
                }}
                className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-slate-200 transition-colors"
              >
                <div className="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-200 leading-tight">
                    {currentUser.name}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase font-semibold ${
                      currentUser.role === 'admin'
                        ? 'text-rose-400'
                        : currentUser.role === 'manager'
                        ? 'text-amber-400'
                        : 'text-indigo-400'
                    }`}
                  >
                    {currentUser.role}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 divide-y divide-slate-800">
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-white">{currentUser.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{currentUser.email}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Building className="w-3.5 h-3.5 text-slate-500" />
                      <span>{currentUser.department}</span>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        onSelectTab('org');
                        setShowUserDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2"
                    >
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>Organization Directory</span>
                    </button>
                  </div>

                  <div className="py-1">
                    <div className="px-4 py-1 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                      Switch Role Persona
                    </div>
                    <button
                      onClick={() => {
                        loginAsDemoUser('usr-admin-elena');
                        setShowUserDropdown(false);
                      }}
                      className="w-full text-left px-4 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center justify-between"
                    >
                      <span>Elena Rostova</span>
                      <span className="text-[10px] text-rose-400 font-mono">Admin</span>
                    </button>
                    <button
                      onClick={() => {
                        loginAsDemoUser('usr-mgr-marcus');
                        setShowUserDropdown(false);
                      }}
                      className="w-full text-left px-4 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center justify-between"
                    >
                      <span>Marcus Vance</span>
                      <span className="text-[10px] text-amber-400 font-mono">Manager</span>
                    </button>
                    <button
                      onClick={() => {
                        loginAsDemoUser('usr-emp-sarah');
                        setShowUserDropdown(false);
                      }}
                      className="w-full text-left px-4 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center justify-between"
                    >
                      <span>Sarah Chen</span>
                      <span className="text-[10px] text-indigo-400 font-mono">Employee</span>
                    </button>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        logout();
                        setShowUserDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-rose-950/30 flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Upload Document</span>
              <span className="sm:hidden">Upload</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
