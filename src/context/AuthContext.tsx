import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeFetchJson, isBackendHealthy } from '../lib/apiHelper';
import { SYSTEM_USERS } from '../lib/store';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'employee';
  department: string;
  manager_id: string | null;
  email_verified: number;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isStaticMode: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean }>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    department: string;
    inviteToken?: string;
  }) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loginAsDemoUser: (userId: string) => Promise<{ success: boolean; error?: string }>;
}

const LOCAL_STORAGE_AUTH_KEY = 'haven_vault_auth_user_v1';
const LOCAL_STORAGE_USERS_KEY = 'haven_vault_custom_registered_users_v1';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isStaticMode, setIsStaticMode] = useState<boolean>(false);

  // Helper to load stored client-side custom users
  const getCustomUsers = (): Array<AuthUser & { passwordHash?: string }> => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveCustomUsers = (users: Array<AuthUser & { passwordHash?: string }>) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
    } catch {}
  };

  const refreshUser = async () => {
    try {
      const backendAlive = await isBackendHealthy();
      setIsStaticMode(!backendAlive);

      if (backendAlive) {
        const { ok, data } = await safeFetchJson<{ user: AuthUser }>('/api/auth/me', {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (ok && data?.user) {
          setUser(data.user);
          return;
        }
      }

      // Fallback: Check local storage persistence (e.g. for Vercel static deployment)
      const cached = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as AuthUser;
          if (parsed && parsed.id && parsed.email) {
            setUser(parsed);
            return;
          }
        } catch {}
      }

      // No active session
      setUser(null);
    } catch (err) {
      console.warn('[AuthContext] Session verification fallback:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const backendAlive = await isBackendHealthy();

    if (backendAlive) {
      const res = await safeFetchJson<{ user: AuthUser; error?: string; requiresVerification?: boolean }>(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: cleanEmail, password }),
        }
      );

      if (res.ok && res.data?.user) {
        setUser(res.data.user);
        try {
          localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(res.data.user));
        } catch {}
        return { success: true };
      }

      // If backend returned a functional error (like invalid credentials), respect it
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        return {
          success: false,
          error: res.error || 'Invalid credentials.',
          requiresVerification: res.data?.requiresVerification,
        };
      }
    }

    // Client-side / Static Fallback Mode (Runs seamlessly on Vercel without a backend)
    setIsStaticMode(true);

    // 1. Check SYSTEM_USERS (Demo Personas)
    const systemMatch = SYSTEM_USERS.find(
      (u) => u.email.toLowerCase() === cleanEmail || u.name.toLowerCase() === cleanEmail
    );

    if (systemMatch) {
      const authUser: AuthUser = {
        id: systemMatch.id,
        name: systemMatch.name,
        email: systemMatch.email,
        role: systemMatch.role,
        department: systemMatch.department,
        manager_id: systemMatch.managerId || null,
        email_verified: 1,
      };

      setUser(authUser);
      try {
        localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(authUser));
      } catch {}
      return { success: true };
    }

    // 2. Check Custom Registered Users
    const customUsers = getCustomUsers();
    const customMatch = customUsers.find((u) => u.email.toLowerCase() === cleanEmail);

    if (customMatch) {
      // In client mode, accept matching or valid password
      if (!password || password.length < 4) {
        return { success: false, error: 'Password must be at least 4 characters.' };
      }

      const authUser: AuthUser = {
        id: customMatch.id,
        name: customMatch.name,
        email: customMatch.email,
        role: customMatch.role,
        department: customMatch.department,
        manager_id: customMatch.manager_id,
        email_verified: 1,
      };

      setUser(authUser);
      try {
        localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(authUser));
      } catch {}
      return { success: true };
    }

    return {
      success: false,
      error:
        'Account not found. For instant demo access, pick one of the Quick Login personas below, or register an account.',
    };
  };

  const loginAsDemoUser = async (userId: string) => {
    const systemMatch = SYSTEM_USERS.find((u) => u.id === userId);
    if (!systemMatch) return { success: false, error: 'Demo user not found.' };

    const authUser: AuthUser = {
      id: systemMatch.id,
      name: systemMatch.name,
      email: systemMatch.email,
      role: systemMatch.role,
      department: systemMatch.department,
      manager_id: systemMatch.managerId || null,
      email_verified: 1,
    };

    setUser(authUser);
    try {
      localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(authUser));
    } catch {}
    return { success: true };
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    department: string;
    inviteToken?: string;
  }) => {
    const cleanEmail = payload.email.trim().toLowerCase();
    const backendAlive = await isBackendHealthy();

    if (backendAlive) {
      const res = await safeFetchJson<{ user?: AuthUser; requiresVerification?: boolean; message?: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...payload, email: cleanEmail }),
        }
      );

      if (res.ok) {
        if (res.data?.user) {
          setUser(res.data.user);
          try {
            localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(res.data.user));
          } catch {}
        }
        return {
          success: true,
          requiresVerification: res.data?.requiresVerification,
          message: res.data?.message,
        };
      }

      if (res.error) {
        return { success: false, error: res.error };
      }
    }

    // Client-side / Static Fallback Mode Registration
    setIsStaticMode(true);
    const customUsers = getCustomUsers();

    if (
      customUsers.some((u) => u.email.toLowerCase() === cleanEmail) ||
      SYSTEM_USERS.some((u) => u.email.toLowerCase() === cleanEmail)
    ) {
      return { success: false, error: 'An account with this email address already exists.' };
    }

    // First user registered becomes Admin
    const isFirstUser = customUsers.length === 0;
    const newAuthUser: AuthUser = {
      id: `usr-client-${Date.now()}`,
      name: payload.name.trim(),
      email: cleanEmail,
      role: isFirstUser ? 'admin' : 'employee',
      department: payload.department.trim() || 'General',
      manager_id: null,
      email_verified: 1,
    };

    customUsers.push(newAuthUser);
    saveCustomUsers(customUsers);

    setUser(newAuthUser);
    try {
      localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify(newAuthUser));
    } catch {}

    return {
      success: true,
      message: 'Account created and initialized successfully.',
    };
  };

  const logout = async () => {
    const backendAlive = await isBackendHealthy();
    if (backendAlive) {
      await safeFetchJson('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    }

    try {
      localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY);
    } catch {}

    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isStaticMode,
        login,
        register,
        logout,
        refreshUser,
        loginAsDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
