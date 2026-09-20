import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Share2, Send, Search, Loader2, Users } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { User, Conversation } from '../../types/index';

export interface SharedContentRef {
  type: 'POST' | 'REEL';
  id: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url: string;
  sharedContent?: SharedContentRef;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  title,
  url,
  sharedContent
}) => {
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Conversation[]>([]);
  const [shareTab, setShareTab] = useState<'users' | 'groups'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [sendingToId, setSendingToId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([
        apiRequest<{ users: User[] }>('/users/all').catch(() => ({ users: [] })),
        apiRequest<{ conversations: Conversation[] }>('/conversations').catch(() => ({ conversations: [] }))
      ]).then(([usersRes, convsRes]) => {
        setUsers(usersRes.users || []);
        const groupConvs = (convsRes.conversations || []).filter(c => c.isGroup);
        setGroups(groupConvs);
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendDM = async (targetUser: User) => {
    if (!sharedContent || sendingToId) return;
    setSendingToId(targetUser.id);

    try {
      await apiRequest('/messages/share', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: targetUser.id,
          sharedContent,
          text: `Shared ${sharedContent.type.toLowerCase()}: ${title}`
        })
      });

      setSentIds(prev => new Set(prev).add(targetUser.id));
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setSendingToId(null);
    }
  };

  const handleSendToGroup = async (group: Conversation) => {
    if (!sharedContent || sendingToId) return;
    setSendingToId(group.id);

    try {
      await apiRequest('/messages/share', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: group.id,
          sharedContent,
          text: `Shared ${sharedContent.type.toLowerCase()}: ${title}`
        })
      });

      setSentIds(prev => new Set(prev).add(group.id));
    } catch (err: any) {
      alert(err.message || 'Failed to share to group');
    } finally {
      setSendingToId(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(g => 
    (g.name || 'Group Chat').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-zinc-100 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center space-x-2">
            <Share2 className="w-4 h-4 text-zinc-800" />
            <h3 className="text-sm font-bold text-zinc-900">Share</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Preview if shared */}
        {sharedContent && (
          <div className="my-3 p-2.5 bg-zinc-50 rounded-2xl border border-zinc-200/80 flex items-center space-x-3 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-black overflow-hidden shrink-0 border border-zinc-200">
              {sharedContent.thumbnailUrl || sharedContent.mediaUrl ? (
                <img
                  src={sharedContent.thumbnailUrl || sharedContent.mediaUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                {sharedContent.type}
              </span>
              <p className="text-xs font-bold text-zinc-900 truncate">
                {sharedContent.caption || `By @${sharedContent.authorUsername}`}
              </p>
              <p className="text-[10px] text-zinc-400 truncate">@{sharedContent.authorUsername}</p>
            </div>
          </div>
        )}

        {/* Share Destination Selector */}
        {sharedContent && (
          <div className="flex-1 min-h-0 flex flex-col my-1">
            <div className="flex items-center space-x-2 mb-2">
              <button
                onClick={() => setShareTab('users')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  shareTab === 'users' ? 'bg-black text-white shadow-xs' : 'text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                Direct Messages
              </button>
              <button
                onClick={() => setShareTab('groups')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1 cursor-pointer ${
                  shareTab === 'groups' ? 'bg-black text-white shadow-xs' : 'text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Groups ({groups.length})</span>
              </button>
            </div>
            
            {/* Search */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={shareTab === 'users' ? "Search friends..." : "Search groups..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-1 max-h-44 pr-1 divide-y divide-zinc-50">
              {loading ? (
                <div className="py-6 text-center text-xs text-zinc-400 flex items-center justify-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading contacts...</span>
                </div>
              ) : shareTab === 'users' ? (
                filteredUsers.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-400">
                    No users found
                  </div>
                ) : (
                  filteredUsers.map(u => {
                    const isSent = sentIds.has(u.id);
                    const isSending = sendingToId === u.id;

                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-50 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                          <img
                            src={u.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${u.username}`}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-zinc-200"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-900 truncate">{u.displayName}</p>
                            <p className="text-[10px] text-zinc-400 truncate">@{u.username}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSendDM(u)}
                          disabled={isSent || isSending}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
                            isSent
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-black hover:bg-zinc-800 text-white active:scale-95'
                          } disabled:cursor-default`}
                        >
                          {isSending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isSent ? (
                            <>
                              <Check className="w-3 h-3 stroke-[2.5]" />
                              <span>Sent</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              <span>Send</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )
              ) : (
                filteredGroups.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-400">
                    No group chats yet
                  </div>
                ) : (
                  filteredGroups.map(g => {
                    const isSent = sentIds.has(g.id);
                    const isSending = sendingToId === g.id;

                    return (
                      <div
                        key={g.id}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-50 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                          {g.groupAvatarUrl ? (
                            <img
                              src={g.groupAvatarUrl}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover border border-zinc-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center">
                              <Users className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-900 truncate">{g.name || 'Group Chat'}</p>
                            <p className="text-[10px] text-zinc-400 truncate">{g.participants.length} members</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSendToGroup(g)}
                          disabled={isSent || isSending}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
                            isSent
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-black hover:bg-zinc-800 text-white active:scale-95'
                          } disabled:cursor-default`}
                        >
                          {isSending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isSent ? (
                            <>
                              <Check className="w-3 h-3 stroke-[2.5]" />
                              <span>Sent</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              <span>Send</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        )}

        {/* Copy Link Section */}
        <div className="pt-3 border-t border-zinc-100 space-y-2 shrink-0">
          <div className="flex items-center space-x-2 bg-zinc-50 p-2 rounded-xl border border-zinc-200">
            <input
              type="text"
              readOnly
              value={url}
              className="bg-transparent text-xs text-zinc-700 flex-1 outline-none truncate select-all"
            />
            <button
              onClick={handleCopy}
              className="p-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 rounded-lg flex items-center space-x-1 text-xs font-semibold shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
