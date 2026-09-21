import React, { useState, useEffect, useRef } from 'react';
import { User, UserProfile, Post, Reel, UserPreview } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { useFollow } from '../../context/FollowContext';
import { useCall } from '../../context/CallContext';
import { usePresence } from '../../context/PresenceContext';
import { FollowButton } from '../common/FollowButton';
import { EditProfileModal } from './EditProfileModal';
import { SettingsModal } from '../settings/SettingsModal';
import { PostCard } from '../feed/PostCard';
import { MediaGrid, MediaGridItem } from '../common/MediaGrid';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { apiRequest } from '../../lib/api';
import { uploadMediaFile } from '../../lib/upload';
import { resolveAvatarUrl, compressProfileImage, saveLocalAvatarCache } from '../../lib/avatar';
import { 
  Grid, 
  Film, 
  Bookmark, 
  Heart, 
  Settings, 
  Lock, 
  CheckCircle2, 
  MessageSquare, 
  Phone, 
  Video, 
  X,
  Share2,
  Users,
  Camera,
  Loader2,
  Trash2,
  Menu,
  ShieldAlert
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ProfileViewProps {
  username?: string;
  onSelectUser: (username: string) => void;
  onOpenDirectChat?: (user: UserPreview) => void;
  onSelectReel?: (reelId: string) => void;
  onOpenAdmin?: () => void;
  refreshTrigger?: number;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  username,
  onSelectUser,
  onOpenDirectChat,
  onSelectReel,
  onOpenAdmin,
  refreshTrigger
}) => {
  const { user: currentUser, setIsAccountSwitcherOpen, refreshUser } = useAuth();
  const { subscribe } = useRealtime();
  const { startCall } = useCall();
  const { isUserOnline } = usePresence();
  const { getStats, getFollowState, setFollowInfo } = useFollow();

  const isOwnerAdmin = Boolean(
    currentUser && (
      currentUser.role === 'OWNER_ADMIN' || 
      currentUser.role === 'ADMIN' || 
      currentUser.username?.toLowerCase() === 'shuv' || 
      currentUser.id === 'user-shuv'
    )
  );

  const targetUsername = (username || currentUser?.username || '').replace(/^@/, '').trim();
  const isMe = Boolean(
    currentUser && 
    (currentUser.username.toLowerCase() === targetUsername.toLowerCase() || 
     currentUser.id === targetUsername)
  );

  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'saved'>('posts');
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'account' | 'edit-profile' | 'password' | 'privacy' | 'notifications' | 'blocked' | 'preferences'>('account');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);

  // Followers & Following Lists Modal
  const [modalType, setModalType] = useState<'followers' | 'following' | null>(null);
  const [modalUsers, setModalUsers] = useState<User[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Direct Gallery Photo Upload
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatarDirect, setUploadingAvatarDirect] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [showReelDeleteConfirm, setShowReelDeleteConfirm] = useState(false);
  const [isDeletingReel, setIsDeletingReel] = useState(false);
  const [reelDeleteError, setReelDeleteError] = useState<string | null>(null);

  const handleConfirmDeleteReel = async () => {
    if (!selectedReel) return;
    setIsDeletingReel(true);
    setReelDeleteError(null);
    try {
      await apiRequest(`/reels/${selectedReel.id}`, { method: 'DELETE' });
      setReels(prev => prev.filter(r => r.id !== selectedReel.id));
      setSelectedReel(null);
      setShowReelDeleteConfirm(false);
      fetchProfile();
    } catch (err: any) {
      setReelDeleteError(err.message || 'Failed to delete reel');
    } finally {
      setIsDeletingReel(false);
    }
  };

  const handleDirectPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (PNG, JPG, WEBP, etc.) from your gallery.');
      return;
    }

    setUploadingAvatarDirect(true);
    setAvatarUploadError(null);
    try {
      // 1. Optimize image in canvas for instant persistence
      const { file: optimizedFile, dataUrl } = await compressProfileImage(file);
      if (profileUser?.id) {
        saveLocalAvatarCache(profileUser.id, dataUrl);
      }
      setProfileUser(prev => prev ? { ...prev, avatarUrl: dataUrl, avatarBase64: dataUrl } : null);

      let finalUrl = dataUrl;
      try {
        const uploadedUrl = await uploadMediaFile(optimizedFile);
        if (uploadedUrl) {
          finalUrl = uploadedUrl;
        }
      } catch (uploadErr) {
        console.warn('[ProfileView] Direct upload server fallback to base64:', uploadErr);
      }

      await apiRequest('/profile/update', {
        method: 'POST',
        body: JSON.stringify({ 
          avatarUrl: finalUrl,
          avatarBase64: dataUrl
        })
      });
      await refreshUser();
      setProfileUser(prev => prev ? { ...prev, avatarUrl: finalUrl, avatarBase64: dataUrl } : null);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile picture from gallery');
    } finally {
      setUploadingAvatarDirect(false);
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
    }
  };

  const fetchProfile = async () => {
    const lookup = (username || currentUser?.username || '').replace(/^@/, '').trim();
    if (!lookup) {
      if (currentUser) {
        setProfileUser(currentUser);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ user?: UserProfile; profile?: UserProfile; posts: Post[]; reels: Reel[]; savedPosts: Post[] }>(
        `/profile/${encodeURIComponent(lookup)}`
      );
      const fetched = res.user || res.profile;
      if (fetched) {
        setProfileUser(fetched);
        if (fetched.relationshipState) {
          setFollowInfo(
            fetched.id, 
            fetched.relationshipState, 
            fetched.followersCount, 
            fetched.followingCount
          );
        }
      }
      setPosts(res.posts || []);
      setReels(res.reels || []);
      setSavedPosts(res.savedPosts || []);
    } catch (err) {
      console.warn('Profile fetch warning:', err);
      if (currentUser && (lookup === currentUser.username || !username)) {
        setProfileUser(currentUser);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [targetUsername, currentUser?.username, refreshTrigger]);

  // Real-time synchronization for new and deleted posts/reels on the profile
  useEffect(() => {
    const unsubPost = subscribe('POST_CREATED', (evt) => {
      if (evt?.post) {
        if (!profileUser || evt.post.userId === profileUser.id || evt.post.author?.username?.toLowerCase() === profileUser.username?.toLowerCase() || isMe) {
          fetchProfile();
        }
      }
    });

    const unsubPostDel = subscribe('POST_DELETED', (evt) => {
      if (evt?.postId) {
        setPosts(prev => prev.filter(p => p.id !== evt.postId));
      }
    });

    const unsubReel = subscribe('REEL_CREATED', (evt) => {
      if (evt?.reel) {
        if (!profileUser || evt.reel.userId === profileUser.id || evt.reel.author?.username?.toLowerCase() === profileUser.username?.toLowerCase() || isMe) {
          fetchProfile();
        }
      }
    });

    const unsubReelDel = subscribe('REEL_DELETED', (evt) => {
      if (evt?.reelId) {
        setReels(prev => prev.filter(r => r.id !== evt.reelId));
      }
    });

    return () => {
      unsubPost();
      unsubPostDel();
      unsubReel();
      unsubReelDel();
    };
  }, [subscribe, profileUser?.id, profileUser?.username]);

  const openFollowList = async (type: 'followers' | 'following') => {
    if (!profileUser) return;
    setModalType(type);
    setModalLoading(true);
    try {
      const res = await apiRequest<{ users: User[] }>(`/follow/${type}/${profileUser.id}`);
      setModalUsers(res.users || []);
    } catch {
      // Ignore
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24 text-xs text-[#8E8E8E]">
        Loading profile...
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="text-center py-20 text-xs text-[#8E8E8E]">
        User @{targetUsername} not found.
      </div>
    );
  }

  // Real-time follow counts from FollowContext
  const dynamicStats = getStats(profileUser.id, {
    followersCount: profileUser.followersCount,
    followingCount: profileUser.followingCount,
    postsCount: profileUser.postsCount
  });

  const followState = getFollowState(profileUser.id);
  const isAcceptedFollowing = followState === 'Following' || profileUser.relationshipState === 'Following' || Boolean(profileUser.isFollowing);
  const isPrivateAndLocked = Boolean(
    profileUser.isPrivate && !isMe && !isAcceptedFollowing && !isOwnerAdmin
  );

  const isOnline = isUserOnline(profileUser.id);

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 space-y-6">
      {/* Profile Header Card */}
      <div className="relative bg-white border border-[#EEEEEE] rounded-3xl p-6 shadow-xs space-y-6">
        {/* Top Right Three Parallel Lines (Menu) Settings Button */}
        {isMe && (
          <button
            id="profile-settings-menu-btn"
            type="button"
            onClick={() => {
              setSettingsTab('account');
              setIsSettingsOpen(true);
            }}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 text-[#1A1A1A] hover:bg-[#F5F5F5] rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center z-10"
            title="Settings"
            aria-label="Settings"
          >
            <Menu className="w-6 h-6 stroke-[2.2]" />
          </button>
        )}

        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
          {/* Avatar with Direct Device Gallery Upload */}
          <div className="relative shrink-0 group">
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleDirectPhotoChange}
              className="hidden"
              id="profile-gallery-file-input"
            />
            <img
              src={resolveAvatarUrl(profileUser)}
              alt={profileUser.displayName}
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-[#EEEEEE] ${
                isMe ? 'cursor-pointer group-hover:opacity-90 transition-opacity' : ''
              }`}
              onClick={() => {
                if (isMe && !uploadingAvatarDirect) {
                  galleryInputRef.current?.click();
                }
              }}
              title={isMe ? 'Click to change profile picture from gallery' : undefined}
            />

            {/* Direct Gallery Upload Camera Badge for current user */}
            {isMe && (
              <button
                type="button"
                id="profile-change-avatar-btn"
                disabled={uploadingAvatarDirect}
                onClick={(e) => {
                  e.stopPropagation();
                  galleryInputRef.current?.click();
                }}
                className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 bg-black hover:bg-zinc-800 text-white rounded-full flex items-center justify-center border-2 border-white shadow-md transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                title="Change picture directly from device gallery"
              >
                {uploadingAvatarDirect ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {isOnline && !isMe && (
              <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
            )}
          </div>

          {/* Details & Actions */}
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center justify-center sm:justify-start space-x-1.5">
                  <h2 className="text-lg font-extrabold text-[#1A1A1A] truncate">{profileUser.displayName}</h2>
                  {profileUser.verified && (
                    <VerifiedBadge size="sm" />
                  )}
                  {profileUser.isPrivate && (
                    <span title="Private Account" className="inline-flex items-center">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8E8E8E]">@{profileUser.username}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center sm:justify-end space-x-2 flex-wrap gap-y-2">
                {isMe ? (
                  <>
                    {isOwnerAdmin && (
                      <button
                        id="profile-admin-panel-btn"
                        onClick={() => onOpenAdmin?.()}
                        className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs"
                        title="Admin Console"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                        <span>Admin Panel</span>
                      </button>
                    )}
                    <button
                      id="profile-edit-btn"
                      onClick={() => {
                        setIsEditOpen(true);
                      }}
                      className="px-4 py-1.5 bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#1A1A1A] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      Edit Profile
                    </button>
                    <button
                      id="profile-switch-account-btn"
                      onClick={() => setIsAccountSwitcherOpen(true)}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#1A1A1A] text-xs font-semibold rounded-xl transition-all active:scale-95 cursor-pointer"
                      title="Switch Account"
                    >
                      <Users className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Switch</span>
                    </button>
                    <button
                      id="profile-settings-action-btn"
                      type="button"
                      onClick={() => {
                        setSettingsTab('account');
                        setIsSettingsOpen(true);
                      }}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#1A1A1A] text-xs font-semibold rounded-xl transition-all active:scale-95 cursor-pointer"
                      title="Settings"
                      aria-label="Settings"
                    >
                      <Menu className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Settings</span>
                    </button>
                  </>
                ) : (
                  <>
                    <FollowButton targetUserId={profileUser.id} />
                    {!isPrivateAndLocked && (
                      <>
                        <button
                          onClick={() => onOpenDirectChat?.(profileUser)}
                          className="p-2 bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#1A1A1A] rounded-xl transition-colors"
                          title="Direct Message"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          id="profile-voice-call-btn"
                          onClick={() => startCall(profileUser.id, 'audio')}
                          className="p-2 bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#1A1A1A] rounded-xl transition-colors"
                          title="Audio Call"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          id="profile-video-call-btn"
                          onClick={() => startCall(profileUser.id, 'video')}
                          className="p-2 bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#1A1A1A] rounded-xl transition-colors"
                          title="Video Call"
                        >
                          <Video className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bio */}
            {profileUser.bio && (
              <p className="text-xs text-[#333333] leading-relaxed whitespace-pre-wrap">
                {profileUser.bio}
              </p>
            )}

            {/* Real-time Counts: Posts, Followers, Following */}
            <div className="flex items-center justify-center sm:justify-start space-x-6 pt-1 text-xs border-t border-[#F5F5F5]">
              <div>
                <span className="font-extrabold text-[#1A1A1A]">{posts.length + reels.length}</span>{' '}
                <span className="text-[#8E8E8E]">posts</span>
              </div>
              <button
                id="profile-followers-btn"
                onClick={() => openFollowList('followers')}
                className="hover:underline cursor-pointer focus:outline-none"
              >
                <span className="font-extrabold text-[#1A1A1A]">{dynamicStats.followersCount}</span>{' '}
                <span className="text-[#8E8E8E]">followers</span>
              </button>
              <button
                id="profile-following-btn"
                onClick={() => openFollowList('following')}
                className="hover:underline cursor-pointer focus:outline-none"
              >
                <span className="font-extrabold text-[#1A1A1A]">{dynamicStats.followingCount}</span>{' '}
                <span className="text-[#8E8E8E]">following</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Private Profile Notice or Media Tabs */}
      {isPrivateAndLocked ? (
        <div className="bg-white border border-[#EEEEEE] rounded-3xl p-12 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#1A1A1A]">This Account is Private</h3>
          <p className="text-xs text-[#8E8E8E] max-w-sm mx-auto">
            Follow this account to see their photos, videos, and send direct messages.
          </p>
        </div>
      ) : (
        <>
          {/* Profile Tabs */}
          <div className="flex items-center justify-around bg-white border border-[#EEEEEE] rounded-2xl p-1 shadow-xs">
            <button
              onClick={() => setActiveTab('posts')}
              className={`flex items-center space-x-2 py-2 px-4 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'posts' ? 'bg-[#1A1A1A] text-white' : 'text-[#666666] hover:bg-gray-50'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Posts ({posts.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('reels')}
              className={`flex items-center space-x-2 py-2 px-4 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'reels' ? 'bg-[#1A1A1A] text-white' : 'text-[#666666] hover:bg-gray-50'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Reels ({reels.length})</span>
            </button>

            {isMe && (
              <button
                onClick={() => setActiveTab('saved')}
                className={`flex items-center space-x-2 py-2 px-4 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === 'saved' ? 'bg-[#1A1A1A] text-white' : 'text-[#666666] hover:bg-gray-50'
                }`}
              >
                <Bookmark className="w-4 h-4" />
                <span>Saved ({savedPosts.length})</span>
              </button>
            )}
          </div>

          {/* Media Grid */}
          {activeTab === 'posts' && (
            <MediaGrid
              items={posts.map(p => ({
                id: p.id,
                mediaUrl: p.mediaUrl,
                thumbnailUrl: p.thumbnailUrl,
                mediaType: p.mediaType,
                caption: p.caption,
                likesCount: p.likesCount,
                commentsCount: p.commentsCount,
                authorUsername: p.author.username
              }))}
              aspectRatio="square"
              emptyMessage="No posts uploaded yet."
              onItemClick={(item) => {
                if ((item.mediaType === 'video' || item.isReel) && onSelectReel) {
                  onSelectReel(item.id);
                  return;
                }
                const found = posts.find(p => p.id === item.id);
                if (found) setSelectedPost(found);
              }}
            />
          )}

          {activeTab === 'reels' && (
            <MediaGrid
              items={reels.map(r => ({
                id: r.id,
                mediaUrl: r.videoUrl,
                thumbnailUrl: r.thumbnailUrl,
                mediaType: 'video',
                isReel: true,
                caption: r.caption,
                likesCount: r.likesCount,
                commentsCount: r.commentsCount,
                authorUsername: r.author.username
              }))}
              aspectRatio="square"
              emptyMessage="No reels uploaded yet."
              onItemClick={(item) => {
                if (onSelectReel) {
                  onSelectReel(item.id);
                } else {
                  const found = reels.find(r => r.id === item.id);
                  if (found) setSelectedReel(found);
                }
              }}
            />
          )}

          {activeTab === 'saved' && (
            <MediaGrid
              items={savedPosts.map(p => ({
                id: p.id,
                mediaUrl: p.mediaUrl,
                thumbnailUrl: p.thumbnailUrl,
                mediaType: p.mediaType,
                caption: p.caption,
                likesCount: p.likesCount,
                commentsCount: p.commentsCount,
                authorUsername: p.author.username
              }))}
              aspectRatio="square"
              emptyMessage="No saved posts yet."
              onItemClick={(item) => {
                if (item.mediaType === 'video' && onSelectReel) {
                  onSelectReel(item.id);
                  return;
                }
                const found = savedPosts.find(p => p.id === item.id);
                if (found) setSelectedPost(found);
              }}
            />
          )}
        </>
      )}

      {/* Selected Post Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setSelectedPost(null)}
              className="absolute top-2 right-2 z-30 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <PostCard
              post={selectedPost}
              onSelectUser={(u) => {
                setSelectedPost(null);
                onSelectUser(u);
              }}
              onPostDeleted={(postId) => {
                setSelectedPost(null);
                setPosts(prev => prev.filter(p => p.id !== postId));
                setSavedPosts(prev => prev.filter(p => p.id !== postId));
                fetchProfile();
              }}
            />
          </div>
        </div>
      )}

      {/* Selected Reel Modal */}
      {selectedReel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="max-w-sm w-full max-h-[85vh] h-[640px] relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex items-center justify-center">
            {/* Top Bar Actions */}
            <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-auto">
              {Boolean(
                currentUser && (
                  selectedReel.userId === currentUser.id ||
                  selectedReel.author?.id === currentUser.id ||
                  selectedReel.author?.username?.toLowerCase() === currentUser.username?.toLowerCase() ||
                  isOwnerAdmin
                )
              ) ? (
                <button
                  type="button"
                  onClick={() => setShowReelDeleteConfirm(true)}
                  disabled={isDeletingReel}
                  className="p-2 bg-red-600/80 hover:bg-red-600 text-white rounded-full shadow-lg transition-transform hover:scale-105 cursor-pointer"
                  title="Delete this reel"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setSelectedReel(null)}
                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg transition-transform hover:scale-105 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <video
              src={selectedReel.videoUrl}
              poster={selectedReel.thumbnailUrl}
              autoPlay
              controls
              playsInline
              loop
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Reel Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showReelDeleteConfirm}
        title="Delete Reel"
        message={
          Boolean(
            currentUser && (
              selectedReel?.userId === currentUser.id ||
              selectedReel?.author?.id === currentUser.id
            )
          )
            ? "Are you sure you want to permanently delete your reel? This action cannot be undone."
            : `Are you sure you want to delete this reel by @${selectedReel?.author?.username} as an Administrator?`
        }
        confirmLabel="Delete Reel"
        isDestructive={true}
        isLoading={isDeletingReel}
        onConfirm={handleConfirmDeleteReel}
        onCancel={() => {
          setShowReelDeleteConfirm(false);
          setReelDeleteError(null);
        }}
      />

      {reelDeleteError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-red-600 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2">
          <span>{reelDeleteError}</span>
          <button 
            type="button" 
            onClick={() => setReelDeleteError(null)} 
            className="font-bold ml-2 hover:opacity-80"
          >
            ×
          </button>
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditOpen && profileUser && (
        <EditProfileModal
          user={profileUser}
          onClose={() => setIsEditOpen(false)}
          onProfileUpdated={(updatedUser?: User) => {
            fetchProfile();
            if (updatedUser?.username && updatedUser.username !== profileUser.username) {
              onSelectUser(updatedUser.username);
            }
          }}
        />
      )}

      {/* Followers / Following List Modal */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[70vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1A1A1A] capitalize">
                {modalType} ({modalUsers.length})
              </h3>
              <button
                onClick={() => setModalType(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-[#F5F5F5]">
              {modalLoading ? (
                <div className="text-center py-8 text-xs text-gray-500">Loading users...</div>
              ) : modalUsers.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">No {modalType} to show.</div>
              ) : (
                modalUsers.map(u => (
                  <div key={u.id} className="pt-3 first:pt-0 flex items-center justify-between">
                    <div
                      onClick={() => {
                        setModalType(null);
                        onSelectUser(u.username);
                      }}
                      className="flex items-center space-x-3 cursor-pointer min-w-0 flex-1 mr-2 group"
                    >
                      <img
                        src={resolveAvatarUrl(u)}
                        alt={u.displayName}
                        className="w-9 h-9 rounded-full object-cover border border-[#EEEEEE]"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#1A1A1A] group-hover:underline truncate">{u.displayName}</p>
                        <p className="text-[10px] text-[#8E8E8E] truncate">@{u.username}</p>
                      </div>
                    </div>

                    {currentUser?.id !== u.id && (
                      <FollowButton targetUserId={u.id} size="sm" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          fetchProfile();
        }}
        initialTab={settingsTab}
        onOpenAdmin={onOpenAdmin}
        onProfileUpdated={(updatedUser?: User) => {
          fetchProfile();
          if (updatedUser?.username && updatedUser.username !== profileUser?.username) {
            onSelectUser(updatedUser.username);
          }
        }}
      />
    </div>
  );
};
