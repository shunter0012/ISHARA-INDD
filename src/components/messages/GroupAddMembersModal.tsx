import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, Check, Loader2, Sparkles } from 'lucide-react';
import { User, Conversation } from '../../types';
import { apiRequest } from '../../lib/api';

interface GroupAddMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation;
  onMembersAdded: (updatedGroup: Conversation) => void;
  currentUser?: User | null;
}

export const GroupAddMembersModal: React.FC<GroupAddMembersModalProps> = ({
  isOpen,
  onClose,
  conversation,
  onMembersAdded,
  currentUser
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [eligibleUsers, setEligibleUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSearchQuery('');
      setSelectedUserIds([]);
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const existingMemberIds = new Set((conversation.participants || []).map(p => p.id));
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
        users = allRes.users || [];
      }

      // Filter out current user and existing members
      const filtered = users.filter(u => u.id !== currentUser?.id && !existingMemberIds.has(u.id));
      setEligibleUsers(filtered);
    } catch (err: any) {
      console.error('Failed to load users:', err);
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

  const handleAdd = async () => {
    if (selectedUserIds.length === 0) return;

    setAdding(true);
    setError(null);

    try {
      const res = await apiRequest<{ conversation: Conversation }>(`/messages/groups/${conversation.id}/members`, {
        method: 'POST',
        body: JSON.stringify({
          memberIds: selectedUserIds
        })
      });

      onMembersAdded(res.conversation);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add members');
    } finally {
      setAdding(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = eligibleUsers.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedUsers = eligibleUsers.filter(u => selectedUserIds.includes(u.id));

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-zinc-100">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Add People</h3>
              <p className="text-xs text-zinc-500">to {conversation.groupName || 'Group'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Selected Chips */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-1 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
              {selectedUsers.map(user => (
                <div
                  key={user.id}
                  className="flex items-center space-x-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 pl-1 pr-2 py-0.5 rounded-full text-xs shadow-2xs"
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
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* User List */}
          <div className="space-y-1 min-h-[160px] max-h-[260px] overflow-y-auto">
            {loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs">Loading people...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-zinc-400">
                <p className="text-xs">No eligible users found to add.</p>
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

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
          <span className="text-xs text-zinc-500 font-medium">
            {selectedUserIds.length} selected
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
              onClick={handleAdd}
              disabled={adding || selectedUserIds.length === 0}
              className="px-5 py-2 text-xs font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 rounded-xl transition-all disabled:opacity-40 flex items-center space-x-1.5 shadow-xs"
            >
              {adding ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <span>Add Selected</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
