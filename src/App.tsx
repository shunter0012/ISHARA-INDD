import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RealtimeProvider, useRealtime } from './context/RealtimeContext';
import { FollowProvider, useFollow } from './context/FollowContext';
import { PresenceProvider } from './context/PresenceContext';
import { CallProvider } from './context/CallContext';
import { AudioPlayerProvider, useAudioPlayer } from './context/AudioPlayerContext';
import { VideoPlaybackProvider } from './context/VideoPlaybackContext';

import { Navigation, ActiveTab } from './components/layout/Navigation';
import { RightSidebar } from './components/layout/RightSidebar';
import { FeedView } from './components/feed/FeedView';
import { ReelsView } from './components/reels/ReelsView';
import { MusicView } from './components/music/MusicView';
import { SearchView } from './components/search/SearchView';
import { MessagesView } from './components/messages/MessagesView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { ProfileView } from './components/profile/ProfileView';
import { AdminConsole } from './components/admin/AdminConsole';

import { MiniPlayer } from './components/music/MiniPlayer';
import { FullPlayerModal } from './components/music/FullPlayerModal';
import { ActiveCallOverlay } from './components/calls/ActiveCallOverlay';
import { CreateModal } from './components/create/CreateModal';
import { AccountSwitcherModal } from './components/profile/AccountSwitcherModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { AudioDetailModal } from './components/music/AudioDetailModal';
import { AuthPage } from './components/auth/AuthPage';
import { MusicTrack, UserPreview } from './types/index';
import { apiRequest } from './lib/api';

const AppContent: React.FC = () => {
  const { user, loading, isAccountSwitcherOpen, setIsAccountSwitcherOpen, isAddAccountModalOpen, setIsAddAccountModalOpen } = useAuth();
  const { detailTrack, setDetailTrack } = useAudioPlayer();
  const { subscribe } = useRealtime();

  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [previousTab, setPreviousTab] = useState<ActiveTab>('feed');
  const [selectedReelId, setSelectedReelId] = useState<string | undefined>(undefined);
  const [viewingProfileUsername, setViewingProfileUsername] = useState<string | undefined>(undefined);
  const [directChatUser, setDirectChatUser] = useState<UserPreview | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialType, setCreateInitialType] = useState<'post' | 'carousel' | 'reel' | 'story'>('post');
  const [selectedAudioForCreate, setSelectedAudioForCreate] = useState<MusicTrack | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleOpenCreate = (
    targetType: 'post' | 'carousel' | 'reel' | 'story' = 'post',
    audioTrack?: MusicTrack | null
  ) => {
    setCreateInitialType(targetType);
    setSelectedAudioForCreate(audioTrack || null);
    setIsCreateOpen(true);
  };
  const [feedRefreshCounter, setFeedRefreshCounter] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const handleSelectReel = (reelId: string) => {
    setPreviousTab(activeTab);
    setSelectedReelId(reelId);
    setActiveTab('reels');
  };

  // Security & Data Isolation: Ensure switched user cannot view admin panel if unauthorized
  useEffect(() => {
    const isShuvAdmin = Boolean(
      user && (
        user.role === 'OWNER_ADMIN' || 
        user.username?.toLowerCase() === 'shuv' || 
        user.id === 'user-shuv'
      )
    );
    if (activeTab === 'admin' && !isShuvAdmin) {
      setActiveTab('feed');
    }
  }, [user?.id, user?.role, user?.username, activeTab]);

  // Real-time notifications and message badge updates
  useEffect(() => {
    if (!user) return;
    const fetchBadgeCount = async () => {
      try {
        const notifRes = await apiRequest<{ notifications: any[] }>('/notifications');
        const unread = notifRes.notifications.filter(n => !n.isRead).length;
        setUnreadNotificationsCount(unread);

        const convRes = await apiRequest<{ conversations: any[] }>('/conversations');
        const unreadMsgs = (convRes.conversations || []).reduce((acc: number, c: any) => acc + (c.unreadCount || 0), 0);
        setUnreadMessagesCount(unreadMsgs);
      } catch {
        // Ignore
      }
    };

    fetchBadgeCount();

    // Listen to real-time events
    const unsubNotif = subscribe('NEW_NOTIFICATION', (evt) => {
      if (evt.recipientId === user.id) {
        setUnreadNotificationsCount(prev => prev + 1);
      }
    });

    const unsubMsg = subscribe('NEW_MESSAGE', () => {
      if (activeTab !== 'messages') {
        setUnreadMessagesCount(prev => prev + 1);
      }
    });

    return () => {
      unsubNotif();
      unsubMsg();
    };
  }, [user?.id, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFBFB] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] text-white flex items-center justify-center font-black text-2xl shadow-md animate-pulse">
            I
          </div>
          <p className="text-xs text-gray-400 font-medium">Loading ISHARA...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleSelectUser = (username: string) => {
    setViewingProfileUsername(username);
    setActiveTab('profile');
  };

  const handleOpenDirectChat = (targetUser: UserPreview) => {
    setDirectChatUser(targetUser);
    setActiveTab('messages');
  };

  const handleSelectTrack = (track: MusicTrack) => {
    setDetailTrack(track);
  };

  return (
    <div className="min-h-screen bg-[#FBFBFB] text-[#1A1A1A] font-sans antialiased flex flex-col md:flex-row justify-center">
      {/* Navigation (Left desktop sidebar & Mobile headers/bottom bar) */}
      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'profile') {
            setViewingProfileUsername(user?.username);
          }
          if (tab === 'notifications') {
            setUnreadNotificationsCount(0);
            apiRequest('/notifications/read-all', { method: 'POST' }).catch(() => {});
          }
          if (tab === 'messages') {
            setUnreadMessagesCount(0);
          }
          setActiveTab(tab);
        }}
        onOpenCreate={() => handleOpenCreate('post')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        unreadNotificationsCount={unreadNotificationsCount}
        unreadMessagesCount={unreadMessagesCount}
      />

      {/* Center Main Stage Area */}
      <main className={`flex-1 w-full md:pl-72 md:pr-4 px-0 sm:px-4 ${
        activeTab === 'messages'
          ? 'max-w-5xl h-[100dvh] max-h-[100dvh] pt-14 md:pt-4 pb-16 md:pb-4 flex flex-col overflow-hidden'
          : 'max-w-4xl pt-14 md:pt-6 pb-16 md:pb-6 min-h-screen'
      }`}>
        {activeTab === 'feed' && (
          <FeedView
            key={`feed-${user?.id || 'guest'}-${feedRefreshCounter}`}
            refreshTrigger={feedRefreshCounter}
            onSelectUser={handleSelectUser}
            onSelectTrack={handleSelectTrack}
            onOpenCreate={handleOpenCreate}
          />
        )}

        {activeTab === 'reels' && (
          <ReelsView
            key={`reels-${selectedReelId || 'all'}-${feedRefreshCounter}`}
            initialReelId={selectedReelId}
            refreshTrigger={feedRefreshCounter}
            onSelectUser={handleSelectUser}
            onSelectTrack={handleSelectTrack}
            onBack={() => {
              const target = (previousTab && previousTab !== 'reels') ? previousTab : 'feed';
              setActiveTab(target);
              setSelectedReelId(undefined);
            }}
          />
        )}

        {activeTab === 'music' && (
          <MusicView
            onSelectUser={handleSelectUser}
            onSelectReel={handleSelectReel}
            onUseAudio={(track) => handleOpenCreate('reel', track)}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            refreshTrigger={feedRefreshCounter}
            onSelectUser={handleSelectUser}
            onSelectTrack={handleSelectTrack}
            onSelectReel={handleSelectReel}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesView
            onSelectUser={handleSelectUser}
            directUser={directChatUser}
            onBack={() => {
              setActiveTab(previousTab || 'feed');
              setDirectChatUser(null);
            }}
            onSelectReel={handleSelectReel}
            onSelectPost={() => {
              setActiveTab('feed');
            }}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsView
            onSelectUser={handleSelectUser}
            onOpenAdmin={() => setActiveTab('admin')}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            key={`profile-${user?.id || 'guest'}-${viewingProfileUsername || 'me'}`}
            username={viewingProfileUsername}
            refreshTrigger={feedRefreshCounter}
            onSelectUser={handleSelectUser}
            onOpenDirectChat={handleOpenDirectChat}
            onSelectReel={handleSelectReel}
            onOpenAdmin={() => setActiveTab('admin')}
          />
        )}

        {activeTab === 'admin' && Boolean(user && (user.role === 'OWNER_ADMIN' || user.username?.toLowerCase() === 'shuv' || user.id === 'user-shuv')) && (
          <AdminConsole onClose={() => setActiveTab('profile')} />
        )}
      </main>

      {/* Right Sidebar on Desktop for Feed & Search */}
      {(activeTab === 'feed' || activeTab === 'search' || activeTab === 'music') && (
        <RightSidebar
          onSelectUser={handleSelectUser}
          onSelectTrack={handleSelectTrack}
        />
      )}

      {/* Global Modals & Persistent Players */}
      <MiniPlayer />
      <FullPlayerModal />
      <ActiveCallOverlay />

      <CreateModal
        isOpen={isCreateOpen}
        initialType={createInitialType}
        initialAudioTrack={selectedAudioForCreate}
        onClose={() => {
          setIsCreateOpen(false);
          setSelectedAudioForCreate(null);
        }}
        onCreated={(createdType) => {
          setSelectedAudioForCreate(null);
          setFeedRefreshCounter(prev => prev + 1);
          if (createdType === 'reel') {
            setActiveTab('reels');
          } else {
            setActiveTab('feed');
          }
        }}
      />

      {detailTrack && (
        <AudioDetailModal
          track={detailTrack}
          onClose={() => setDetailTrack(null)}
          onSelectUser={handleSelectUser}
          onSelectReel={handleSelectReel}
          onUseAudio={(track) => handleOpenCreate('reel', track)}
        />
      )}

      <AccountSwitcherModal
        isOpen={isAccountSwitcherOpen}
        onClose={() => setIsAccountSwitcherOpen(false)}
        onAccountSwitched={() => {
          setViewingProfileUsername(undefined);
          const isShuvAdmin = Boolean(
            user && (
              user.role === 'OWNER_ADMIN' || 
              user.username?.toLowerCase() === 'shuv' || 
              user.id === 'user-shuv'
            )
          );
          if (activeTab === 'admin' && !isShuvAdmin) {
            setActiveTab('feed');
          }
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenAdmin={() => setActiveTab('admin')}
      />

      {isAddAccountModalOpen && (
        <AuthPage onClose={() => setIsAddAccountModalOpen(false)} />
      )}
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <FollowProvider>
          <PresenceProvider>
            <CallProvider>
              <AudioPlayerProvider>
                <VideoPlaybackProvider>
                  <AppContent />
                </VideoPlaybackProvider>
              </AudioPlayerProvider>
            </CallProvider>
          </PresenceProvider>
        </FollowProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}

export default App;
