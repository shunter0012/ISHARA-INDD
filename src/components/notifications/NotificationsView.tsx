import React, { useState, useEffect } from 'react';
import { Notification, User } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useFollow } from '../../context/FollowContext';
import { 
  Heart, 
  MessageCircle, 
  UserPlus, 
  Phone, 
  Check, 
  X, 
  CheckCheck, 
  Clock, 
  ShieldCheck,
  Sparkles,
  Trash2,
  Flag,
  AlertTriangle
} from 'lucide-react';

interface NotificationsViewProps {
  onSelectUser: (username: string) => void;
  onSelectPost?: (postId: string) => void;
  onOpenAdmin?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onSelectUser,
  onSelectPost,
  onOpenAdmin
}) => {
  const { user } = useAuth();
  const { acceptFollowRequest, declineFollowRequest } = useFollow();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingRequests, setPendingRequests] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'requests'>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    try {
      const notifRes = await apiRequest<{ notifications: Notification[] }>('/notifications');
      const followersRes = await apiRequest<{ users: User[] }>(`/follow/followers/${user?.id}`);

      // Fetch pending requests through users list or API
      const searchRes = await apiRequest<{ users: any[] }>('/search');
      const dataReqs = searchRes.users.filter(u => u.relationshipState === 'Requested' && u.id !== user?.id);

      setNotifications(notifRes.notifications || []);
      // Match pending follow request notifications
      const pendingUserIds = notifRes.notifications
        .filter(n => n.type === 'FOLLOW_REQUEST')
        .map(n => n.actor.id);

      const allUsersRes = await apiRequest<{ users: User[] }>('/users/all');
      setPendingRequests(allUsersRes.users.filter(u => pendingUserIds.includes(u.id)));
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-mark notifications as read when viewing notifications
    apiRequest('/notifications/read-all', { method: 'POST' }).catch(() => {});
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [user]);

  const handleAccept = async (actorId: string) => {
    setActionLoadingMap(prev => ({ ...prev, [actorId]: true }));
    try {
      await acceptFollowRequest(actorId);
      setPendingRequests(prev => prev.filter(u => u.id !== actorId));
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to accept request');
    } finally {
      setActionLoadingMap(prev => ({ ...prev, [actorId]: false }));
    }
  };

  const handleDecline = async (actorId: string) => {
    setActionLoadingMap(prev => ({ ...prev, [actorId]: true }));
    try {
      await declineFollowRequest(actorId);
      setPendingRequests(prev => prev.filter(u => u.id !== actorId));
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to decline request');
    } finally {
      setActionLoadingMap(prev => ({ ...prev, [actorId]: false }));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // Ignore
    }
  };

  const handleDeleteNotification = async (notifId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      await apiRequest(`/notifications/${notifId}`, { method: 'DELETE' });
    } catch {
      // Ignore
    }
  };

  const handleClearAll = async () => {
    try {
      setNotifications([]);
      await apiRequest('/notifications', { method: 'DELETE' });
    } catch {
      // Ignore
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'LIKE':
      case 'STORY_LIKE':
        return <Heart className="w-4 h-4 text-red-500 fill-red-50" />;
      case 'COMMENT':
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case 'FOLLOW':
      case 'REQUEST_ACCEPTED':
        return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      case 'FOLLOW_REQUEST':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'CALL':
      case 'MISSED_CALL':
        return <Phone className="w-4 h-4 text-purple-500" />;
      case 'REPORT':
        return <Flag className="w-4 h-4 text-amber-500" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      default:
        return <Sparkles className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto pb-20 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs">
        <h2 className="text-base font-bold text-[#1A1A1A]">Activity & Notifications</h2>
        <div className="flex items-center space-x-3">
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={handleMarkAllRead}
            className="text-xs font-semibold text-[#8E8E8E] hover:text-[#1A1A1A] transition-colors"
          >
            Mark all as read
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 bg-white border border-[#EEEEEE] p-1.5 rounded-2xl shadow-xs">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'all'
              ? 'bg-[#1A1A1A] text-white shadow-xs'
              : 'text-[#666666] hover:bg-gray-50'
          }`}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors relative ${
            activeTab === 'requests'
              ? 'bg-[#1A1A1A] text-white shadow-xs'
              : 'text-[#666666] hover:bg-gray-50'
          }`}
        >
          <span>Follow Requests</span>
          {pendingRequests.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 bg-[#FF3B30] text-white text-[10px] font-bold rounded-full">
              {pendingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Follow Requests Special Banner if pending */}
      {activeTab === 'all' && pendingRequests.length > 0 && (
        <div 
          onClick={() => setActiveTab('requests')}
          className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-colors shadow-xs"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {pendingRequests.length}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-900">
                {pendingRequests.length} Pending Follow {pendingRequests.length === 1 ? 'Request' : 'Requests'}
              </p>
              <p className="text-[11px] text-amber-700 truncate">
                Approve requests to let them see your posts and send direct messages.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-900 shrink-0 ml-2">Review →</span>
        </div>
      )}

      {/* Requests Tab List */}
      {activeTab === 'requests' && (
        <div className="space-y-2">
          {pendingRequests.length === 0 ? (
            <div className="bg-white border border-[#EEEEEE] p-8 rounded-2xl text-center text-xs text-[#8E8E8E] shadow-xs">
              No pending follow requests right now.
            </div>
          ) : (
            pendingRequests.map(requester => {
              const isBusy = actionLoadingMap[requester.id];
              return (
                <div
                  key={requester.id}
                  className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs flex items-center justify-between space-x-3"
                >
                  <div
                    onClick={() => onSelectUser(requester.username)}
                    className="flex items-center space-x-3 min-w-0 cursor-pointer group flex-1"
                  >
                    <img
                      src={requester.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${requester.username}`}
                      alt={requester.displayName}
                      className="w-11 h-11 rounded-full object-cover border border-[#EEEEEE]"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1A1A1A] group-hover:underline truncate">
                        {requester.displayName}
                      </p>
                      <p className="text-[11px] text-[#8E8E8E] truncate">@{requester.username}</p>
                      <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Requested to follow you</p>
                    </div>
                  </div>

                  {/* Confirm & Decline Buttons */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      id={`accept-request-${requester.id}`}
                      disabled={isBusy}
                      onClick={() => handleAccept(requester.id)}
                      className="px-3.5 py-1.5 bg-[#1A1A1A] hover:bg-black text-white text-xs font-bold rounded-xl flex items-center space-x-1 shadow-xs active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm</span>
                    </button>
                    <button
                      id={`decline-request-${requester.id}`}
                      disabled={isBusy}
                      onClick={() => handleDecline(requester.id)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 text-xs font-semibold rounded-xl flex items-center space-x-1 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* All Notifications List */}
      {activeTab === 'all' && (
        <div className="space-y-2">
          {notifications.length === 0 ? (
            <div className="bg-white border border-[#EEEEEE] p-8 rounded-2xl text-center text-xs text-[#8E8E8E] shadow-xs">
              You're all caught up! No new notifications.
            </div>
          ) : (
            notifications.map(notif => {
              const isReportNotif = notif.type === 'REPORT';
              const isWarningNotif = notif.type === 'WARNING';

              return (
                <div
                  key={notif.id}
                  className={`p-3.5 rounded-2xl flex items-center justify-between shadow-xs transition-colors ${
                    isWarningNotif
                      ? 'bg-rose-50/60 border border-rose-200 border-l-4 border-l-rose-600'
                      : isReportNotif
                      ? 'bg-amber-50/50 border border-amber-200 border-l-4 border-l-amber-500'
                      : !notif.isRead
                      ? 'bg-white border border-[#EEEEEE] border-l-4 border-l-[#1A1A1A]'
                      : 'bg-white border border-[#EEEEEE]'
                  }`}
                >
                  <div
                    onClick={() => {
                      if (isReportNotif && onOpenAdmin) {
                        onOpenAdmin();
                      } else {
                        onSelectUser(notif.actor.username);
                      }
                    }}
                    className="flex items-center space-x-3 cursor-pointer min-w-0 flex-1 mr-3"
                  >
                    <div className="relative shrink-0">
                      <img
                        src={notif.actor.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${notif.actor.username}`}
                        alt={notif.actor.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-[#EEEEEE]"
                      />
                      <div className="absolute -bottom-1 -right-1 p-0.5 bg-white rounded-full shadow-xs">
                        {getIcon(notif.type)}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs text-[#1A1A1A]">
                        <span className="font-bold">{notif.actor.displayName}</span>{' '}
                        <span className={isWarningNotif ? 'text-rose-700 font-semibold' : 'text-[#666666]'}>
                          {notif.previewText}
                        </span>
                      </p>
                      <span className="text-[10px] text-[#8E8E8E]">
                        {new Date(notif.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {/* Admin quick jump for report notification */}
                    {isReportNotif && onOpenAdmin && (
                      <button
                        onClick={onOpenAdmin}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                      >
                        Review
                      </button>
                    )}

                    {/* Follow Request inline action if applicable */}
                    {notif.type === 'FOLLOW_REQUEST' && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleAccept(notif.actor.id)}
                          className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-black text-white text-[11px] font-bold rounded-lg"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleDecline(notif.actor.id)}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold rounded-lg"
                        >
                          Decline
                        </button>
                      </div>
                    )}

                    <button
                      id={`delete-notif-${notif.id}`}
                      onClick={(e) => handleDeleteNotification(notif.id, e)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete notification"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
