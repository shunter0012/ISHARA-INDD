import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Users, Camera, Check, Loader2, Sparkles } from 'lucide-react';
import { User, Conversation } from '../../types';
import { apiRequest } from '../../lib/api';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (newGroup: Conversation) => void;
  currentUser?: User | null;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  onGroupCreated,
  currentUser
}) => {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [eligibleUsers, setEligibleUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setGroupName('');
      setSearchQuery('');
      setSelectedUserIds([]);
      setGroupAvatarUrl('');
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      // First try to fetch eligible users; fallback to all users excluding current user
      let users: User[] = [];
      try {
        const eligibleRes = await apiRequest<{ users: User[] }>('/users/eligible-for-group');
        if (eligibleRes.users && eligibleRes.users.length > 0) {
          users = eligibleRes.users;
        }
      } catch {
        // Fallback
      }

      if (users.length === 0) {
        const allRes = await apiRequest<{ users: User[] }>('/users/all');
        users = (allRes.users || []).filter(u => u.id !== currentUser?.id);
      }

      // Filter out current user
      const filtered = users.filter(u => u.id !== currentUser?.id);
      setEligibleUsers(filtered);
    } catch (err: any) {
      console.error('Failed to load eligible users:', err);
      setError('Failed to load user list.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('ishara_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers,
        body: formData
      });

      if (!res.ok) throw new Error('Failed to upload image');
      const data = await res.json();
      setGroupAvatarUrl(data.url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setError('Please enter a group name.');
      return;
    }

    if (selectedUserIds.length < 1) {
      setError('Please select at least 1 other member to start a group.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const avatar = groupAvatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`;
      const res = await apiRequest<{ conversation: Conversation }>('/messages/groups', {
        method: 'POST',
        body: JSON.stringify({
          groupName: name,
          memberIds: selectedUserIds,
          groupAvatarUrl: avatar
        })
      });

      onGroupCreated(res.conversation);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = eligibleUsers.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedUsers = eligibleUsers.filter(u => selectedUserIds.includes(u.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">New Group DM</h2>
              <p className="text-xs text-zinc-500">Create a group chat with friends</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Group Identity Section */}
          <div className="flex items-center space-x-3.5 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <div className="relative group shrink-0">
              <div className="w-14 h-14 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center overflow-hidden border border-zinc-300 dark:border-zinc-600">
                {groupAvatarUrl ? (
                  <img src={groupAvatarUrl} alt="Group" className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-6 h-6 text-zinc-400" />
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                title="Upload Group Photo"
              >
                {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>

            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                Group Name *
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Design Squad, Weekend Crew..."
                maxLength={40}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
            </div>
          </div>

          {/* Selected Members Chips */}
          {selectedUsers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Selected ({selectedUsers.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedUserIds([])}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 font-medium"
                >
                  Clear all
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                {selectedUsers.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 pl-1 pr-2 py-0.5 rounded-full shadow-2xs text-xs"
                  >
                    <img
                      src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop'}
                      alt=""
                      className="w-4 h-4 rounded-full object-cover"
                    />
                    <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[100px]">
                      {user.displayName || user.username}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSelectUser(user.id)}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search following by username..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* Members List */}
          <div className="space-y-1 min-h-[160px] max-h-[240px] overflow-y-auto">
            {loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs">Loading people...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-zinc-400">
                <p className="text-xs">No matching users found.</p>
              </div>
            ) : (
              filteredUsers.map(user => {
                const isSelected = selectedUserIds.includes(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => toggleSelectUser(user.id)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop'}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate flex items-center space-x-1">
                          <span>{user.displayName || user.username}</span>
                          {user.verified && (
                            <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          @{user.username}
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900'
                        : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
          <span className="text-xs text-zinc-500 font-medium">
            {selectedUserIds.length} {selectedUserIds.length === 1 ? 'person' : 'people'} selected
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !groupName.trim() || selectedUserIds.length < 1}
              className="px-5 py-2 text-xs font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 rounded-xl transition-all disabled:opacity-40 flex items-center space-x-1.5 shadow-xs"
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Group</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
