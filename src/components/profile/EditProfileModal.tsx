import React, { useState, useRef } from 'react';
import { User } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { updateUserProfileInFirestore } from '../../lib/firestoreService';
import { useAuth } from '../../context/AuthContext';
import { uploadMediaFile } from '../../lib/upload';
import { compressProfileImage, resolveAvatarUrl, saveLocalAvatarCache, getDefaultAvatar } from '../../lib/avatar';
import { isharaAuth } from '../../lib/auth';
import { X, Camera, Upload, Loader2, Check, Phone, AtSign } from 'lucide-react';

interface EditProfileModalProps {
  user: User;
  onClose: () => void;
  onProfileUpdated: (updatedUser?: User) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  user,
  onClose,
  onProfileUpdated
}) => {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [username, setUsername] = useState(user.username || '');
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(resolveAvatarUrl(user));
  const [avatarBase64, setAvatarBase64] = useState<string | undefined>(user.avatarBase64);
  const [isPrivate, setIsPrivate] = useState(user.isPrivate || false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Phone state
  const [phoneInput, setPhoneInput] = useState(user.phone || '');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WEBP, etc.)');
      return;
    }

    setUploadError(null);
    setUploadingAvatar(true);
    try {
      // 1. Optimize image in canvas for instant preview and unbreakable permanence
      const { file: optimizedFile, dataUrl } = await compressProfileImage(file);
      setAvatarBase64(dataUrl);
      setAvatarUrl(dataUrl);
      saveLocalAvatarCache(user.id, dataUrl);

      // 2. Upload to server storage
      try {
        const uploadedUrl = await uploadMediaFile(optimizedFile);
        if (uploadedUrl) {
          setAvatarUrl(uploadedUrl);
        }
      } catch (uploadErr) {
        console.warn('[EditProfile] Server file upload fallback to base64:', uploadErr);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Failed to process selected image');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setUploadError(null);

    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();
    if (!cleanUsername) {
      setUploadError('Username cannot be empty');
      setSaving(false);
      return;
    }

    try {
      const res = await apiRequest<{ profile: User; user?: User; token?: string }>('/profile/update', {
        method: 'POST',
        body: JSON.stringify({
          username: cleanUsername,
          displayName: displayName.trim(),
          bio: bio.trim(),
          avatarUrl,
          avatarBase64,
          isPrivate,
          phone: phoneInput.trim()
        })
      });

      const updatedUser = res.user || res.profile;

      if (avatarBase64) {
        saveLocalAvatarCache(user.id, avatarBase64);
      }

      // Immediately sync active user in singleton session and cache
      if (updatedUser) {
        isharaAuth.updateCurrentUser(updatedUser, res.token);
      }

      // Mirror update directly to Cloud Firestore
      updateUserProfileInFirestore(user.id, {
        username: cleanUsername,
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl,
        avatarBase64,
        isPrivate
      }).catch(() => {});

      await refreshUser();
      onProfileUpdated(updatedUser);
      onClose();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#1A1A1A]">Edit Profile</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {uploadError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Profile Picture Device Gallery Upload Section */}
          <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 flex items-center space-x-4">
            <div className="relative group shrink-0">
              <img
                src={avatarUrl || resolveAvatarUrl(user)}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md cursor-pointer group-hover:opacity-80 transition-opacity"
                onClick={() => fileInputRef.current?.click()}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Change picture from device gallery"
              >
                {uploadingAvatar ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 mb-1">Profile Photo</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="edit-profile-avatar-file"
              />
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="px-3 py-1.5 bg-black hover:bg-zinc-800 text-white text-[11px] font-semibold rounded-xl flex items-center space-x-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {uploadingAvatar ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload from Gallery</span>
                    </>
                  )}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      const fallback = getDefaultAvatar(user.username, displayName);
                      setAvatarUrl(fallback);
                      setAvatarBase64('');
                    }}
                    className="px-2.5 py-1.5 text-gray-500 hover:text-red-600 text-[11px] font-medium transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Username</label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, '').toLowerCase())}
                placeholder="username"
                className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black focus:bg-white font-medium"
              />
              <AtSign className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Letters, numbers, periods, and underscores only</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black focus:bg-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700">Bio</label>
              <span className="text-[10px] text-gray-400">{bio.length}/160</span>
            </div>
            <textarea
              rows={3}
              maxLength={160}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell everyone a bit about yourself..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black focus:bg-white resize-none"
            />
          </div>

          {/* Phone Number Field */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Phone Number (Optional)
            </label>
            <div className="relative">
              <input
                type="tel"
                placeholder="+1234567890"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black focus:bg-white"
              />
              <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Used for account identification and direct login.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
            <div>
              <p className="text-xs font-bold text-gray-900">Private Account</p>
              <p className="text-[11px] text-gray-500">Require follow requests before users can see posts.</p>
            </div>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
              className="w-4 h-4 accent-black rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingAvatar}
              className="px-4 py-2 text-xs font-semibold bg-black hover:bg-gray-800 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
