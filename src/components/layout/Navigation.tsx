import React from 'react';
import { 
  Home, 
  Search, 
  Film, 
  Music2,
  MessageSquare, 
  MessageCircle,
  Heart, 
  PlusSquare, 
  ShieldAlert, 
  LogOut,
  Compass,
  Users,
  Settings,
  Lock,
  Send,
  Clapperboard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resolveAvatarUrl } from '../../lib/avatar';

export type ActiveTab = 'feed' | 'reels' | 'music' | 'search' | 'messages' | 'notifications' | 'profile' | 'admin';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenCreate: () => void;
  onOpenSettings?: () => void;
  unreadNotificationsCount?: number;
  unreadMessagesCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  onOpenCreate,
  onOpenSettings,
  unreadNotificationsCount = 0,
  unreadMessagesCount = 0
}) => {
  const { user, logout, savedAccounts, setIsAccountSwitcherOpen } = useAuth();
  const isOwnerAdmin = Boolean(
    user && (
      user.role === 'OWNER_ADMIN' || 
      user.username?.toLowerCase() === 'shuv' || 
      user.id === 'user-shuv'
    )
  );

  const visibleSavedAccounts = React.useMemo(() => {
    return savedAccounts.filter(a => {
      const isAdmin = a.role === 'OWNER_ADMIN' || a.id === 'user-shuv' || a.username?.toLowerCase() === 'shuv';
      if (isAdmin && user?.role !== 'OWNER_ADMIN') return false;
      return true;
    });
  }, [savedAccounts, user?.role]);

  const navItems = [
    { id: 'feed' as ActiveTab, label: 'Feed', icon: Home },
    { id: 'search' as ActiveTab, label: 'Search', icon: Search },
    { id: 'reels' as ActiveTab, label: 'Reels', icon: Film },
    { id: 'music' as ActiveTab, label: 'Music', icon: Music2 },
    { 
      id: 'messages' as ActiveTab, 
      label: 'Messages', 
      icon: MessageSquare, 
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined 
    },
    { 
      id: 'notifications' as ActiveTab, 
      label: 'Notifications', 
      icon: Heart, 
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined 
    },
  ];

  return (
    <>
      {/* ================= DESKTOP LEFT SIDEBAR ================= */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-[#EEEEEE] z-40 p-4 justify-between">
        <div className="space-y-6">
          {/* Brand Logo */}
          <div 
            onClick={() => onTabChange('feed')}
            className="flex items-center space-x-2.5 px-3 py-2 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-[#1A1A1A] text-white flex items-center justify-center font-black text-xl shadow-xs group-hover:scale-105 transition-transform">
              I
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-[#1A1A1A] font-['Outfit']">
                ISHARA
              </span>
              <span className="block text-[10px] uppercase tracking-widest font-semibold text-[#8E8E8E] -mt-1">
                Social
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive 
                      ? 'bg-[#1A1A1A] text-white shadow-xs' 
                      : 'text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      isActive ? 'bg-white text-[#1A1A1A]' : 'bg-[#FF3B30] text-white'
                    }`}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Create Post Button */}
            <button
              id="nav-create-btn"
              onClick={onOpenCreate}
              className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-all"
            >
              <PlusSquare className="w-5 h-5 stroke-[1.75]" />
              <span>Create</span>
            </button>

            {/* Profile Tab */}
            <button
              id="nav-item-profile"
              onClick={() => onTabChange('profile')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'profile'
                  ? 'bg-[#1A1A1A] text-white shadow-xs'
                  : 'text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
              }`}
            >
              <img
                src={resolveAvatarUrl(user)}
                alt="Profile"
                className="w-5 h-5 rounded-full object-cover border border-white/40"
              />
              <span>Profile</span>
            </button>

            {/* Admin Console (Owner Admin Only) */}
            {isOwnerAdmin && (
              <button
                id="nav-item-admin"
                onClick={() => onTabChange('admin')}
                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-[#FF3B30] hover:bg-red-50'
                }`}
              >
                <ShieldAlert className="w-5 h-5 stroke-[1.75]" />
                <span>Admin Console</span>
              </button>
            )}
          </nav>
        </div>

        {/* User Card & Logout */}
        {user && (
          <div className="pt-3 border-t border-[#EEEEEE] space-y-2">
            <div 
              onClick={() => onTabChange('profile')}
              className="flex items-center justify-between p-2 rounded-xl hover:bg-[#F5F5F5] cursor-pointer transition-colors"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <img
                  src={resolveAvatarUrl(user)}
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full object-cover border border-[#EEEEEE]"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#1A1A1A] truncate">{user.displayName}</p>
                  <p className="text-[11px] text-[#8E8E8E] truncate">@{user.username}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 pt-1">
              <button
                id="settings-sidebar-btn"
                type="button"
                onClick={onOpenSettings}
                className="flex items-center justify-center space-x-1 py-1.5 px-1 bg-[#FAFAFA] hover:bg-zinc-100 border border-[#EEEEEE] text-[#1A1A1A] text-[11px] font-semibold rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-3 h-3 text-zinc-600" />
                <span>Settings</span>
              </button>
              <button
                id="switch-account-sidebar-btn"
                type="button"
                onClick={() => setIsAccountSwitcherOpen(true)}
                className="flex items-center justify-center space-x-1 py-1.5 px-1 bg-[#FAFAFA] hover:bg-zinc-100 border border-[#EEEEEE] text-[#1A1A1A] text-[11px] font-semibold rounded-lg transition-colors"
                title="Switch Account"
              >
                <Users className="w-3 h-3 text-zinc-600" />
                <span>Switch</span>
              </button>
              <button
                id="logout-sidebar-btn"
                type="button"
                onClick={logout}
                className="flex items-center justify-center space-x-1 py-1.5 px-1 bg-[#FAFAFA] hover:bg-[#FEE2E2] border border-[#EEEEEE] text-[#666666] hover:text-[#DC2626] text-[11px] font-medium rounded-lg transition-colors"
              >
                <LogOut className="w-3 h-3" />
                <span>Exit</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* ================= MOBILE TOP HEADER ================= */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-100 z-40 px-4 flex items-center justify-between">
        <div 
          onClick={() => onTabChange('feed')}
          className="flex items-center space-x-2.5 cursor-pointer select-none"
        >
          <div className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center font-black text-sm tracking-tighter">
            I
          </div>
          <span className="font-black text-xl tracking-tight text-black font-['Outfit']">
            ISHARA
          </span>
        </div>

        <div className="flex items-center space-x-4">
          {/* Admin Console shortcut for Owner Admin on mobile */}
          {isOwnerAdmin && (
            <button
              id="mobile-header-admin-button"
              onClick={() => onTabChange('admin')}
              className={`p-1.5 rounded-xl transition-colors relative cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-[#FF3B30] hover:bg-red-50'
              }`}
              title="Admin Console"
              aria-label="Admin Console"
            >
              <ShieldAlert className="w-5 h-5 stroke-[2]" />
            </button>
          )}

          {/* Notifications Heart */}
          <button
            id="mobile-notifications-header-button"
            onClick={() => onTabChange('notifications')}
            className="text-black hover:opacity-75 transition-opacity relative cursor-pointer"
            title="Notifications"
            aria-label="Notifications"
          >
            <Heart className={`w-6 h-6 ${activeTab === 'notifications' ? 'fill-black stroke-black' : 'stroke-[1.8]'}`} />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 bg-[#E0245E] text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Direct / Share Paper Plane */}
          <button
            id="mobile-share-header-button"
            onClick={() => onTabChange('messages')}
            className="text-black hover:opacity-75 transition-opacity relative cursor-pointer"
            title="Direct"
            aria-label="Direct"
          >
            <Send className="w-6 h-6 stroke-[1.8] -rotate-12" />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-[#E0245E] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ================= MOBILE BOTTOM NAVIGATION BAR ================= */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[54px] bg-white border-t border-gray-200 z-40 px-3 flex items-center justify-between">
        {/* 1. Home */}
        <button
          id="mobile-nav-feed"
          onClick={() => onTabChange('feed')}
          className="flex flex-col items-center justify-center flex-1 py-1 text-center transition-opacity active:opacity-60 cursor-pointer"
        >
          <Home className={`w-6 h-6 ${activeTab === 'feed' ? 'fill-black stroke-black' : 'stroke-[1.8] text-black'}`} />
          <span className={`text-[10px] mt-0.5 leading-none ${activeTab === 'feed' ? 'font-bold text-black' : 'font-medium text-black'}`}>
            Home
          </span>
        </button>

        {/* 2. Search */}
        <button
          id="mobile-nav-search"
          onClick={() => onTabChange('search')}
          className="flex flex-col items-center justify-center flex-1 py-1 text-center transition-opacity active:opacity-60 cursor-pointer"
        >
          <Search className={`w-6 h-6 ${activeTab === 'search' ? 'stroke-[2.5] text-black' : 'stroke-[1.8] text-black'}`} />
          <span className={`text-[10px] mt-0.5 leading-none ${activeTab === 'search' ? 'font-bold text-black' : 'font-medium text-black'}`}>
            Search
          </span>
        </button>

        {/* 3. Create */}
        <button
          id="mobile-nav-create"
          onClick={onOpenCreate}
          className="flex flex-col items-center justify-center flex-1 py-1 text-center transition-opacity active:opacity-60 cursor-pointer"
        >
          <PlusSquare className="w-6 h-6 stroke-[1.8] text-black" />
          <span className="text-[10px] mt-0.5 leading-none font-medium text-black">
            Create
          </span>
        </button>

        {/* 4. Reels */}
        <button
          id="mobile-nav-reels"
          onClick={() => onTabChange('reels')}
          className="flex flex-col items-center justify-center flex-1 py-1 text-center transition-opacity active:opacity-60 cursor-pointer"
        >
          <Clapperboard className={`w-6 h-6 ${activeTab === 'reels' ? 'fill-black text-black stroke-[1.8]' : 'stroke-[1.8] text-black'}`} />
          <span className={`text-[10px] mt-0.5 leading-none ${activeTab === 'reels' ? 'font-bold text-black' : 'font-medium text-black'}`}>
            Reels
          </span>
        </button>

        {/* 5. Profile */}
        <button
          id="mobile-nav-profile"
          onClick={() => onTabChange('profile')}
          className="flex flex-col items-center justify-center flex-1 py-1 text-center transition-opacity active:opacity-60 cursor-pointer"
        >
          <img
            src={resolveAvatarUrl(user)}
            alt="Profile"
            className={`w-6 h-6 rounded-full object-cover ${
              activeTab === 'profile' ? 'ring-2 ring-black ring-offset-1' : ''
            }`}
          />
          <span className={`text-[10px] mt-0.5 leading-none ${activeTab === 'profile' ? 'font-bold text-black' : 'font-medium text-black'}`}>
            Profile
          </span>
        </button>
      </nav>
    </>
  );
};
