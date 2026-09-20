import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, SavedAccount } from '../types/index';
import { apiRequest } from '../lib/api';
import { isharaAuth, AuthState } from '../lib/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  authState: AuthState;
  savedAccounts: SavedAccount[];
  isAccountSwitcherOpen: boolean;
  setIsAccountSwitcherOpen: (open: boolean) => void;
  isAddAccountModalOpen: boolean;
  setIsAddAccountModalOpen: (open: boolean) => void;
  login: (identifier: string, password?: string) => Promise<void>;
  register: (data: { 
    username: string; 
    displayName?: string; 
    email?: string; 
    password?: string; 
    isPrivate?: boolean; 
    phone?: string; 
    verificationCodeId?: string;
    verificationCode?: string;
    verificationToken?: string;
  }) => Promise<void>;
  signup: (data: { 
    username: string; 
    displayName?: string; 
    email?: string; 
    password?: string; 
    isPrivate?: boolean; 
    phone?: string; 
    verificationCodeId?: string;
    verificationCode?: string;
    verificationToken?: string;
  }) => Promise<void>;
  switchAccount: (userId: string) => Promise<void>;
  switchUser: (user: User) => Promise<void>;
  removeSavedAccount: (userId: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => isharaAuth.getCurrentUser());
  const [token, setToken] = useState<string | null>(() => isharaAuth.getToken());
  const [authState, setAuthState] = useState<AuthState>(() => isharaAuth.getAuthState());
  // Show loading screen only if auth is initializing and there is no cached user to show immediately
  const [loading, setLoading] = useState<boolean>(() => isharaAuth.getAuthState() === 'INITIALIZING' && !isharaAuth.getCurrentUser());
  const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState<boolean>(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState<boolean>(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => isharaAuth.getSavedAccounts());

  // Listen to shared Auth singleton state changes
  useEffect(() => {
    const unsubscribe = isharaAuth.onAuthStateChanged((activeUser, state) => {
      setUser(activeUser);
      setToken(isharaAuth.getToken());
      setAuthState(state);
      setSavedAccounts(isharaAuth.getSavedAccounts());
      if (state !== 'INITIALIZING' || activeUser) {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const refreshed = await isharaAuth.verifyWithServer(2);
      if (refreshed) {
        setUser(refreshed);
        setToken(isharaAuth.getToken());
        setSavedAccounts(isharaAuth.getSavedAccounts());
      }
    } catch (err) {
      console.warn('[AuthContext] Background refresh error (ignoring to prevent auto-logout):', err);
    }
  }, []);

  const login = async (identifier: string, password?: string) => {
    const res = await apiRequest<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: identifier, password })
    });
    isharaAuth.handleAuthSuccess(res.user, res.token);
    setUser(res.user);
    setToken(res.token);
    setSavedAccounts(isharaAuth.getSavedAccounts());
    setIsAddAccountModalOpen(false);
    setIsAccountSwitcherOpen(false);
  };

  const register = async (data: { 
    username: string; 
    displayName?: string; 
    email?: string; 
    password?: string; 
    isPrivate?: boolean;
    phone?: string;
    verificationCodeId?: string;
    verificationCode?: string;
    verificationToken?: string;
  }) => {
    const res = await apiRequest<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: data.username,
        displayName: data.displayName || data.username,
        email: data.email || `${data.username}@ishara.app`,
        password: data.password,
        isPrivate: data.isPrivate,
        phone: data.phone,
        verificationCodeId: data.verificationCodeId,
        verificationCode: data.verificationCode,
        verificationToken: data.verificationToken
      })
    });
    isharaAuth.handleAuthSuccess(res.user, res.token);
    setUser(res.user);
    setToken(res.token);
    setSavedAccounts(isharaAuth.getSavedAccounts());
    setIsAddAccountModalOpen(false);
    setIsAccountSwitcherOpen(false);
  };

  const signup = register;

  const switchAccount = async (userId: string) => {
    // Edge case 1: Switching to current account
    if (user?.id === userId || user?.username.toLowerCase() === userId.toLowerCase()) {
      setIsAccountSwitcherOpen(false);
      return;
    }

    const target = savedAccounts.find(a => a.id === userId || a.username.toLowerCase() === userId.toLowerCase());
    if (!target || !target.token) {
      throw new Error('This account requires logging in with username and password.');
    }

    // Preserve active session in saved accounts before switching
    if (user && token) {
      isharaAuth.saveToSavedAccounts(user, token);
    }

    try {
      sessionStorage.clear();
    } catch {
      // Ignore
    }

    try {
      const res = await apiRequest<{ user: User; token: string }>('/auth/switch-account', {
        method: 'POST',
        body: JSON.stringify({ userId, token: target.token })
      });

      if (res.user.isBanned) {
        throw new Error('This account has been banned by administration.');
      }

      isharaAuth.handleAuthSuccess(res.user, res.token);
      setUser(res.user);
      setToken(res.token);
      setSavedAccounts(isharaAuth.getSavedAccounts());
      setIsAccountSwitcherOpen(false);
    } catch (err: any) {
      if (err?.message?.includes('banned')) {
        throw err;
      }
      // Never delete the account from saved accounts on temporary switch error
      throw err;
    }
  };

  const switchUser = async (userToSwitch: User) => {
    await switchAccount(userToSwitch.id || userToSwitch.username);
  };

  const removeSavedAccount = (userId: string) => {
    isharaAuth.removeSavedAccount(userId);
    setSavedAccounts(isharaAuth.getSavedAccounts());
    if (user?.id === userId) {
      logout();
    }
  };

  /**
   * Explicit User Sign Out ONLY
   */
  const logout = () => {
    isharaAuth.signOut();
    setUser(null);
    setToken(null);
    setIsAccountSwitcherOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        authState,
        savedAccounts,
        isAccountSwitcherOpen,
        setIsAccountSwitcherOpen,
        isAddAccountModalOpen,
        setIsAddAccountModalOpen,
        login,
        register,
        signup,
        switchAccount,
        switchUser,
        removeSavedAccount,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

