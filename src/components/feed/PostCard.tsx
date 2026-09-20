import React, { useState, useEffect, useRef } from 'react';
import { Post, MusicTrack } from '../../types/index';
import { PostVideoPlayer } from './PostVideoPlayer';
import { CommentsModal } from './CommentsModal';
import { ShareModal } from '../common/ShareModal';
import { FollowButton } from '../common/FollowButton';
import { HeartBurst } from '../common/HeartBurst';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { useAuth } from '../../context/AuthContext';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { apiRequest } from '../../lib/api';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  Music, 
  Play, 
  Pause,
  Trash2,
  MoreVertical,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Layers,
  Flag,
  Send
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ReportModal } from '../common/ReportModal';

interface PostCardProps {
  post: Post;
  onSelectUser: (username: string) => void;
  onSelectTrack?: (track: MusicTrack) => void;
  onPostDeleted?: (postId: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onSelectUser,
  onSelectTrack,
  onPostDeleted
}) => {
  const { user } = useAuth();
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();

  const [isLiked, setIsLiked] = useState(Boolean(post.isLiked));
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [isSaved, setIsSaved] = useState(Boolean(post.isSaved));
  const [commentsCount, setCommentsCount] = useState(post.commentsCount || 0);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselTrackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [detectedRatio, setDetectedRatio] = useState<number | null>(() => {
    if (post.width && post.height && post.height > 0) {
      return post.width / post.height;
    }
    return null;
  });

  const isAuthor = Boolean(
    user && (
      user.id === post.userId || 
      user.id === post.author?.id || 
      user.username?.toLowerCase() === post.author?.username?.toLowerCase()
    )
  );
  const isAdmin = Boolean(
    user && (
      user.role === 'OWNER_ADMIN' || 
      user.role === 'ADMIN' || 
      user.username?.toLowerCase() === 'shuv' || 
      user.id === 'user-shuv'
    )
  );
  const canDelete = isAuthor || isAdmin;

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/posts/${post.id}`, { method: 'DELETE' });
      setIsDeleted(true);
      setShowDeleteConfirm(false);
      if (onPostDeleted) onPostDeleted(post.id);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete post');
    } finally {
      setIsDeleting(false);
    }
  };

  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    setIsLiked(Boolean(post.isLiked));
    setLikesCount(post.likesCount || 0);
    setIsSaved(Boolean(post.isSaved));
    setCommentsCount(post.commentsCount || 0);
  }, [post.id, post.isLiked, post.likesCount, post.isSaved, post.commentsCount]);

  const handleToggleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);

    const prevLiked = isLiked;
    const prevCount = likesCount;
    const nextLiked = !prevLiked;
    const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

    setIsLiked(nextLiked);
    setLikesCount(nextCount);

    try {
      const res = await apiRequest<{ isLiked: boolean; likesCount: number }>(`/posts/${post.id}/like`, {
        method: 'POST'
      });
      setIsLiked(res.isLiked);
      setLikesCount(res.likesCount);
    } catch {
      setIsLiked(prevLiked);
      setLikesCount(prevCount);
    } finally {
      setIsLiking(false);
    }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 800);
      if (!isLiked) {
        handleToggleLike();
      }
    }
    lastTapRef.current = now;
  };

  const handleToggleSave = async () => {
    const prevSaved = isSaved;
    setIsSaved(!prevSaved);

    try {
      const res = await apiRequest<{ isSaved: boolean }>(`/posts/${post.id}/save`, {
        method: 'POST'
      });
      setIsSaved(res.isSaved);
    } catch {
      setIsSaved(prevSaved);
    }
  };

  const isCurrentAudioPlaying = post.audio && currentTrack?.id === post.audio.id && isPlaying;

  const formatTimeAgo = (dateInput: string | Date | number) => {
    try {
      const now = Date.now();
      const past = new Date(dateInput).getTime();
      const diffMs = Math.max(0, now - past);
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hours ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} days ago`;
      return new Date(dateInput).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  if (isDeleted) {
    return null;
  }

  return (
    <article className="bg-white border-b border-gray-100 pb-3 mb-2 sm:mb-4 sm:border sm:rounded-2xl sm:shadow-xs overflow-hidden">
      {/* Author Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between">
        <div 
          onClick={() => onSelectUser(post.author.username)}
          className="flex items-center space-x-2.5 cursor-pointer group min-w-0"
        >
          <img
            src={post.author.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${post.author.username}`}
            alt={post.author.displayName}
            className="w-8 h-8 rounded-full object-cover border border-gray-200 group-hover:opacity-90 shrink-0"
          />
          <div className="min-w-0 flex flex-col justify-center">
            <div className="flex items-center space-x-1">
              <span className="text-xs font-bold text-black group-hover:underline truncate leading-none">
                {post.author.displayName || post.author.username}
              </span>
              {post.author.verified && (
                <VerifiedBadge size="xs" />
              )}
            </div>
            <p className="text-[11px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
              @{post.author.username}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1 relative">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="p-1 text-black hover:opacity-60 transition-opacity cursor-pointer"
              title="More options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showOptionsMenu && (
              <div 
                className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-[#EEEEEE] py-1 z-40 animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    onSelectUser(post.author.username);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center space-x-2 cursor-pointer"
                >
                  <span>View profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    setIsShareOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center space-x-2 cursor-pointer"
                >
                  <span>Share post</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    setIsReportOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center space-x-2 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5 text-amber-600" />
                  <span>Report post</span>
                </button>
                {canDelete && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setShowOptionsMenu(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center space-x-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete post</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {deleteError && (
        <div className="mx-3.5 mb-2 p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{deleteError}</span>
          </div>
          <button 
            type="button"
            onClick={() => setDeleteError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Media View (Carousel, Single Image/Video, or Text Status Card) */}
      {post.mediaType === 'carousel' && post.carouselItems && post.carouselItems.length > 0 ? (
        <div className="w-full aspect-[4/5] max-h-[560px] bg-neutral-900 overflow-hidden relative select-none flex items-center justify-center group">
          {/* Slidable Carousel Track (Touch swipe & Pointer drag without buttons) */}
          <div
            ref={carouselTrackRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el && el.clientWidth > 0) {
                const idx = Math.round(el.scrollLeft / el.clientWidth);
                if (idx !== carouselIndex && idx >= 0 && idx < post.carouselItems!.length) {
                  setCarouselIndex(idx);
                }
              }
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== 'mouse' || e.button !== 0) return;
              const el = carouselTrackRef.current;
              if (!el) return;
              isDraggingRef.current = true;
              hasMovedRef.current = false;
              startXRef.current = e.clientX;
              scrollLeftRef.current = el.scrollLeft;
            }}
            onPointerMove={(e) => {
              if (!isDraggingRef.current || e.pointerType !== 'mouse') return;
              const el = carouselTrackRef.current;
              if (!el) return;
              const dist = e.clientX - startXRef.current;
              if (Math.abs(dist) > 5) {
                hasMovedRef.current = true;
              }
              el.scrollLeft = scrollLeftRef.current - dist;
            }}
            onPointerUp={() => {
              if (!isDraggingRef.current) return;
              isDraggingRef.current = false;
              const el = carouselTrackRef.current;
              if (el && el.clientWidth > 0) {
                const targetIdx = Math.round(el.scrollLeft / el.clientWidth);
                el.scrollTo({
                  left: targetIdx * el.clientWidth,
                  behavior: 'smooth'
                });
                setCarouselIndex(targetIdx);
              }
            }}
            onPointerCancel={() => {
              isDraggingRef.current = false;
            }}
            className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar select-none touch-pan-x"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {post.carouselItems.map((item, idx) => (
              <div
                key={item.id || idx}
                className="w-full h-full flex-shrink-0 snap-center snap-always relative flex items-center justify-center bg-neutral-900 overflow-hidden"
              >
                {item.mediaType === 'video' ? (
                  <PostVideoPlayer
                    id={`carousel-${post.id}-${idx}`}
                    videoUrl={item.mediaUrl}
                    thumbnailUrl={item.thumbnailUrl}
                    onDoubleTap={() => {
                      if (!hasMovedRef.current) {
                        handleDoubleTap();
                      }
                    }}
                    className="w-full h-full"
                  />
                ) : (
                  <img
                    src={item.mediaUrl}
                    alt={post.caption || `Carousel slide ${idx + 1}`}
                    loading="lazy"
                    draggable={false}
                    onClick={() => {
                      if (!hasMovedRef.current) {
                        handleDoubleTap();
                      }
                    }}
                    className="w-full h-full object-cover block cursor-pointer select-none"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Counter Pill */}
          {post.carouselItems.length > 1 && (
            <div className="absolute top-3 right-3 bg-black/75 backdrop-blur-xs px-2.5 py-0.5 rounded-full text-white text-[11px] font-semibold z-20 shadow-md pointer-events-none">
              <span>{carouselIndex + 1}/{post.carouselItems.length}</span>
            </div>
          )}

          <HeartBurst show={showHeartBurst} size={90} />
        </div>
      ) : post.mediaUrl && post.mediaUrl.trim() !== '' ? (
        <div 
          onClick={handleDoubleTap}
          className={`w-full bg-neutral-950 overflow-hidden relative select-none cursor-pointer flex items-center justify-center transition-all ${
            detectedRatio && detectedRatio >= 1.25
              ? 'aspect-[16/9] max-h-[480px]'
              : detectedRatio && detectedRatio >= 0.85
              ? 'aspect-square max-h-[520px]'
              : 'aspect-[4/5] max-h-[580px]'
          }`}
        >
          {post.mediaType === 'video' ? (
            <PostVideoPlayer
              id={post.id}
              videoUrl={post.mediaUrl}
              thumbnailUrl={post.thumbnailUrl}
              onDoubleTap={handleDoubleTap}
              onDimensionsLoaded={(w, h) => {
                if (w && h && !detectedRatio) {
                  setDetectedRatio(w / h);
                }
              }}
              className="w-full h-full"
            />
          ) : (
            <img
              src={post.mediaUrl}
              alt={post.caption}
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight && !detectedRatio) {
                  setDetectedRatio(img.naturalWidth / img.naturalHeight);
                }
              }}
              className={`w-full h-full ${
                detectedRatio && detectedRatio >= 1.25 ? 'object-contain' : 'object-cover'
              } block`}
            />
          )}

          {/* Professional Double-tap Floating Heart Animation */}
          <HeartBurst show={showHeartBurst} size={90} />
        </div>
      ) : (
        <div
          onClick={handleDoubleTap}
          className="w-full min-h-[160px] bg-gradient-to-br from-[#1A1A1A] to-neutral-800 text-white p-6 relative select-none cursor-pointer flex flex-col justify-center"
        >
          <p className="text-base sm:text-lg font-medium leading-relaxed tracking-tight break-words">
            "{post.caption}"
          </p>
          <HeartBurst show={showHeartBurst} size={90} />
        </div>
      )}

      {/* Post Action Buttons & Details */}
      <div className="px-3.5 pt-2.5 pb-2">
        {/* Action Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={handleToggleLike}
              className="text-black hover:opacity-75 transition-transform active:scale-125 duration-150 cursor-pointer"
              aria-label="Like post"
            >
              <Heart 
                className={`w-6 h-6 transition-colors ${
                  isLiked ? 'fill-[#ED4956] text-[#ED4956] stroke-none' : 'stroke-[1.8]'
                }`} 
              />
            </button>

            <button
              type="button"
              onClick={() => setIsCommentsOpen(true)}
              className="text-black hover:opacity-75 transition-opacity cursor-pointer"
              aria-label="Comment"
            >
              <MessageCircle className="w-6 h-6 stroke-[1.8]" />
            </button>

            <button
              type="button"
              onClick={() => setIsShareOpen(true)}
              className="text-black hover:opacity-75 transition-opacity -rotate-12 translate-y-[-1px] cursor-pointer"
              aria-label="Share"
            >
              <Send className="w-6 h-6 stroke-[1.8]" />
            </button>
          </div>

          {/* Carousel Pagination Dots in Center */}
          {post.mediaType === 'carousel' && post.carouselItems && post.carouselItems.length > 1 && (
            <div className="flex items-center space-x-1 select-none">
              {post.carouselItems.map((_, idx) => (
                <div
                  key={idx}
                  className={`rounded-full transition-all duration-200 ${
                    idx === carouselIndex ? 'w-1.5 h-1.5 bg-[#0095F6]' : 'w-1.5 h-1.5 bg-gray-300'
                  }`}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleSave}
            className="text-black hover:opacity-75 transition-transform active:scale-125 duration-150 cursor-pointer"
            aria-label="Save post"
          >
            <Bookmark className={`w-6 h-6 ${isSaved ? 'fill-black text-black stroke-black' : 'stroke-[1.8]'}`} />
          </button>
        </div>

        {/* Music Attached Pill */}
        {post.audio && (
          <div 
            onClick={() => {
              if (onSelectTrack) onSelectTrack(post.audio!);
              playTrack(post.audio!);
            }}
            className="inline-flex items-center space-x-2 px-2.5 py-1 bg-[#F5F5F5] hover:bg-[#EBEBEB] rounded-full text-[11px] font-medium text-[#1A1A1A] cursor-pointer transition-colors mt-2"
          >
            <Music className="w-3 h-3 text-[#666666]" />
            <span className="truncate max-w-[200px]">{post.audio.title} • {post.audio.artist}</span>
            <button className="w-4 h-4 rounded-full bg-black text-white flex items-center justify-center shrink-0">
              {isCurrentAudioPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
            </button>
          </div>
        )}

        {/* Likes Count */}
        <p className="text-xs font-bold text-black mt-2">
          {likesCount.toLocaleString()} {likesCount === 1 ? 'like' : 'likes'}
        </p>

        {/* Caption */}
        {post.caption && (
          <p className="text-xs text-black leading-snug mt-1">
            <span 
              onClick={() => onSelectUser(post.author.username)}
              className="font-bold cursor-pointer hover:underline mr-1.5"
            >
              {post.author.username}
            </span>
            {post.caption}
          </p>
        )}

        {/* Comments Count Link */}
        <button
          onClick={() => setIsCommentsOpen(true)}
          className="text-xs text-gray-500 mt-1 block hover:underline cursor-pointer"
        >
          {commentsCount > 0 ? `View all ${commentsCount} comments` : 'Leave a comment'}
        </button>

        {/* Timestamp */}
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">
          {formatTimeAgo(post.createdAt)}
        </p>
      </div>

      {/* Modals */}
      <CommentsModal
        isOpen={isCommentsOpen}
        postId={post.id}
        onClose={() => setIsCommentsOpen(false)}
        onCommentAdded={() => setCommentsCount(c => c + 1)}
        onCommentDeleted={() => setCommentsCount(c => Math.max(0, c - 1))}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        title={post.caption || `${post.author.displayName}'s post`}
        url={`${window.location.origin}/#post-${post.id}`}
        sharedContent={{
          type: 'POST',
          id: post.id,
          mediaUrl: post.mediaUrl,
          thumbnailUrl: post.thumbnailUrl || post.mediaUrl,
          caption: post.caption,
          authorUsername: post.author.username,
          authorDisplayName: post.author.displayName,
          authorAvatarUrl: post.author.avatarUrl
        }}
      />

      {/* In-app Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Post"
        message={
          isAuthor 
            ? "Are you sure you want to permanently delete your post? This action cannot be undone."
            : `Are you sure you want to delete this post by @${post.author.username} as an Administrator?`
        }
        confirmLabel="Delete Post"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* User Content Reporting Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        targetType="post"
        targetId={post.id}
        contentAuthorUsername={post.author.username}
      />
    </article>
  );
};
