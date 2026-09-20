import React, { useState, useEffect, useRef } from 'react';
import { User, UserSettings, UserPreview } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { uploadMediaFile } from '../../lib/upload';
import { resolveAvatarUrl, compressProfileImage, saveLocalAvatarCache } from '../../lib/avatar';
import { 
  X, 
  User as UserIcon, 
  Shield, 
  Lock, 
  Bell, 
  EyeOff, 
  Sliders, 
  Check, 
  Loader2, 
  AlertCircle, 
  Smartphone, 
  LogOut, 
  Users, 
  Camera, 
  CheckCircle2,
  Trash2,
  Globe,
  Radio,
  MessageSquare,
  PhoneCall,
  ShieldAlert
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'account' | 'edit-profile' | 'password' | 'privacy' | 'notifications' | 'blocked' | 'preferences';
  onOpenAdmin?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'account',
  onOpenAdmin
}) => {
  const { user, refreshUser, logout, savedAccounts, setIsAccountSwitcherOpen } = useAuth();
  const [activeTab, setActiveTab] = useState<'account' | 'edit-profile' | 'password' | 'privacy' | 'notifications' | 'blocked' | 'preferences'>(initialTab);

  // Settings State
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit Profile fields
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(resolveAvatarUrl(user));
  const [avatarBase64, setAvatarBase64] = useState<string | undefined>(user?.avatarBase64);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Change Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<UserPreview[]>([]);
  const [blockUsernameInput, setBlockUsernameInput] = useState('');
  const [blockingLoading, setBlockingLoading] = useState(false);

  // Sync with user prop whenever user changes or modal opens
  useEffect(() => {
    if (!isOpen || !user) return;

    setDisplayName(user.displayName || '');
    setBio(user.bio || '');
    setAvatarUrl(resolveAvatarUrl(user));
    setAvatarBase64(user.avatarBase64);
    loadSettings();
    loadBlockedUsers();
  }, [isOpen, user?.id]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ settings: UserSettings }>('/settings');
      setSettings(res.settings);
    } catch (err: any) {
      console.error('[SettingsModal] Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBlockedUsers = async () => {
    try {
      const res = await apiRequest<{ blockedUsers: UserPreview[] }>('/settings/blocked-users');
      setBlockedUsers(res.blockedUsers || []);
    } catch (err) {
      console.error('[SettingsModal] Failed to load blocked users:', err);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  // Save partial settings
  const handleUpdateSettings = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ settings: UserSettings; message: string }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      setSettings(res.settings);
      showToast('success', 'Settings updated successfully.');
      await refreshUser();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  // Save profile information
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      await apiRequest(`/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          avatarUrl,
          avatarBase64,
          isPrivate: settings?.isPrivateAccount ?? user.isPrivate
        })
      });

      if (avatarBase64) {
        saveLocalAvatarCache(user.id, avatarBase64);
      }

      // Also update settings if private account was changed
      if (settings && settings.isPrivateAccount !== user.isPrivate) {
        await handleUpdateSettings({ isPrivateAccount: settings.isPrivateAccount });
      }

      await refreshUser();
      showToast('success', 'Profile updated successfully.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  // Handle Avatar file upload
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const { file: optimizedFile, dataUrl } = await compressProfileImage(file);
      setAvatarBase64(dataUrl);
      setAvatarUrl(dataUrl);
      if (user?.id) {
        saveLocalAvatarCache(user.id, dataUrl);
      }

      try {
        const mediaUrl = await uploadMediaFile(optimizedFile);
        if (mediaUrl) {
          setAvatarUrl(mediaUrl);
        }
      } catch (upErr) {
        console.warn('[SettingsModal] Server upload fallback to base64:', upErr);
      }

      showToast('success', 'Profile picture prepared! Click "Save Changes" to apply.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to upload photo.');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast('error', 'Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showToast('error', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('error', 'New passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      await apiRequest('/settings/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('success', 'Your password has been changed securely.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Logout from all sessions
  const handleLogoutAllSessions = async () => {
    if (!confirm('This will invalidate all existing sessions on other devices. Are you sure?')) {
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/settings/logout-all-sessions', { method: 'POST' });
      showToast('success', 'All other active sessions have been revoked.');
      await loadSettings();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to revoke sessions.');
    } finally {
      setSaving(false);
    }
  };

  // Block a user
  const handleBlockUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockUsernameInput.trim()) return;

    setBlockingLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; blockedUser: UserPreview }>('/settings/block', {
        method: 'POST',
        body: JSON.stringify({ targetIdentifier: blockUsernameInput.trim() })
      });
      setBlockUsernameInput('');
      setBlockedUsers(prev => [res.blockedUser, ...prev.filter(u => u.id !== res.blockedUser.id)]);
      showToast('success', `@${res.blockedUser.username} has been blocked.`);
      await refreshUser();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to block user.');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Unblock a user
  const handleUnblockUser = async (targetUserId: string, username: string) => {
    try {
      await apiRequest('/settings/unblock', {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });
      setBlockedUsers(prev => prev.filter(u => u.id !== targetUserId));
      showToast('success', `@${username} has been unblocked.`);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to unblock user.');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
    >
      <div 
        id="settings-modal-container"
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#1A1A1A]">Settings</h2>
              <p className="text-[11px] text-gray-500">Manage your profile, account security & preferences</p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-black rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast Banner */}
        {statusMessage && (
          <div className={`px-6 py-2.5 text-xs font-medium flex items-center space-x-2 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-100' 
              : 'bg-red-50 text-red-700 border-b border-red-100'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Layout: Left Nav + Right Panel */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
          {/* Navigation Sidebar */}
          <div className="w-full sm:w-48 bg-zinc-50 border-r border-gray-100 p-2 flex sm:flex-col overflow-x-auto sm:overflow-y-auto shrink-0 gap-1">
            <button
              id="settings-tab-account"
              onClick={() => setActiveTab('account')}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'account' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span>Account</span>
            </button>

            <button
              id="settings-tab-edit-profile"
              onClick={() => setActiveTab('edit-profile')}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'edit-profile' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              <span>Edit Profile</span>
            </button>

            <button
              id="settings-tab-password"
              onClick={() => setActiveTab('password')}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'password' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span>Change Password</span>
            </button>

            <button
              id="settings-tab-privacy"
              onClick={() => setActiveTab('privacy')}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'privacy' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              <EyeOff className="w-4 h-4 shrink-0" />
              <span>Privacy</span>
            </button>

            <button
              id="settings-tab-notifications"
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'notifications' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>Notifications</span>
            </button>

            <button
              id="settings-tab-blocked"
              onClick={() => setActiveTab('blocked')}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'blocked' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Blocked Users</span>
            </button>

            <button
              id="settings-tab-preferences"
              onClick={() => setActiveTab('preferences')}
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'preferences' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200/60'
              }`}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span>Preferences</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 p-5 sm:p-6 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : (
              <>
                {/* 1. ACCOUNT OVERVIEW & MULTI-ACCOUNT */}
                {activeTab === 'account' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Account Information</h3>
                      <p className="text-xs text-gray-500 mb-4">Permanent credentials & authenticated session details</p>

                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Username</span>
                          <span className="font-semibold text-gray-900 font-mono">@{user?.username}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Email Address</span>
                          <span className="font-semibold text-gray-900">{user?.email || 'Not specified'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Phone Number</span>
                          <div className="flex items-center space-x-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-zinc-600" />
                            <span className="font-semibold text-gray-900 font-mono">
                              {user?.phone || settings?.verifiedPhone || 'Not linked'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Account Role</span>
                          <span className="px-2 py-0.5 bg-zinc-200 text-zinc-800 text-[10px] font-bold rounded-md uppercase">
                            {user?.role || 'USER'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Admin Moderation Console Access */}
                    {Boolean(user && (user.role === 'OWNER_ADMIN' || user.username?.toLowerCase() === 'shuv' || user.id === 'user-shuv')) && (
                      <div className="p-3 bg-red-50/90 rounded-2xl border border-red-200 flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs">
                            <ShieldAlert className="w-4 h-4 stroke-[2.2]" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-red-900">Owner Admin Console</p>
                            <p className="text-[10px] text-red-600">Access platform moderation, reports & ads</p>
                          </div>
                        </div>
                        <button
                          id="settings-open-admin-console-btn"
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenAdmin?.();
                          }}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                        >
                          Open Panel
                        </button>
                      </div>
                    )}

                    {/* Multi-Account Switching */}
                    <div className="pt-2 border-t border-gray-100">
                      <h4 className="text-xs font-bold text-gray-900 mb-1">Multi-Account Management</h4>
                      <p className="text-[11px] text-gray-500 mb-3">
                        Quickly switch between accounts or sign in with another profile.
                      </p>
                      <div className="flex items-center space-x-2">
                        <button
                          id="settings-open-switcher-btn"
                          type="button"
                          onClick={() => {
                            onClose();
                            setIsAccountSwitcherOpen(true);
                          }}
                          className="flex items-center space-x-2 px-3.5 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-all shadow-xs"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Switch Account ({savedAccounts.length || 1} saved)</span>
                        </button>
                      </div>
                    </div>

                    {/* Session Management */}
                    <div className="pt-2 border-t border-gray-100 space-y-3">
                      <h4 className="text-xs font-bold text-gray-900">Active Sessions & Security</h4>
                      <p className="text-[11px] text-gray-500">
                        Revoke all session tokens across any browsers or devices if you suspect unauthorized access.
                      </p>
                      <button
                        id="settings-revoke-all-sessions-btn"
                        type="button"
                        onClick={handleLogoutAllSessions}
                        disabled={saving}
                        className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5 text-red-600" />
                        <span>Revoke All Other Sessions</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. EDIT PROFILE */}
                {activeTab === 'edit-profile' && (
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Edit Profile</h3>
                      <p className="text-xs text-gray-500 mb-4">Update your public profile details</p>
                    </div>

                    {/* Avatar preview and upload */}
                    <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="relative group">
                        <img
                          src={avatarUrl || resolveAvatarUrl(user)}
                          alt={displayName}
                          className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-xs"
                        />
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarFileSelect}
                          className="hidden"
                        />
                        <button
                          id="settings-upload-avatar-btn"
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={uploadingAvatar}
                          className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-800 rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                        >
                          {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                          <span>Change Photo</span>
                        </button>
                        <p className="text-[10px] text-gray-500 mt-1">JPEG, PNG, WebP up to 10MB</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Display Name</label>
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Bio</label>
                      <textarea
                        rows={3}
                        placeholder="Tell others about yourself..."
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={160}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black resize-none"
                      />
                      <span className="block text-[10px] text-gray-400 text-right">{bio.length}/160</span>
                    </div>

                    <button
                      id="settings-save-profile-btn"
                      type="submit"
                      disabled={saving}
                      className="w-full py-2.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Save Changes</span>
                    </button>
                  </form>
                )}

                {/* 3. CHANGE PASSWORD */}
                {activeTab === 'password' && (
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Change Password</h3>
                      <p className="text-xs text-gray-500 mb-4">Ensure your account is protected with a strong password</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Current Password</label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">New Password</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="At least 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Re-enter new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black font-mono"
                      />
                    </div>

                    <button
                      id="settings-change-password-submit-btn"
                      type="submit"
                      disabled={passwordLoading || !currentPassword || !newPassword}
                      className="w-full py-2.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      <span>Update Password</span>
                    </button>
                  </form>
                )}

                {/* 4. PRIVACY */}
                {activeTab === 'privacy' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Privacy & Safety</h3>
                      <p className="text-xs text-gray-500 mb-4">Control who sees your content and interacts with you</p>
                    </div>

                    {/* Private Account */}
                    <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="pr-4">
                        <p className="text-xs font-bold text-gray-900">Private Account</p>
                        <p className="text-[11px] text-gray-500">Only approved followers can view your posts and reels</p>
                      </div>
                      <input
                        id="settings-private-toggle"
                        type="checkbox"
                        checked={Boolean(settings?.isPrivateAccount)}
                        onChange={(e) => handleUpdateSettings({ isPrivateAccount: e.target.checked })}
                        className="w-4 h-4 accent-black rounded cursor-pointer"
                      />
                    </div>

                    {/* Activity Status */}
                    <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="pr-4">
                        <p className="text-xs font-bold text-gray-900">Activity Status</p>
                        <p className="text-[11px] text-gray-500">Allow accounts you follow to see when you are active</p>
                      </div>
                      <input
                        id="settings-activity-toggle"
                        type="checkbox"
                        checked={Boolean(settings?.activityStatus)}
                        onChange={(e) => handleUpdateSettings({ activityStatus: e.target.checked })}
                        className="w-4 h-4 accent-black rounded cursor-pointer"
                      />
                    </div>

                    {/* Read Receipts */}
                    <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="pr-4">
                        <p className="text-xs font-bold text-gray-900">Read Receipts</p>
                        <p className="text-[11px] text-gray-500">Let others know when you have read their messages</p>
                      </div>
                      <input
                        id="settings-read-receipts-toggle"
                        type="checkbox"
                        checked={Boolean(settings?.readReceipts)}
                        onChange={(e) => handleUpdateSettings({ readReceipts: e.target.checked })}
                        className="w-4 h-4 accent-black rounded cursor-pointer"
                      />
                    </div>

                    {/* Message Requests */}
                    <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5">
                      <label className="block text-xs font-bold text-gray-900">Who can send you direct messages</label>
                      <select
                        value={settings?.messageRequests || 'everyone'}
                        onChange={(e) => handleUpdateSettings({ messageRequests: e.target.value as any })}
                        className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-black cursor-pointer"
                      >
                        <option value="everyone">Everyone</option>
                        <option value="following">People you follow</option>
                        <option value="none">No one</option>
                      </select>
                    </div>

                    {/* Calling Permissions */}
                    <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5">
                      <label className="block text-xs font-bold text-gray-900">Who can call you (Voice & Video)</label>
                      <select
                        value={settings?.callingPermissions || 'everyone'}
                        onChange={(e) => handleUpdateSettings({ callingPermissions: e.target.value as any })}
                        className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-black cursor-pointer"
                      >
                        <option value="everyone">Everyone</option>
                        <option value="following">People you follow</option>
                        <option value="none">No one</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 5. NOTIFICATIONS */}
                {activeTab === 'notifications' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Notification Preferences</h3>
                      <p className="text-xs text-gray-500 mb-4">Choose what activities trigger alerts on your device</p>
                    </div>

                    {/* Pause All */}
                    <div className="flex items-center justify-between p-3.5 bg-zinc-100 rounded-2xl border border-zinc-200">
                      <div className="pr-4">
                        <p className="text-xs font-bold text-gray-900">Pause All Notifications</p>
                        <p className="text-[11px] text-gray-500">Temporarily silence all push and in-app alerts</p>
                      </div>
                      <input
                        id="settings-pause-all-toggle"
                        type="checkbox"
                        checked={Boolean(settings?.notifications?.pauseAll)}
                        onChange={(e) => handleUpdateSettings({
                          notifications: { ...settings?.notifications!, pauseAll: e.target.checked }
                        })}
                        className="w-4 h-4 accent-black rounded cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2 pt-2">
                      {[
                        { key: 'likes', label: 'Likes & Reactions', desc: 'When someone likes your post or reel' },
                        { key: 'comments', label: 'Comments', desc: 'When someone comments on your posts' },
                        { key: 'newFollowers', label: 'New Followers', desc: 'When someone starts following you' },
                        { key: 'directMessages', label: 'Direct Messages', desc: 'When you receive a new chat message' },
                        { key: 'mentions', label: 'Mentions & Tags', desc: 'When someone mentions you in a post or comment' },
                        { key: 'calls', label: 'Voice & Video Calls', desc: 'Incoming call ring alerts' }
                      ].map(item => (
                        <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div>
                            <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                            <p className="text-[10px] text-gray-500">{item.desc}</p>
                          </div>
                          <input
                            type="checkbox"
                            disabled={Boolean(settings?.notifications?.pauseAll)}
                            checked={Boolean(settings?.notifications?.[item.key as keyof typeof settings.notifications])}
                            onChange={(e) => handleUpdateSettings({
                              notifications: {
                                ...settings?.notifications!,
                                [item.key]: e.target.checked
                              }
                            })}
                            className="w-4 h-4 accent-black rounded cursor-pointer disabled:opacity-40"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. BLOCKED ACCOUNTS */}
                {activeTab === 'blocked' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Blocked Accounts</h3>
                      <p className="text-xs text-gray-500 mb-4">Blocked users cannot message you, see your posts, or view your profile</p>
                    </div>

                    {/* Block form */}
                    <form onSubmit={handleBlockUser} className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Enter username to block..."
                        value={blockUsernameInput}
                        onChange={(e) => setBlockUsernameInput(e.target.value)}
                        className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black"
                      />
                      <button
                        id="settings-block-submit-btn"
                        type="submit"
                        disabled={blockingLoading || !blockUsernameInput.trim()}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {blockingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Block'}
                      </button>
                    </form>

                    {/* List of blocked accounts */}
                    <div className="space-y-2 pt-2">
                      {blockedUsers.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-xs">
                          No blocked accounts.
                        </div>
                      ) : (
                        blockedUsers.map(u => (
                          <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="flex items-center space-x-2.5">
                              <img
                                src={resolveAvatarUrl(u)}
                                alt={u.username}
                                className="w-8 h-8 rounded-full object-cover border border-gray-200"
                              />
                              <div>
                                <p className="text-xs font-bold text-gray-900">{u.displayName}</p>
                                <p className="text-[11px] text-gray-500 font-mono">@{u.username}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUnblockUser(u.id, u.username)}
                              className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-800 border border-gray-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              Unblock
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 7. PREFERENCES */}
                {activeTab === 'preferences' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">Content & Language</h3>
                      <p className="text-xs text-gray-500 mb-4">Customize your feed display and media playback</p>
                    </div>

                    <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5">
                      <label className="block text-xs font-bold text-gray-900">Sensitive Content Filter</label>
                      <select
                        value={settings?.contentFilter || 'standard'}
                        onChange={(e) => handleUpdateSettings({ contentFilter: e.target.value as any })}
                        className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-black cursor-pointer"
                      >
                        <option value="standard">Standard (Recommended)</option>
                        <option value="strict">Strict (Limits sensitive posts)</option>
                      </select>
                    </div>

                    <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1.5">
                      <label className="block text-xs font-bold text-gray-900">Language</label>
                      <select
                        value={settings?.preferredLanguage || 'English'}
                        onChange={(e) => handleUpdateSettings({ preferredLanguage: e.target.value })}
                        className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-black cursor-pointer"
                      >
                        <option value="English">English</option>
                        <option value="Spanish">Español (Spanish)</option>
                        <option value="French">Français (French)</option>
                        <option value="German">Deutsch (German)</option>
                        <option value="Arabic">العربية (Arabic)</option>
                        <option value="Hindi">हिन्दी (Hindi)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="pr-4">
                        <p className="text-xs font-bold text-gray-900">Autoplay Videos & Reels</p>
                        <p className="text-[11px] text-gray-500">Automatically play reels as you scroll through feeds</p>
                      </div>
                      <input
                        id="settings-autoplay-toggle"
                        type="checkbox"
                        checked={Boolean(settings?.autoplayVideos)}
                        onChange={(e) => handleUpdateSettings({ autoplayVideos: e.target.checked })}
                        className="w-4 h-4 accent-black rounded cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
