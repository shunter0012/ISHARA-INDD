import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, SavedAccount } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { 
  X, 
  Check, 
  UserPlus, 
  Shield, 
  Trash2, 
  LogIn, 
  AlertCircle, 
  Loader2
} from 'lucide-react';

interface AccountSwitcherModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onAccountSwitched?: () => void;
}

export const AccountSwitcherModal: React.FC<AccountSwitcherModalProps> = ({
  isOpen,
  onClose,
  onAccountSwitched
}) => {
  const { 
    user, 
    savedAccounts, 
    switchAccount, 
    removeSavedAccount, 
    login,
    register,
    isAccountSwitcherOpen: contextIsOpen,
    setIsAccountSwitcherOpen: setContextIsOpen,
    setIsAddAccountModalOpen
  } = useAuth();

  const isModalVisible = isOpen !== undefined ? isOpen : contextIsOpen;
  const closeModal = () => {
    if (onClose) onClose();
    setContextIsOpen(false);
  };

  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'add'>('list');

  // New account form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');

  useEffect(() => {
    if (isModalVisible) {
      setErrorMessage(null);
      setViewMode('list');
    }
  }, [isModalVisible]);

  // Deduplicate and sanitize saved accounts: strictly only show accounts that have a valid session token
  const sanitizedSavedAccounts = React.useMemo(() => {
    const seen = new Set<string>();
    const demoIds = ['demo-mock-user-elena', 'demo-mock-user-alex', 'demo-mock-user-maya'];

    return savedAccounts.filter((account, index) => {
      if (!account) return false;
      // Must have a valid session token (proving it was created or logged into on this device)
      if (!account.token || typeof account.token !== 'string' || account.token.trim() === '') return false;
      // Filter out legacy static demo mock IDs
      if (demoIds.includes(account.id)) return false;
      // The OWNER_ADMIN account must NEVER appear in the switcher for normal users
      const isAdmin = account.role === 'OWNER_ADMIN' || account.id === 'user-shuv' || account.username?.toLowerCase() === 'shuv';
      if (isAdmin && user?.role !== 'OWNER_ADMIN') return false;
      const key = String(account.id || account.username || `acc-${index}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [savedAccounts, user?.role]);

  const handleSelectAccount = async (targetUserId: string) => {
    if (switchingId) return;

    // Edge case: switching to account that is already active
    if (user?.id === targetUserId) {
      closeModal();
      return;
    }

    setSwitchingId(targetUserId);
    setErrorMessage(null);

    try {
      await switchAccount(targetUserId);
      if (onAccountSwitched) {
        onAccountSwitched();
      }
      closeModal();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to switch account. Please log in with password.');
    } finally {
      setSwitchingId(null);
    }
  };

  const handleAddAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      if (isRegisterMode) {
        await register({
          username: newUsername.trim(),
          displayName: newDisplayName.trim() || newUsername.trim(),
          password: newPassword
        });
      } else {
        await login(newUsername.trim(), newPassword);
      }
      if (onAccountSwitched) {
        onAccountSwitched();
      }
      closeModal();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  if (!isModalVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div 
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-[#1A1A1A]">
              {viewMode === 'list' ? 'Switch Account' : (isRegisterMode ? 'Create New Account' : 'Log In Another Account')}
            </h2>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {viewMode === 'list' ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Active Account Banner */}
            {user && (
              <div className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="relative">
                    <img
                      src={user.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.username}`}
                      alt={user.displayName}
                      className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-xs"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <p className="text-sm font-bold text-[#1A1A1A] truncate">{user.displayName}</p>
                      {user.role === 'OWNER_ADMIN' && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md flex items-center space-x-0.5">
                          <Shield className="w-3 h-3 text-red-600" />
                          <span>OWNER</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8E8E8E] truncate">@{user.username}</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                  Active
                </span>
              </div>
            )}

            {/* Saved Accounts List */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                Saved Accounts ({sanitizedSavedAccounts.length})
              </p>
              
              {sanitizedSavedAccounts.length === 0 ? (
                <div className="py-4 text-center text-xs text-gray-400">
                  No other accounts saved on this device.
                </div>
              ) : (
                sanitizedSavedAccounts.map((account, index) => {
                  const isActive = user?.id === account.id;
                  const isSwitching = switchingId === account.id;
                  const itemKey = `saved-acc-${account.id || account.username || index}`;

                  return (
                    <div
                      key={itemKey}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isActive 
                          ? 'border-emerald-200 bg-emerald-50/30' 
                          : 'border-[#EEEEEE] hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div
                        onClick={() => handleSelectAccount(account.id)}
                        className="flex items-center space-x-3 cursor-pointer min-w-0 flex-1"
                      >
                        <img
                          src={account.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${account.username}`}
                          alt={account.displayName}
                          className="w-10 h-10 rounded-full object-cover border border-gray-200"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <p className="text-xs font-bold text-[#1A1A1A] truncate">{account.displayName}</p>
                            {account.role === 'OWNER_ADMIN' && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded">
                                OWNER
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8E8E8E] truncate">@{account.username}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {isSwitching ? (
                          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                        ) : isActive ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSelectAccount(account.id)}
                              className="px-3 py-1 bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-transform active:scale-95"
                            >
                              Switch
                            </button>
                            <button
                              onClick={() => removeSavedAccount(account.id)}
                              title="Remove from saved accounts"
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setIsRegisterMode(false);
                  setViewMode('add');
                }}
                className="w-full flex items-center justify-center space-x-2 py-3 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-2xl transition-all shadow-xs active:scale-[0.98]"
              >
                <LogIn className="w-4 h-4" />
                <span>Log in to another account</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeModal();
                  setIsAddAccountModalOpen(true);
                }}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-2xl border border-gray-200 transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create a new account</span>
              </button>
            </div>
          </div>
        ) : (
          /* Add / Register Form */
          <form onSubmit={handleAddAccountSubmit} className="p-6 space-y-4">
            <div className="space-y-3">
              {isRegisterMode && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="w-1/3 py-2.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-2.5 text-xs font-bold text-white bg-black hover:bg-zinc-800 rounded-xl transition-all flex items-center justify-center space-x-1.5"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isRegisterMode ? 'Create & Switch' : 'Log In & Switch'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
