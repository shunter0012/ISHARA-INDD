import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Camera, Edit2, Check, UserPlus, Shield, ShieldAlert, 
  Trash2, LogOut, Loader2, Image as ImageIcon, Film, 
  MoreVertical, Sparkles, AlertTriangle 
} from 'lucide-react';
import { Conversation, User, UserPreview, Message } from '../../types';
import { apiRequest } from '../../lib/api';
import { GroupAddMembersModal } from './GroupAddMembersModal';

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation;
  onConversationUpdated: (updatedGroup: Conversation) => void;
  onLeaveGroup: () => void;
  onDeleteGroup?: () => void;
  currentUser?: User | null;
  onSelectUser?: (username: string) => void;
  onSelectReel?: (reelId: string) => void;
  onSelectPost?: (postId: string) => void;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  isOpen,
  onClose,
  conversation,
  onConversationUpdated,
  onLeaveGroup,
  onDeleteGroup,
  currentUser,
  onSelectUser,
  onSelectReel,
  onSelectPost
}) => {
  const [activeTab, setActiveTab] = useState<'members' | 'media'>('members');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(conversation.groupName || '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [actionMenuUserId, setActionMenuUserId] = useState<string | null>(null);
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<UserPreview | null>(null);

  const [sharedMedia, setSharedMedia] = useState<Message[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isCurrentUserAdmin = Boolean(
    currentUser?.id && 
    (conversation.adminIds?.includes(currentUser.id) || conversation.creatorId === currentUser.id)
  );

  const isCurrentUserCreator = Boolean(
    currentUser?.id && conversation.creatorId === currentUser.id
  );

  const isCurrentUserMember = Boolean(
    currentUser?.id && conversation.participants?.some(p => p.id === currentUser.id)
  );

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsEditingName(false);
      setNewName(conversation.groupName || '');
      setActionMenuUserId(null);
      setConfirmLeave(false);
      setConfirmDelete(false);
      setConfirmRemoveUser(null);

      if (activeTab === 'media') {
        loadSharedMedia();
      }
    }
  }, [isOpen, conversation.id, activeTab]);

  const loadSharedMedia = async () => {
    setLoadingMedia(true);
    try {
      const res = await apiRequest<{ media: Message[] }>(`/messages/groups/${conversation.id}/media`);
      setSharedMedia(res.media || []);
    } catch {
      // Fallback
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === conversation.groupName) {
      setIsEditingName(false);
      return;
    }

    setSavingName(true);
    setError(null);
    try {
      const res = await apiRequest<{ conversation: Conversation }>(`/messages/groups/${conversation.id}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ groupName: trimmed })
      });
      onConversationUpdated(res.conversation);
      setIsEditingName(false);
    } catch (err: any) {
      setError(err.message || 'Failed to rename group');
    } finally {
      setSavingName(false);
    }
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

      const updateRes = await apiRequest<{ conversation: Conversation }>(`/messages/groups/${conversation.id}/photo`, {
        method: 'PATCH',
        body: JSON.stringify({ photoUrl: data.url })
      });

      onConversationUpdated(updateRes.conversation);
    } catch (err: any) {
      setError(err.message || 'Failed to update photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleToggleAdmin = async (targetUserId: string, makeAdmin: boolean) => {
    setActionMenuUserId(null);
    setError(null);
    try {
      const res = await apiRequest<{ conversation: Conversation }>(`/messages/groups/${conversation.id}/admins`, {
        method: 'PATCH',
        body: JSON.stringify({ targetUserId, makeAdmin })
      });
      onConversationUpdated(res.conversation);
    } catch (err: any) {
      setError(err.message || 'Failed to update admin status');
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    setConfirmRemoveUser(null);
    setActionMenuUserId(null);
    setError(null);
    try {
      const res = await apiRequest<{ conversation: Conversation }>(`/messages/groups/${conversation.id}/members/${targetUserId}`, {
        method: 'DELETE'
      });
      onConversationUpdated(res.conversation);
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  const handleConfirmLeave = async () => {
    if (!currentUser) return;
    setError(null);
    try {
      await apiRequest(`/messages/groups/${conversation.id}/members/${currentUser.id}`, {
        method: 'DELETE'
      });
      onLeaveGroup();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to leave group');
    }
  };

  const handleConfirmDelete = async () => {
    setError(null);
    try {
      await apiRequest(`/messages/groups/${conversation.id}`, {
        method: 'DELETE'
      });
      if (onDeleteGroup) {
        onDeleteGroup();
      } else {
        onLeaveGroup();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete group');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => {
          e.stopPropagation();
          setActionMenuUserId(null);
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Group Details</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Group Profile Card */}
          <div className="flex flex-col items-center text-center space-y-3 pt-2">
            <div className="relative group">
              <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden border-2 border-zinc-200 dark:border-zinc-700 shadow-sm">
                <img
                  src={conversation.groupAvatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(conversation.groupName || 'Group')}`}
                  alt={conversation.groupName || 'Group'}
                  className="w-full h-full object-cover"
                />
              </div>

              {isCurrentUserAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                    title="Change Group Photo"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </>
              )}
            </div>

            {/* Group Name & Inline Edit */}
            <div className="w-full max-w-sm">
              {isEditingName ? (
                <div className="flex items-center space-x-1.5 justify-center">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="px-3 py-1.5 text-sm font-semibold bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-xl text-center focus:outline-hidden focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !newName.trim()}
                    className="p-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl disabled:opacity-50"
                  >
                    {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingName(false);
                      setNewName(conversation.groupName || '');
                    }}
                    className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {conversation.groupName || 'Group Chat'}
                  </h3>
                  {isCurrentUserAdmin && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Rename Group"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <p className="text-xs text-zinc-500 mt-1">
                {conversation.participants?.length || 0} members
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 pb-2.5 text-xs font-bold transition-colors relative ${
                activeTab === 'members'
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              Members ({conversation.participants?.length || 0})
              {activeTab === 'members' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('media')}
              className={`flex-1 pb-2.5 text-xs font-bold transition-colors relative ${
                activeTab === 'media'
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              Shared Media
              {activeTab === 'media' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full" />
              )}
            </button>
          </div>

          {/* Tab 1: Members */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              {/* Add People action for group members and admins */}
              {(isCurrentUserAdmin || isCurrentUserMember) && (
                <button
                  type="button"
                  onClick={() => setIsAddMembersOpen(true)}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-xs font-bold text-zinc-900 dark:text-zinc-100 transition-colors shadow-2xs"
                >
                  <UserPlus className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                  <span>Add People</span>
                </button>
              )}

              {/* Members List */}
              <div className="space-y-1 divide-y divide-zinc-100/60 dark:divide-zinc-800/60">
                {conversation.participants?.map((member) => {
                  const isCreator = member.id === conversation.creatorId;
                  const isAdmin = Boolean(conversation.adminIds?.includes(member.id));
                  const isTargetCurrent = member.id === currentUser?.id;

                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between py-2.5 px-1 relative group"
                    >
                      {/* Avatar & Name */}
                      <div
                        onClick={() => {
                          if (member.username && onSelectUser) {
                            onSelectUser(member.username);
                            onClose();
                          }
                        }}
                        className="flex items-center space-x-3 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <img
                          src={member.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop'}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {member.displayName || member.username}
                            </span>
                            {isTargetCurrent && (
                              <span className="text-[10px] text-zinc-400 font-medium">(You)</span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            @{member.username}
                          </div>
                        </div>
                      </div>

                      {/* Badges & Actions */}
                      <div className="flex items-center space-x-2 shrink-0">
                        {isCreator ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Sparkles className="w-2.5 h-2.5 mr-1" />
                            Creator
                          </span>
                        ) : isAdmin ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            <Shield className="w-2.5 h-2.5 mr-1" />
                            Admin
                          </span>
                        ) : null}

                        {/* Admin Action Menu Button for other members */}
                        {isCurrentUserAdmin && !isTargetCurrent && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionMenuUserId(actionMenuUserId === member.id ? null : member.id);
                              }}
                              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {actionMenuUserId === member.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                              >
                                {isAdmin && !isCreator ? (
                                  <button
                                    onClick={() => handleToggleAdmin(member.id, false)}
                                    className="w-full px-3 py-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center space-x-2"
                                  >
                                    <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
                                    <span>Dismiss as Admin</span>
                                  </button>
                                ) : !isAdmin ? (
                                  <button
                                    onClick={() => handleToggleAdmin(member.id, true)}
                                    className="w-full px-3 py-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center space-x-2"
                                  >
                                    <Shield className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Make Group Admin</span>
                                  </button>
                                ) : null}

                                {!isCreator && (
                                  <button
                                    onClick={() => {
                                      setActionMenuUserId(null);
                                      setConfirmRemoveUser(member);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center space-x-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                    <span>Remove from Group</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Shared Media */}
          {activeTab === 'media' && (
            <div className="space-y-3">
              {loadingMedia ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-xs">Loading shared media...</span>
                </div>
              ) : sharedMedia.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-400 text-center">
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs font-medium">No media shared in this group yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {sharedMedia.map(item => {
                    const isReel = item.sharedContent?.type === 'REEL';
                    const mediaSrc = item.mediaUrl || item.sharedContent?.thumbnailUrl || item.sharedContent?.mediaUrl;

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (isReel && onSelectReel && item.sharedContent?.id) {
                            onSelectReel(item.sharedContent.id);
                            onClose();
                          } else if (item.sharedContent?.id && onSelectPost) {
                            onSelectPost(item.sharedContent.id);
                            onClose();
                          }
                        }}
                        className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 cursor-pointer group hover:opacity-90 transition-opacity"
                      >
                        {mediaSrc ? (
                          <img
                            src={mediaSrc}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}

                        {isReel && (
                          <div className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-md text-white">
                            <Film className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Danger Zone Actions */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
            {confirmLeave ? (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-2xl space-y-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Leave this group?</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  You will no longer receive new messages from this group chat.
                </p>
                <div className="flex items-center space-x-2 justify-end pt-1">
                  <button
                    onClick={() => setConfirmLeave(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmLeave}
                    className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-xs"
                  >
                    Yes, Leave Group
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-2xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Leave Group</span>
              </button>
            )}

            {/* Creator / Owner Delete Group */}
            {(isCurrentUserCreator || currentUser?.role === 'OWNER_ADMIN' || currentUser?.role === 'ADMIN') && (
              confirmDelete ? (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-2xl space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Delete group permanently?</span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    All messages and media history will be deleted for everyone in this group.
                  </p>
                  <div className="flex items-center space-x-2 justify-end pt-1">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-800 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-xs"
                    >
                      Yes, Delete Group
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 text-xs font-bold text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-2xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Group</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal to remove specific user */}
      {confirmRemoveUser && (
        <div 
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          onClick={() => setConfirmRemoveUser(null)}
        >
          <div 
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h4 className="text-sm font-bold">Remove Member</h4>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to remove <strong className="text-zinc-900 dark:text-zinc-100">{confirmRemoveUser.displayName || confirmRemoveUser.username}</strong> from the group?
            </p>
            <div className="flex items-center space-x-2 justify-end pt-2">
              <button
                onClick={() => setConfirmRemoveUser(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveMember(confirmRemoveUser.id)}
                className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-xs"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nested Add Members Modal */}
      {isAddMembersOpen && (
        <GroupAddMembersModal
          isOpen={isAddMembersOpen}
          onClose={() => setIsAddMembersOpen(false)}
          conversation={conversation}
          onMembersAdded={(updated) => {
            onConversationUpdated(updated);
          }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};
