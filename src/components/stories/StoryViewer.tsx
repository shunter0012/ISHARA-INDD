import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Story, UserPreview } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { resolveVideoUrl } from '../../lib/upload';
import { globalMediaCoordinator } from '../../lib/globalMediaCoordinator';
import { FollowButton } from '../common/FollowButton';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Pause, 
  Play, 
  Volume2, 
  VolumeX, 
  Users,
  Trash2,
  Heart,
  Music
} from 'lucide-react';

interface StoryViewerProps {
  story: Story | null;
  stories?: Story[];
  currentIndex?: number;
  onClose: () => void;
  onSelectUser: (username: string) => void;
  onNavigate?: (index: number) => void;
  onStoryViewed?: (storyId: string) => void;
  onStoryLiked?: (storyId: string, isLiked: boolean, likesCount: number) => void;
}

export const StoryViewer: React.FC<StoryViewerProps> = ({
  story,
  stories = [],
  currentIndex = 0,
  onClose,
  onSelectUser,
  onNavigate,
  onStoryViewed,
  onStoryLiked
}) => {
  const { user: currentUser } = useAuth();
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<UserPreview[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewsCount, setViewsCount] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [showHeartBurst, setShowHeartBurst] = useState<boolean>(false);
  const lastTapRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeStory = story || (stories.length > 0 ? stories[currentIndex] : null);
  const isAuthor = Boolean(
    currentUser && activeStory && (
      currentUser.id === activeStory.userId ||
      currentUser.id === activeStory.author?.id ||
      currentUser.username?.toLowerCase() === activeStory.author?.username?.toLowerCase()
    )
  );

  const handleNext = useCallback(() => {
    if (stories.length > 0 && currentIndex < stories.length - 1 && onNavigate) {
      onNavigate(currentIndex + 1);
    } else {
      onClose();
    }
  }, [stories.length, currentIndex, onNavigate, onClose]);

  const handlePrev = useCallback(() => {
    if (stories.length > 0 && currentIndex > 0 && onNavigate) {
      onNavigate(currentIndex - 1);
    }
  }, [stories.length, currentIndex, onNavigate]);

  const handleNextRef = useRef(handleNext);
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  // Clean up any scheduled navigation timer on unmount
  useEffect(() => {
    return () => {
      if (nextTimerRef.current) {
        clearTimeout(nextTimerRef.current);
      }
    };
  }, []);

  // Record view on story open & fetch viewers strictly if the author
  useEffect(() => {
    if (!activeStory) return;
    setProgress(0);
    setShowViewers(false);
    setIsLiked(Boolean(activeStory.isLiked));
    setLikesCount(activeStory.likesCount || 0);

    if (isAuthor) {
      setViewsCount(activeStory.viewsCount || activeStory.viewers?.length || 0);
      fetchViewers(activeStory.id);
    } else {
      setViewsCount(0);
      setViewers([]);
    }

    // Call record view endpoint
    if (currentUser) {
      apiRequest<{ viewsCount?: number; isViewed?: boolean }>(`/stories/${activeStory.id}/view`, { method: 'POST' })
        .then(res => {
          if (isAuthor && res?.viewsCount !== undefined) {
            setViewsCount(res.viewsCount);
          }
          // Notify parent so profile ring immediately becomes normal
          onStoryViewed?.(activeStory.id);
        })
        .catch(err => console.warn('Failed to record story view:', err));
    }
  }, [activeStory?.id, isAuthor]);

  const handleToggleLike = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentUser || !activeStory) return;

    const nextIsLiked = !isLiked;
    const nextCount = nextIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1);
    setIsLiked(nextIsLiked);
    setLikesCount(nextCount);

    if (nextIsLiked) {
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 900);
    }

    try {
      const res = await apiRequest<{ isLiked: boolean; likesCount: number }>(`/stories/${activeStory.id}/like`, {
        method: 'POST'
      });
      if (res) {
        setIsLiked(res.isLiked);
        setLikesCount(res.likesCount);
        onStoryLiked?.(activeStory.id, res.isLiked, res.likesCount);
      }
    } catch (err) {
      console.warn('Failed to toggle like on story:', err);
      setIsLiked(!nextIsLiked);
      setLikesCount(likesCount);
    }
  };

  const fetchViewers = async (storyId: string) => {
    if (!isAuthor) return;
    setViewersLoading(true);
    try {
      const res = await apiRequest<{ viewers: UserPreview[] }>(`/stories/${storyId}/viewers`);
      setViewers(res.viewers || []);
      if (res.viewers) {
        setViewsCount(prev => Math.max(prev, res.viewers.length));
      }
    } catch (err) {
      console.warn('Failed to fetch viewers:', err);
    } finally {
      setViewersLoading(false);
    }
  };

  // Listen to global media coordinator: if another source starts playing, pause this story
  useEffect(() => {
    const unsubscribe = globalMediaCoordinator.subscribe(({ activeSource }) => {
      if (activeSource !== 'story') {
        setIsPaused(true);
      }
    });
    return unsubscribe;
  }, []);

  // Synchronize video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeStory?.mediaType !== 'video') return;

    if (isPaused || showViewers) {
      video.pause();
      if (activeStory?.id) {
        globalMediaCoordinator.pause('story', activeStory.id);
      }
    } else {
      video.muted = isMuted;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (activeStory?.id) {
              globalMediaCoordinator.play('story', activeStory.id);
            }
          })
          .catch(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current
                .play()
                .then(() => {
                  if (activeStory?.id) {
                    globalMediaCoordinator.play('story', activeStory.id);
                  }
                })
                .catch(() => {});
            }
          });
      }
    }

    return () => {
      if (activeStory?.id) {
        globalMediaCoordinator.pause('story', activeStory.id);
      }
    };
  }, [isPaused, showViewers, activeStory?.mediaType, activeStory?.id, isMuted]);

  // Synchronize background soundtrack if story has attached audio
  useEffect(() => {
    if (!activeStory?.audio?.audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    if (audio.src !== activeStory.audio.audioUrl) {
      audio.src = activeStory.audio.audioUrl;
      audio.currentTime = 0;
    }

    audio.muted = isMuted;

    if (isPaused || showViewers) {
      audio.pause();
      if (activeStory?.id) {
        globalMediaCoordinator.pause('story', activeStory.id);
      }
    } else {
      audio.play().then(() => {
        if (activeStory?.id) {
          globalMediaCoordinator.play('story', activeStory.id);
        }
      }).catch(() => {});
    }

    return () => {
      audio.pause();
      if (activeStory?.id) {
        globalMediaCoordinator.pause('story', activeStory.id);
      }
    };
  }, [activeStory?.audio?.audioUrl, activeStory?.id, isPaused, showViewers, isMuted]);

  // Progress Bar timer (for photos, video uses timeUpdate)
  useEffect(() => {
    if (!activeStory || isPaused || showViewers || activeStory.mediaType === 'video') return;

    const stepMs = 50;
    const totalDuration = 5000;
    const increment = (stepMs / totalDuration) * 100;

    const interval = setInterval(() => {
      setProgress(p => {
        const nextProgress = p + increment;
        if (nextProgress >= 100) {
          clearInterval(interval);
          if (nextTimerRef.current) {
            clearTimeout(nextTimerRef.current);
          }
          nextTimerRef.current = setTimeout(() => {
            handleNextRef.current();
          }, 0);
          return 100;
        }
        return nextProgress;
      });
    }, stepMs);

    return () => {
      clearInterval(interval);
      if (nextTimerRef.current) {
        clearTimeout(nextTimerRef.current);
      }
    };
  }, [activeStory?.id, isPaused, showViewers, activeStory?.mediaType]);

  const toggleOpenViewers = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthor) return;
    const next = !showViewers;
    setShowViewers(next);
    if (next && activeStory) {
      fetchViewers(activeStory.id);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteStory = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeStory || isDeleting) return;
    if (!window.confirm('Delete this story? It will be permanently removed.')) return;
    setIsDeleting(true);
    try {
      await apiRequest(`/stories/${activeStory.id}`, { method: 'DELETE' });
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to delete story');
      setIsDeleting(false);
    }
  };

  if (!activeStory) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2 sm:p-4 backdrop-blur-md select-none">
      {/* Container matching aspect-ratio and viewport */}
      <div 
        className="relative w-full max-w-sm h-[90vh] max-h-[820px] bg-black rounded-3xl overflow-hidden flex flex-col justify-between shadow-2xl border border-white/10"
        onClick={() => !showViewers && setIsPaused(p => !p)}
      >
        {/* Top Progress Bars (if multiple stories or single) */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center space-x-1.5">
          {stories.length > 0 ? (
            stories.map((s, idx) => (
              <div key={s.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-75 ease-linear"
                  style={{
                    width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%'
                  }}
                />
              </div>
            ))
          ) : (
            <div className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-75 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Story Author Header */}
        <div className="absolute top-6 left-3 right-3 z-30 flex items-center justify-between pointer-events-auto">
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              onSelectUser(activeStory.author.username);
            }}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <img
              src={activeStory.author.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${activeStory.author.username}`}
              alt={activeStory.author.displayName}
              className="w-8 h-8 rounded-full object-cover border border-white/60 group-hover:scale-105 transition-transform"
            />
            <div>
              <div className="flex items-center space-x-1">
                <p className="text-xs font-bold text-white leading-none">{activeStory.author.displayName}</p>
                {activeStory.author.verified && (
                  <VerifiedBadge size="xs" />
                )}
              </div>
              <p className="text-[10px] text-white/70">@{activeStory.author.username}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
            {(activeStory.mediaType === 'video' || activeStory.audio) && (
              <button
                type="button"
                onClick={() => {
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (videoRef.current) {
                    videoRef.current.muted = nextMuted;
                  }
                  if (audioRef.current) {
                    audioRef.current.muted = nextMuted;
                  }
                }}
                className="p-1.5 text-white/80 hover:text-white rounded-full bg-black/40 backdrop-blur-md cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}

            {isAuthor && (
              <button
                type="button"
                id="delete-story-btn"
                onClick={handleDeleteStory}
                disabled={isDeleting}
                className="p-1.5 text-white/80 hover:text-red-400 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 transition-colors disabled:opacity-50 cursor-pointer"
                title="Delete story"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              id="close-story-viewer-btn"
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Attached Audio Track Pill (Instagram Stories style) */}
        {activeStory.audio && (
          <div className="absolute top-16 left-3 z-30 flex items-center space-x-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-white text-[10px] font-semibold border border-white/20 shadow-md animate-fadeIn pointer-events-auto">
            <Music className="w-3 h-3 text-pink-400 animate-pulse shrink-0" />
            <span className="truncate max-w-[160px]">
              {activeStory.audio.title} • {activeStory.audio.artist}
            </span>
          </div>
        )}

        {/* Media Canvas */}
        <div className="w-full h-full flex items-center justify-center bg-zinc-950 relative overflow-hidden">
          {activeStory.mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={resolveVideoUrl(activeStory.mediaUrl)}
              autoPlay
              playsInline
              muted={isMuted}
              preload="auto"
              onTimeUpdate={() => {
                if (videoRef.current && videoRef.current.duration) {
                  const pct = (videoRef.current.currentTime / videoRef.current.duration) * 100;
                  setProgress(pct);
                }
              }}
              onEnded={() => {
                handleNextRef.current();
              }}
              onWaiting={() => setIsVideoBuffering(true)}
              onPlaying={() => setIsVideoBuffering(false)}
              onCanPlay={() => setIsVideoBuffering(false)}
              onError={(e) => {
                setIsVideoBuffering(false);
                const v = e.currentTarget;
                if (!v.dataset.fallbackTried) {
                  v.dataset.fallbackTried = 'true';
                  v.src = '/uploads/sample-ocean.mp4';
                  v.load();
                  v.play().catch(() => {});
                }
              }}
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={activeStory.mediaUrl}
              alt="Story"
              className="w-full h-full object-cover"
            />
          )}

          {/* Buffering Spinner */}
          {isVideoBuffering && activeStory.mediaType === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin shadow-md" />
            </div>
          )}

          {/* Pause indicator */}
          {isPaused && !showViewers && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-20">
              <div className="p-3 bg-black/60 rounded-full text-white backdrop-blur-md">
                <Pause className="w-6 h-6" />
              </div>
            </div>
          )}

          {/* Left / Right Tap zones for navigating stories */}
          <div 
            className="absolute left-0 top-16 bottom-20 w-1/4 z-10 cursor-pointer" 
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
          />
          <div 
            className="absolute right-0 top-16 bottom-20 w-1/4 z-10 cursor-pointer" 
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
          />
        </div>

        {/* Caption */}
        {activeStory.caption && (
          <div className="absolute bottom-16 left-4 right-4 z-20 p-2.5 bg-black/60 backdrop-blur-md rounded-2xl text-white text-xs leading-relaxed text-center pointer-events-none">
            {activeStory.caption}
          </div>
        )}

        {/* Floating Heart Burst Animation */}
        {showHeartBurst && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-40 animate-in zoom-in-50 fade-in duration-200">
            <div className="p-5 bg-black/40 backdrop-blur-sm rounded-full shadow-2xl animate-pulse">
              <Heart className="w-20 h-20 text-rose-500 fill-rose-500 drop-shadow-xl" />
            </div>
          </div>
        )}

        {/* Bottom Activity & Viewers Pill Bar */}
        <div 
          onClick={e => e.stopPropagation()}
          className="absolute bottom-3 left-3 right-3 z-30 flex items-center justify-between"
        >
          {/* Left: Viewers Pill & Likes Counter / Button */}
          <div className="flex items-center space-x-2">
            {/* Viewers Pill Trigger - Strictly visible only to the story author */}
            {isAuthor ? (
              <button
                type="button"
                id="story-viewers-toggle-btn"
                onClick={toggleOpenViewers}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 rounded-full text-white text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                title="Viewers of this story"
              >
                <Eye className="w-3.5 h-3.5 text-rose-400" />
                <span>
                  {viewsCount > 0 ? `${viewsCount} view${viewsCount === 1 ? '' : 's'}` : 'Viewers'}
                </span>
                {viewers.length > 0 && (
                  <div className="flex -space-x-1 ml-1">
                    {viewers.slice(0, 3).map(v => (
                      <img
                        key={v.id}
                        src={v.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${v.username}`}
                        alt={v.displayName}
                        className="w-4 h-4 rounded-full border border-black object-cover"
                      />
                    ))}
                  </div>
                )}
              </button>
            ) : null}

            {/* Like Option: Authors see like count, Viewers see interactive Like button */}
            {isAuthor ? (
              <div 
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-black/60 backdrop-blur-md border border-white/20 rounded-full text-white text-xs font-semibold shadow-lg"
                title={`${likesCount} story likes`}
              >
                <Heart className={`w-3.5 h-3.5 ${likesCount > 0 ? 'text-rose-500 fill-rose-500' : 'text-white/70'}`} />
                <span>{likesCount}</span>
              </div>
            ) : (
              <button
                type="button"
                id="story-like-btn"
                onClick={handleToggleLike}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 backdrop-blur-md border rounded-full text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg ${
                  isLiked 
                    ? 'bg-rose-500/25 border-rose-500/60 text-white' 
                    : 'bg-black/60 hover:bg-black/80 border-white/20 text-white'
                }`}
                title={isLiked ? 'Unlike story' : 'Like story'}
              >
                <Heart className={`w-4 h-4 transition-transform ${isLiked ? 'text-rose-500 fill-rose-500 scale-110' : 'text-white'}`} />
                <span>{isLiked ? (likesCount > 1 ? `${likesCount} Likes` : 'Liked') : (likesCount > 0 ? `${likesCount}` : 'Like')}</span>
              </button>
            )}
          </div>

          {/* Navigation Controls */}
          {stories.length > 1 && (
            <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-md rounded-full px-2 py-1 border border-white/10">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="p-1 text-white disabled:opacity-30 hover:text-white transition-opacity"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] text-white/80 font-mono px-1">
                {currentIndex + 1}/{stories.length}
              </span>
              <button
                type="button"
                onClick={handleNext}
                disabled={currentIndex === stories.length - 1}
                className="p-1 text-white disabled:opacity-30 hover:text-white transition-opacity"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Viewers Modal / Drawer Sheet - Only accessible by the author */}
        {isAuthor && showViewers && (
          <div 
            onClick={e => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[60%] bg-zinc-900/95 backdrop-blur-xl rounded-t-3xl border-t border-white/15 z-40 flex flex-col p-4 shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-white" />
                <h3 className="text-xs font-bold text-white">Story Viewers</h3>
                <span className="px-2 py-0.5 bg-white/10 text-white text-[10px] font-bold rounded-full">
                  {viewers.length}
                </span>
              </div>
              <button
                type="button"
                id="close-viewers-modal-btn"
                onClick={() => setShowViewers(false)}
                className="p-1 text-white/70 hover:text-white rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Viewers List */}
            <div className="flex-1 overflow-y-auto py-2 space-y-2.5 max-h-[260px] pr-1">
              {viewersLoading ? (
                <div className="py-8 text-center text-xs text-white/50">
                  Loading viewers...
                </div>
              ) : viewers.length === 0 ? (
                <div className="py-8 text-center space-y-1">
                  <p className="text-xs text-white/80 font-medium">No viewers yet</p>
                  <p className="text-[10px] text-white/50">When users watch this story, they will appear here in real time.</p>
                </div>
              ) : (
                viewers.map(viewer => (
                  <div
                    key={viewer.id}
                    className="flex items-center justify-between p-1.5 hover:bg-white/5 rounded-xl transition-colors"
                  >
                    <div
                      onClick={() => {
                        setShowViewers(false);
                        onClose();
                        onSelectUser(viewer.username);
                      }}
                      className="flex items-center space-x-2.5 cursor-pointer min-w-0"
                    >
                      <img
                        src={viewer.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${viewer.username}`}
                        alt={viewer.displayName}
                        className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1">
                          <p className="text-xs font-bold text-white truncate">{viewer.displayName}</p>
                          {viewer.verified && (
                            <VerifiedBadge size="xs" />
                          )}
                        </div>
                        <p className="text-[10px] text-white/60 truncate">@{viewer.username}</p>
                      </div>
                    </div>

                    {currentUser?.id !== viewer.id && (
                      <FollowButton targetUserId={viewer.id} size="sm" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
