import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, UserPreview, User } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { usePresence } from '../../context/PresenceContext';
import { useRealtime } from '../../context/RealtimeContext';
import { apiRequest } from '../../lib/api';
import { subscribeToRealtimeMessages, sendMessageToFirestore } from '../../lib/firestoreService';
import { 
  Send, 
  Phone, 
  Video, 
  MessageSquare, 
  Plus, 
  Check, 
  CheckCheck, 
  Image as ImageIcon, 
  Paperclip, 
  X, 
  Users, 
  ArrowLeft,
  Search,
  Mic,
  Info,
  SquarePen,
  Loader2,
  Sparkles,
  Trash2,
  MoreVertical,
  Ban,
  AlertTriangle,
  UserX
} from 'lucide-react';
import { SystemMessageBubble } from './SystemMessageBubble';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { VoiceRecorder } from './VoiceRecorder';
import { SharedContentBubble } from './SharedContentBubble';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupInfoModal } from './GroupInfoModal';

interface MessagesViewProps {
  onSelectUser: (username: string) => void;
  directUser?: UserPreview | null;
  onBack?: () => void;
  onSelectReel?: (reelId: string) => void;
  onSelectPost?: (postId: string) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ 
  onSelectUser, 
  directUser, 
  onBack,
  onSelectReel,
  onSelectPost 
}) => {
  const { user } = useAuth();
  const { startCall } = useCall();
  const { isUserOnline } = usePresence();
  const { subscribe } = useRealtime();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachedMediaUrl, setAttachedMediaUrl] = useState<string | null>(null);
  const [attachedMediaType, setAttachedMediaType] = useState<'image' | 'video'>('image');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'direct' | 'groups'>('all');

  // Modals
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isNewDirectChatOpen, setIsNewDirectChatOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Message Deletion Menu & Modal State
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    message: Message;
    type: 'me' | 'everyone';
  } | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchConversations = async () => {
    try {
      const res = await apiRequest<{ conversations: Conversation[] }>('/conversations');
      setConversations(res.conversations || []);
      if (selectedConv) {
        const updated = res.conversations.find(c => c.id === selectedConv.id);
        if (updated) setSelectedConv(updated);
      }
    } catch {
      // Ignore
    }
  };

  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await apiRequest<{ users: User[] }>('/users/all');
      setAllUsers((res.users || []).filter(u => u.id !== user?.id && !u.isBanned));
    } catch {
      // Ignore
    } finally {
      setLoadingUsers(false);
    }
  };

  const markConversationAsSeen = async (convId: string) => {
    try {
      await apiRequest(`/conversations/${convId}/seen`, { method: 'POST' });
    } catch {
      // Ignore
    }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const res = await apiRequest<{ messages: Message[] }>(`/conversations/${convId}/messages`);
      setMessages(res.messages || []);
      markConversationAsSeen(convId);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchAllUsers();
    const interval = setInterval(fetchConversations, 6000);
    return () => clearInterval(interval);
  }, []);

  // Real-time Event Subscription
  useEffect(() => {
    const unsubMsg = subscribe('NEW_MESSAGE', (evt) => {
      if (evt.message) {
        if (selectedConv && evt.message.conversationId === selectedConv.id) {
          setMessages(prev => {
            if (prev.some(m => m.id === evt.message.id)) return prev;
            return [...prev, evt.message];
          });
          markConversationAsSeen(selectedConv.id);
        }
        fetchConversations();
      }
    });

    const unsubSeen = subscribe('MESSAGE_SEEN', (evt) => {
      if (selectedConv && evt.conversationId === selectedConv.id) {
        setMessages(prev => prev.map(m => {
          if (m.id === evt.messageId || m.senderId === user?.id) {
            return { ...m, isRead: true, seenAt: evt.seenAt || new Date().toISOString() };
          }
          return m;
        }));
      }
    });

    const unsubGroup = subscribe('GROUP_UPDATED', (evt) => {
      fetchConversations();
      if (selectedConv && evt.conversationId === selectedConv.id) {
        fetchMessages(selectedConv.id);
      }
    });

    const unsubConv = subscribe('CONVERSATION_UPDATED', (evt) => {
      fetchConversations();
      if (selectedConv && evt.conversation?.id === selectedConv.id) {
        setSelectedConv(evt.conversation);
        fetchMessages(selectedConv.id);
      }
    });

    const unsubDelMe = subscribe('MESSAGE_DELETED_FOR_ME', (evt) => {
      if (evt.userId === user?.id) {
        setMessages(prev => prev.filter(m => m.id !== evt.messageId));
        fetchConversations();
      }
    });

    const unsubDelAll = subscribe('MESSAGE_DELETED_FOR_EVERYONE', (evt) => {
      setMessages(prev => prev.map(m => {
        if (m.id === evt.messageId) {
          return {
            ...m,
            deletedForEveryone: true,
            deletedAt: evt.deletedAt,
            deletedBy: evt.deletedBy,
            text: 'This message was deleted',
            mediaUrl: undefined,
            voiceDuration: undefined,
            sharedContent: undefined
          };
        }
        return m;
      }));
      fetchConversations();
    });

    const unsubDel = subscribe('MESSAGE_DELETED', (evt) => {
      if (evt.deletedForEveryone) {
        setMessages(prev => prev.map(m => {
          if (m.id === evt.messageId) {
            return {
              ...m,
              deletedForEveryone: true,
              deletedAt: evt.deletedAt,
              deletedBy: evt.deletedBy,
              text: 'This message was deleted',
              mediaUrl: undefined,
              voiceDuration: undefined,
              sharedContent: undefined
            };
          }
          return m;
        }));
      } else if (evt.deletedForUserId === user?.id) {
        setMessages(prev => prev.filter(m => m.id !== evt.messageId));
      }
      fetchConversations();
    });

    // Realtime Firestore snapshot listener
    const unsubFirestore = selectedConv ? subscribeToRealtimeMessages(selectedConv.id, (cloudMsg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === cloudMsg.id)) {
          return prev.map(m => m.id === cloudMsg.id ? { ...m, ...cloudMsg } : m);
        }
        return [...prev, cloudMsg];
      });
    }) : () => {};

    return () => {
      unsubMsg();
      unsubSeen();
      unsubGroup();
      unsubConv();
      unsubDelMe();
      unsubDelAll();
      unsubDel();
      unsubFirestore();
    };
  }, [selectedConv?.id, user?.id]);

  // Handle direct user passed via props
  useEffect(() => {
    if (directUser && user) {
      const startDirect = async () => {
        try {
          const res = await apiRequest<{ conversation: Conversation }>('/conversations/start', {
            method: 'POST',
            body: JSON.stringify({ targetUserId: directUser.id })
          });
          setSelectedConv(res.conversation);
          fetchMessages(res.conversation.id);
          fetchConversations();
        } catch (err: any) {
          alert(err.message || 'Could not start conversation with this user');
        }
      };
      startDirect();
    }
  }, [directUser, user?.id]);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv.id);
    }
  }, [selectedConv?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle message deletion (Delete for me vs Delete for everyone)
  const handleDeleteMessage = async (message: Message, type: 'me' | 'everyone') => {
    setIsDeletingMessage(true);
    try {
      const endpoint = type === 'everyone' 
        ? `/messages/${message.id}/delete-for-everyone`
        : `/messages/${message.id}/delete-for-me`;

      await apiRequest(endpoint, { method: 'POST' });

      if (type === 'me') {
        setMessages(prev => prev.filter(m => m.id !== message.id));
      } else {
        setMessages(prev => prev.map(m => {
          if (m.id === message.id) {
            return {
              ...m,
              deletedForEveryone: true,
              deletedAt: new Date().toISOString(),
              deletedBy: user?.id,
              text: 'This message was deleted',
              mediaUrl: undefined,
              voiceDuration: undefined,
              sharedContent: undefined
            };
          }
          return m;
        }));
      }

      fetchConversations();
      setConfirmDeleteModal(null);
      setActiveMenuMessageId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete message');
    } finally {
      setIsDeletingMessage(false);
    }
  };

  const handleTouchStart = (msg: Message) => {
    if (msg.isSystem || msg.deletedForEveryone) return;
    longPressTimerRef.current = setTimeout(() => {
      setActiveMenuMessageId(msg.id);
      if (typeof window !== 'undefined' && window.navigator && 'vibrate' in window.navigator) {
        window.navigator.vibrate(35);
      }
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDeviceFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    setAttachedMediaType(isVideo ? 'video' : 'image');
    setIsUploadingMedia(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('ishara_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers,
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const data = await uploadRes.json();
      setAttachedMediaUrl(data.url);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedMediaUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !attachedMediaUrl) || !selectedConv || !user || isSending) return;

    const textToSend = inputText.trim();
    const mediaUrlToSend = attachedMediaUrl;
    const mediaTypeToSend = attachedMediaType;

    setInputText('');
    setAttachedMediaUrl(null);
    setIsSending(true);

    try {
      const res = await apiRequest<{ message: Message }>('/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedConv.id,
          text: textToSend || undefined,
          mediaUrl: mediaUrlToSend || undefined,
          mediaType: mediaUrlToSend ? mediaTypeToSend : undefined
        })
      });
      setMessages(prev => {
        if (prev.some(m => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });

      // Synchronize directly with Cloud Firestore
      sendMessageToFirestore(selectedConv.id, res.message).catch(() => {});

      fetchConversations();
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendVoice = async (audioUrl: string, duration: number) => {
    if (!selectedConv || !user) return;
    try {
      const res = await apiRequest<{ message: Message }>('/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedConv.id,
          mediaUrl: audioUrl,
          mediaType: 'voice',
          voiceDuration: duration
        })
      });
      setMessages(prev => {
        if (prev.some(m => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      setIsRecordingVoice(false);
      fetchConversations();
    } catch (err: any) {
      alert(err.message || 'Failed to send voice note');
    }
  };

  const handleStartDirectChat = async (targetUserId: string) => {
    try {
      const res = await apiRequest<{ conversation: Conversation }>('/conversations/start', {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });
      setSelectedConv(res.conversation);
      setIsNewDirectChatOpen(false);
      fetchMessages(res.conversation.id);
      fetchConversations();
    } catch (err: any) {
      alert(err.message || 'Could not start conversation');
    }
  };

  const handleGroupCreated = (newGroup: Conversation) => {
    setSelectedConv(newGroup);
    setIsCreateGroupOpen(false);
    fetchMessages(newGroup.id);
    fetchConversations();
  };

  const handleGroupUpdated = (updatedGroup: Conversation) => {
    setSelectedConv(updatedGroup);
    fetchConversations();
    fetchMessages(updatedGroup.id);
  };

  const handleGroupLeft = () => {
    setIsGroupInfoOpen(false);
    setSelectedConv(null);
    fetchConversations();
  };

  const handleGroupDeleted = () => {
    setIsGroupInfoOpen(false);
    setSelectedConv(null);
    fetchConversations();
  };

  const getOtherParticipant = (conv: Conversation): UserPreview => {
    return conv.participants.find(p => p.id !== user?.id) || conv.participants[0] || {
      id: 'unknown',
      username: 'User',
      displayName: 'User',
      avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=user'
    };
  };

  const isGroup = Boolean(selectedConv?.isGroup);
  const isGroupAdmin = Boolean(
    selectedConv?.isGroup && (
      selectedConv?.creatorId === user?.id ||
      selectedConv?.adminIds?.includes(user?.id || '') ||
      user?.role === 'ADMIN' ||
      user?.role === 'OWNER_ADMIN' ||
      user?.username?.toLowerCase() === 'shuv'
    )
  );
  const otherUser = selectedConv && !isGroup ? getOtherParticipant(selectedConv) : null;
  const isOnline = otherUser ? isUserOnline(otherUser.id) : false;
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  // Filtered conversations
  const filteredConversations = conversations.filter(conv => {
    if (filterTab === 'direct' && conv.isGroup) return false;
    if (filterTab === 'groups' && !conv.isGroup) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (conv.isGroup) {
        const nameMatch = (conv.name || 'Group Chat').toLowerCase().includes(q);
        const memberMatch = conv.participants.some(p => 
          p.displayName?.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)
        );
        return nameMatch || memberMatch;
      } else {
        const peer = getOtherParticipant(conv);
        return peer.displayName?.toLowerCase().includes(q) || peer.username.toLowerCase().includes(q);
      }
    }
    return true;
  });

  const filteredUsersForDirect = allUsers.filter(u => 
    u.displayName?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    u.username.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  return (
    <div className="w-full h-full max-h-full bg-white border border-zinc-200 rounded-2xl md:rounded-3xl shadow-sm flex overflow-hidden flex-1 min-h-0">
      
      {/* Left Column: Conversations List */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-zinc-200 flex flex-col bg-white shrink-0 h-full min-h-0 ${
        selectedConv ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Top Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 -ml-1 text-zinc-600 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                title="Back to feed"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">Messages</h2>
            <span className="text-[11px] font-semibold text-zinc-400">
              ({conversations.length})
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsCreateGroupOpen(true)}
              className="p-2 text-zinc-700 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors flex items-center space-x-1 cursor-pointer"
              title="New Group Chat"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsNewDirectChatOpen(true)}
              className="p-2 bg-black hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-colors flex items-center space-x-1 cursor-pointer"
              title="New Direct Message"
            >
              <SquarePen className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-3.5 py-2.5 border-b border-zinc-100">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chats or members..."
              className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-zinc-100 border border-transparent rounded-xl focus:bg-white focus:border-zinc-300 focus:outline-none transition-all placeholder:text-zinc-400"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-0.5 text-zinc-400 hover:text-zinc-600 rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center space-x-1 mt-2">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterTab === 'all' 
                  ? 'bg-zinc-900 text-white shadow-xs' 
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterTab('direct')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterTab === 'direct' 
                  ? 'bg-zinc-900 text-white shadow-xs' 
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              Direct
            </button>
            <button
              onClick={() => setFilterTab('groups')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 cursor-pointer ${
                filterTab === 'groups' 
                  ? 'bg-zinc-900 text-white shadow-xs' 
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Groups</span>
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-50 min-h-0 overscroll-contain touch-pan-y">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-700">No conversations found</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">Start a direct chat or create a group</p>
              </div>
              <div className="flex items-center justify-center space-x-2 pt-1">
                <button
                  onClick={() => setIsNewDirectChatOpen(true)}
                  className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded-xl hover:bg-zinc-800 transition-colors"
                >
                  Direct Chat
                </button>
                <button
                  onClick={() => setIsCreateGroupOpen(true)}
                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl transition-colors"
                >
                  New Group
                </button>
              </div>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = selectedConv?.id === conv.id;
              const isGroupConv = Boolean(conv.isGroup);
              const peer = isGroupConv ? null : getOtherParticipant(conv);
              const online = peer ? isUserOnline(peer.id) : false;
              const isLastMe = conv.lastMessage?.senderId === user?.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    setSelectedConv(conv);
                    fetchMessages(conv.id);
                    markConversationAsSeen(conv.id);
                  }}
                  className={`p-3.5 flex items-center space-x-3 cursor-pointer transition-all ${
                    isSelected ? 'bg-zinc-100/90 font-medium' : 'hover:bg-zinc-50'
                  }`}
                >
                  {/* Avatar Container */}
                  <div className="relative shrink-0">
                    {isGroupConv ? (
                      conv.groupAvatarUrl ? (
                        <img
                          src={conv.groupAvatarUrl}
                          alt={conv.name || 'Group'}
                          className="w-12 h-12 rounded-full object-cover border border-zinc-200 shadow-xs"
                        />
                      ) : (
                        <div className="relative w-12 h-12 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold border border-zinc-200 shadow-xs">
                          {conv.participants && conv.participants.length >= 2 ? (
                            <div className="relative w-full h-full">
                              <img
                                src={conv.participants[0]?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${conv.participants[0]?.username}`}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover border-2 border-white absolute top-0 left-0"
                              />
                              <img
                                src={conv.participants[1]?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${conv.participants[1]?.username}`}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover border-2 border-white absolute bottom-0 right-0"
                              />
                            </div>
                          ) : (
                            <Users className="w-5 h-5 text-zinc-300" />
                          )}
                        </div>
                      )
                    ) : (
                      <>
                        <img
                          src={peer?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${peer?.username}`}
                          alt={peer?.displayName}
                          className="w-12 h-12 rounded-full object-cover border border-zinc-200"
                        />
                        {online && (
                          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                        )}
                      </>
                    )}
                  </div>

                  {/* Conv Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">
                          {isGroupConv ? (conv.name || 'Group Chat') : peer?.displayName}
                        </p>
                        {isGroupConv && (
                          <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[9px] font-semibold shrink-0">
                            {conv.participants?.length || 0}
                          </span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <span className="text-[10px] text-zinc-400 shrink-0 ml-1">
                          {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[11px] text-zinc-500 truncate pr-2 flex items-center space-x-1">
                        {isLastMe && (
                          <span className={conv.lastMessage?.isRead ? "text-sky-500" : "text-zinc-400"}>
                            {conv.lastMessage?.isRead ? (
                              <CheckCheck className="w-3 h-3 inline mr-0.5 stroke-[2.5]" />
                            ) : (
                              <Check className="w-3 h-3 inline mr-0.5" />
                            )}
                          </span>
                        )}
                        <span>
                          {conv.lastMessage?.isSystem ? (
                            <span className="italic text-zinc-400">{conv.lastMessage.text}</span>
                          ) : conv.lastMessage?.sharedContent ? (
                            `Shared ${conv.lastMessage.sharedContent.type.toLowerCase()}`
                          ) : conv.lastMessage?.mediaType === 'voice' ? (
                            '🎤 Voice message'
                          ) : (
                            conv.lastMessage?.text || 
                            (conv.lastMessage?.mediaUrl ? 'Sent media' : (isGroupConv ? `${conv.participants.length} members` : 'Say hello'))
                          )}
                        </span>
                      </p>
                      {conv.unreadCount !== undefined && conv.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Active Chat */}
      <div className={`flex-1 flex flex-col bg-[#F9FAFB] min-w-0 h-full min-h-0 ${
        !selectedConv ? 'hidden md:flex' : 'flex'
      }`}>
        {selectedConv ? (
          <>
            {/* Active Chat Header */}
            <div className="p-3.5 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 shadow-xs h-16">
              <div className="flex items-center space-x-2.5 min-w-0">
                {/* Back Button: Works on Desktop & Mobile */}
                <button
                  onClick={() => setSelectedConv(null)}
                  className="p-2 text-zinc-600 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors shrink-0 cursor-pointer"
                  title="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {isGroup ? (
                  <div 
                    onClick={() => setIsGroupInfoOpen(true)}
                    className="flex items-center space-x-3 cursor-pointer group min-w-0 hover:opacity-90 transition-opacity"
                    title="Group details & settings"
                  >
                    {selectedConv.groupAvatarUrl ? (
                      <img
                        src={selectedConv.groupAvatarUrl}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border border-zinc-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <p className="text-xs font-bold text-zinc-900 group-hover:underline truncate">
                          {selectedConv.name || 'Group Chat'}
                        </p>
                      </div>
                      <p className="text-[10px] text-zinc-400 truncate">
                        {selectedConv.participants?.length || 0} members • Tap for details
                      </p>
                    </div>
                  </div>
                ) : otherUser ? (
                  <div 
                    onClick={() => onSelectUser(otherUser.username)}
                    className="flex items-center space-x-3 cursor-pointer group min-w-0 hover:opacity-90 transition-opacity"
                    title="View user profile"
                  >
                    <div className="relative shrink-0">
                      <img
                        src={otherUser.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${otherUser.username}`}
                        alt={otherUser.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-zinc-200"
                      />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-900 group-hover:underline truncate">
                        {otherUser.displayName}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">
                        {isOnline ? 'Active now' : `@${otherUser.username}`}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-1 shrink-0">
                {isGroup ? (
                  <>
                    <button
                      onClick={() => setIsGroupInfoOpen(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Group Info</span>
                    </button>
                  </>
                ) : otherUser ? (
                  <>
                    <button
                      id="dm-audio-call-btn"
                      onClick={() => startCall(otherUser.id, 'audio')}
                      className="p-2 text-zinc-600 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                      title="Audio Call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      id="dm-video-call-btn"
                      onClick={() => startCall(otherUser.id, 'video')}
                      className="p-2 text-zinc-600 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                      title="Video Call"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {/* Messages Scrollable Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-0 overscroll-contain touch-pan-y">
              {messages.length === 0 && (
                <div className="py-16 text-center text-zinc-400 space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-zinc-600">
                    {isGroup ? `Welcome to ${selectedConv.name || 'this group'}!` : `This is the beginning of your chat with ${otherUser?.displayName}.`}
                  </p>
                  <p className="text-[11px] text-zinc-400">Send a message, voice note, or photo to say hello!</p>
                </div>
              )}

              {messages.map((msg, index) => {
                // Render System Messages (Group renamed, member added/left, photo changed)
                if (msg.isSystem || msg.systemEventType) {
                  return (
                    <SystemMessageBubble key={msg.id || index} message={msg} />
                  );
                }

                const isMe = msg.senderId === user?.id;
                const sender = isGroup && !isMe 
                  ? selectedConv.participants.find(p => p.id === msg.senderId)
                  : null;

                // Render Deleted Message
                if (msg.deletedForEveryone) {
                  return (
                    <div
                      key={msg.id || index}
                      className={`flex items-end space-x-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      {isGroup && !isMe && (
                        <img
                          src={sender?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${sender?.username || msg.senderId}`}
                          alt={sender?.displayName || ''}
                          className="w-7 h-7 rounded-full object-cover shrink-0 mb-0.5 border border-zinc-200"
                        />
                      )}
                      <div className="flex flex-col max-w-[85%] sm:max-w-[70%]">
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-xs italic flex items-center space-x-2 select-none ${
                            isMe
                              ? 'bg-zinc-800 text-zinc-400 rounded-br-xs'
                              : 'bg-zinc-100 text-zinc-500 border border-zinc-200/80 rounded-bl-xs'
                          }`}
                        >
                          <Ban className="w-3.5 h-3.5 opacity-60 shrink-0" />
                          <span>This message was deleted</span>
                          <span className="text-[9px] not-italic opacity-60 ml-2">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                const isMenuOpen = activeMenuMessageId === msg.id;

                return (
                  <div
                    key={msg.id || index}
                    className={`flex items-end space-x-1.5 group/msg relative ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* In group chats, show sender's avatar on left for others */}
                    {isGroup && !isMe && (
                      <img
                        src={sender?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${sender?.username || msg.senderId}`}
                        alt={sender?.displayName || ''}
                        onClick={() => sender?.username && onSelectUser(sender.username)}
                        className="w-7 h-7 rounded-full object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity mb-0.5 border border-zinc-200"
                        title={sender?.displayName}
                      />
                    )}

                    {/* Options button on LEFT for sent messages */}
                    {isMe && (
                      <div className="relative mb-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuMessageId(isMenuOpen ? null : msg.id);
                          }}
                          className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 opacity-0 group-hover/msg:opacity-100 transition-opacity focus:opacity-100 cursor-pointer"
                          title="Message options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Dropdown Menu for Sender */}
                        {isMenuOpen && (
                          <div 
                            onClick={e => e.stopPropagation()}
                            className="absolute left-0 bottom-full mb-1 z-30 w-44 bg-white rounded-xl shadow-xl border border-zinc-200 py-1 text-xs animate-in fade-in zoom-in-95"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuMessageId(null);
                                setConfirmDeleteModal({ message: msg, type: 'me' });
                              }}
                              className="w-full px-3 py-2 text-left text-zinc-700 hover:bg-zinc-100 flex items-center space-x-2 transition-colors cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Delete for me</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuMessageId(null);
                                setConfirmDeleteModal({ message: msg, type: 'everyone' });
                              }}
                              className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center space-x-2 transition-colors cursor-pointer font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                              <span>Delete for everyone</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div 
                      className="flex flex-col max-w-[85%] sm:max-w-[70%]"
                      onTouchStart={() => handleTouchStart(msg)}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                    >
                      {/* Sender Display Name in Group Chat */}
                      {isGroup && !isMe && sender && (
                        <span 
                          onClick={() => sender.username && onSelectUser(sender.username)}
                          className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-800 cursor-pointer mb-0.5 ml-1 truncate"
                        >
                          {sender.displayName}
                        </span>
                      )}

                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs relative ${
                          isMe
                            ? 'bg-zinc-900 text-white rounded-br-xs'
                            : 'bg-white text-zinc-900 border border-zinc-200/80 rounded-bl-xs'
                        }`}
                      >
                        {/* Rich Shared Content Preview (Post / Reel) */}
                        {msg.sharedContent && (
                          <div className="mb-2">
                            <SharedContentBubble
                              sharedContent={msg.sharedContent}
                              isMe={isMe}
                              onSelectReel={onSelectReel}
                              onSelectPost={onSelectPost}
                              onSelectUser={onSelectUser}
                            />
                          </div>
                        )}

                        {/* Voice Note Bubble */}
                        {(msg.mediaType === 'voice' || msg.voiceDuration) && msg.mediaUrl && (
                          <div className="mb-1">
                            <VoiceMessageBubble
                              message={msg}
                              isMe={isMe}
                            />
                          </div>
                        )}

                        {/* Media Attachment (Photo / Video) */}
                        {msg.mediaUrl && msg.mediaType !== 'voice' && (
                          <div className="mb-2 rounded-xl overflow-hidden bg-black/10 max-w-sm">
                            {msg.mediaType === 'video' ? (
                              <video
                                src={msg.mediaUrl}
                                controls
                                playsInline
                                preload="metadata"
                                className="max-h-60 w-full object-contain rounded-xl"
                              />
                            ) : (
                              <img
                                src={msg.mediaUrl}
                                alt="Attachment"
                                className="max-h-60 w-full object-contain rounded-xl cursor-pointer hover:opacity-95"
                                onClick={() => window.open(msg.mediaUrl, '_blank')}
                              />
                            )}
                          </div>
                        )}

                        {/* Text Content */}
                        {msg.text && (
                          <p className="whitespace-pre-wrap leading-relaxed select-text">{msg.text}</p>
                        )}

                        {/* Timestamp and Seen Status */}
                        <div className={`flex items-center justify-end space-x-1.5 mt-1 ${isMe ? 'text-zinc-400' : 'text-zinc-400'}`}>
                          <span className="text-[9px]">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isMe && (
                            <span 
                              className={`flex items-center space-x-0.5 ${msg.isRead ? 'text-sky-400 font-semibold' : 'text-zinc-400'}`}
                              title={msg.isRead ? 'Seen' : 'Delivered'}
                            >
                              {msg.isRead ? (
                                <>
                                  <CheckCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                                  <span className="text-[8px] tracking-tight">Seen</span>
                                </>
                              ) : (
                                <Check className="w-3.5 h-3.5 stroke-[2]" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Options button on RIGHT for received messages */}
                    {!isMe && (
                      <div className="relative mb-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuMessageId(isMenuOpen ? null : msg.id);
                          }}
                          className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 opacity-0 group-hover/msg:opacity-100 transition-opacity focus:opacity-100 cursor-pointer"
                          title="Message options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Dropdown Menu for Recipient (Delete for me, and Delete for everyone if group admin) */}
                        {isMenuOpen && (
                          <div 
                            onClick={e => e.stopPropagation()}
                            className="absolute right-0 bottom-full mb-1 z-30 w-44 bg-white rounded-xl shadow-xl border border-zinc-200 py-1 text-xs animate-in fade-in zoom-in-95"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuMessageId(null);
                                setConfirmDeleteModal({ message: msg, type: 'me' });
                              }}
                              className="w-full px-3 py-2 text-left text-zinc-700 hover:bg-zinc-100 flex items-center space-x-2 transition-colors cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Delete for me</span>
                            </button>
                            {isGroupAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuMessageId(null);
                                  setConfirmDeleteModal({ message: msg, type: 'everyone' });
                                }}
                                className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center space-x-2 transition-colors cursor-pointer font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>Delete for everyone (Admin)</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Bottom Seen Indicator */}
              {lastMessage && lastMessage.senderId === user?.id && lastMessage.isRead && (
                <div className="flex justify-end items-center space-x-1 pr-1 text-[10px] text-zinc-400 font-medium">
                  <CheckCheck className="w-3 h-3 text-sky-500 stroke-[2.5]" />
                  <span>
                    Seen {lastMessage.seenAt ? new Date(lastMessage.seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Attached Media Preview Bar */}
            {attachedMediaUrl && (
              <div className="px-4 py-2 bg-white border-t border-zinc-200 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  {attachedMediaType === 'video' ? (
                    <video src={attachedMediaUrl} className="w-10 h-10 object-cover rounded-lg" />
                  ) : (
                    <img src={attachedMediaUrl} alt="Attached" className="w-10 h-10 object-cover rounded-lg border" />
                  )}
                  <div className="text-xs">
                    <p className="font-semibold text-zinc-800">Attached media</p>
                    <p className="text-[10px] text-zinc-400">Ready to send</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedMediaUrl(null)}
                  className="p-1 hover:bg-zinc-100 rounded-full text-zinc-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Chat Input Bar or Voice Recorder */}
            <div className="p-3 bg-white border-t border-zinc-200 shrink-0">
              {isRecordingVoice ? (
                <VoiceRecorder
                  onSendVoice={handleSendVoice}
                  onCancel={() => setIsRecordingVoice(false)}
                />
              ) : (
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center space-x-1.5"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleDeviceFileSelect}
                    className="hidden"
                  />

                  {/* Attach Media */}
                  <button
                    type="button"
                    disabled={isUploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 text-zinc-600 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Attach Photo / Video"
                  >
                    {isUploadingMedia ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </button>

                  {/* Voice Note Button */}
                  <button
                    type="button"
                    onClick={() => setIsRecordingVoice(true)}
                    className="p-2.5 text-zinc-600 hover:text-black hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Record Voice Note"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  {/* Text Input */}
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder={isGroup ? `Message ${selectedConv.name || 'group'}...` : `Message @${otherUser?.username || 'user'}...`}
                    className="flex-1 px-4 py-2.5 bg-zinc-100 border border-transparent rounded-2xl text-xs focus:bg-white focus:border-zinc-300 focus:outline-none transition-all placeholder:text-zinc-400"
                  />

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !attachedMediaUrl) || isUploadingMedia || isSending}
                    className="p-2.5 bg-zinc-900 hover:bg-black text-white rounded-2xl disabled:opacity-30 transition-all cursor-pointer shrink-0 active:scale-95"
                    title="Send"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          /* Empty State when no conversation is selected */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 text-zinc-400">
            <div className="w-16 h-16 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-800 shadow-xs">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div className="max-w-sm space-y-1">
              <h3 className="text-base font-bold text-zinc-900">Your Direct & Group Messages</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Connect with friends privately, start multi-member groups with custom photos, share reels & posts, and send voice notes.
              </p>
            </div>
            <div className="flex items-center space-x-2.5 pt-2">
              <button
                onClick={() => setIsNewDirectChatOpen(true)}
                className="px-4 py-2 bg-black text-white rounded-xl text-xs font-semibold hover:bg-zinc-800 transition-colors shadow-xs"
              >
                Send Message
              </button>
              <button
                onClick={() => setIsCreateGroupOpen(true)}
                className="px-4 py-2 bg-zinc-100 text-zinc-800 rounded-xl text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center space-x-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Create Group</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal 1: Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={handleGroupCreated}
        currentUser={user}
      />

      {/* Modal 2: Group Info & Management Modal */}
      {selectedConv && selectedConv.isGroup && (
        <GroupInfoModal
          isOpen={isGroupInfoOpen}
          onClose={() => setIsGroupInfoOpen(false)}
          conversation={selectedConv}
          onConversationUpdated={handleGroupUpdated}
          onLeaveGroup={handleGroupLeft}
          onDeleteGroup={handleGroupDeleted}
          currentUser={user}
          onSelectUser={onSelectUser}
          onSelectReel={onSelectReel}
          onSelectPost={onSelectPost}
        />
      )}

      {/* Modal 3: Start New Direct Chat Modal */}
      {isNewDirectChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-zinc-100 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">New Message</h3>
              <button
                onClick={() => setIsNewDirectChatOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user by name or @username..."
                  value={userSearchQuery}
                  onChange={e => setUserSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 divide-y divide-zinc-50">
              {loadingUsers ? (
                <div className="py-8 text-center text-xs text-zinc-400 flex items-center justify-center space-x-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading contacts...</span>
                </div>
              ) : filteredUsersForDirect.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-400">No users found.</p>
              ) : (
                filteredUsersForDirect.map(u => (
                  <div
                    key={u.id}
                    onClick={() => handleStartDirectChat(u.id)}
                    className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-zinc-50 cursor-pointer transition-colors"
                  >
                    <img
                      src={u.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${u.username}`}
                      alt={u.displayName}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-200"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-900 truncate">{u.displayName}</p>
                      <p className="text-[10px] text-zinc-400 truncate">@{u.username}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message Deletion Confirmation Modal */}
      {confirmDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-zinc-200 text-center space-y-4">
            <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
              confirmDeleteModal.type === 'everyone' ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-700'
            }`}>
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-zinc-900">Delete message?</h3>
              <p className="text-xs text-zinc-500">
                {confirmDeleteModal.type === 'everyone'
                  ? 'This message will be deleted for everyone in this chat.'
                  : 'This message will only be removed from your chat.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingMessage}
                onClick={() => setConfirmDeleteModal(null)}
                className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingMessage}
                onClick={() => handleDeleteMessage(confirmDeleteModal.message, confirmDeleteModal.type)}
                className={`w-full sm:w-1/2 py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center space-x-1.5 ${
                  confirmDeleteModal.type === 'everyone'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-zinc-900 hover:bg-black'
                }`}
              >
                {isDeletingMessage && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                <span>
                  {confirmDeleteModal.type === 'everyone' ? 'Delete for everyone' : 'Delete for me'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop to close message menu */}
      {activeMenuMessageId && (
        <div 
          className="fixed inset-0 z-20 bg-transparent"
          onClick={() => setActiveMenuMessageId(null)}
        />
      )}
    </div>
  );
};
