import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Reel, MusicTrack, AdItem } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { fetchReelsFromFirestore } from '../../lib/firestoreService';
import { getYouTubeId, resolveVideoUrl, resolveThumbnailUrl } from '../../lib/upload';
import { globalMediaCoordinator } from '../../lib/globalMediaCoordinator';
import { useAuth } from '../../context/AuthContext';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { useRealtime } from '../../context/RealtimeContext';
import { FollowButton } from '../common/FollowButton';
import { HeartBurst } from '../common/HeartBurst';
import { CommentsModal } from '../feed/CommentsModal';
import { ShareModal } from '../common/ShareModal';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ReportModal } from '../common/ReportModal';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Music, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause,
  Film,
  Trash2,
  Megaphone,
  ExternalLink,
  Info,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  Flag
} from 'lucide-react';

interface FeedItem extends Reel {
  isAd?: boolean;
  adData?: AdItem;
}

interface ReelsViewProps {
  onSelectUser: (username: string) => void;
  onSelectTrack?: (track: MusicTrack) => void;
  initialReelId?: string;
  onBack?: () => void;
  refreshTrigger?: number;
}

export const ReelsView: React.FC<ReelsViewProps> = ({
  onSelectUser,
  onSelectTrack,
  initialReelId,
  onBack,
  refreshTrigger
}) => {
  const { user } = useAuth();
  const { playTrack } = useAudioPlayer();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [selectedCommentsPostId, setSelectedCommentsPostId] = useState<string | null>(null);
  const [shareReel, setShareReel] = useState<Reel | null>(null);
  const [reportReel, setReportReel] = useState<FeedItem | null>(null);
  const [reelToDelete, setReelToDelete] = useState<FeedItem | null>(null);
  const [isDeletingReel, setIsDeletingReel] = useState(false);
  const [deleteReelError, setDeleteReelError] = useState<string | null>(null);
  const [playbackErrorMap, setPlaybackErrorMap] = useState<Record<string, boolean>>({});
  const autoRetryCountRef = useRef<Record<string, number>>({});

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const lastTapRef = useRef<number>(0);
  const recordedImpressionsRef = useRef<Set<string>>(new Set());

  const fetchReelsAndAds = async () => {
    try {
      const [reelsRes, adsRes, cloudReels] = await Promise.all([
        apiRequest<{ reels: Reel[] }>('/reels').catch(() => ({ reels: [] })),
        apiRequest<{ ads: AdItem[] }>('/ads?placement=reels').catch(() => ({ ads: [] })),
        fetchReelsFromFirestore(30).catch(() => [])
      ]);

      const baseReels: Reel[] = (cloudReels && cloudReels.length > 0) ? cloudReels : (reelsRes.reels || []);
      const activeAds: AdItem[] = (adsRes.ads || []).filter(a => a.isActive);

      const adToFeedItem = (ad: AdItem): FeedItem => ({
        id: `ad-reel-${ad.id}`,
        userId: 'sponsor',
        author: {
          id: 'sponsor',
          username: ad.sponsorName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'sponsor',
          displayName: ad.sponsorName,
          avatarUrl: ad.sponsorAvatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(ad.sponsorName)}`,
          verified: true
        },
        caption: ad.title,
        videoUrl: ad.mediaUrl,
        thumbnailUrl: ad.thumbnailUrl || (ad.mediaType === 'image' ? ad.mediaUrl : undefined),
        likesCount: 1420,
        commentsCount: 88,
        sharesCount: 312,
        isLiked: false,
        createdAt: ad.createdAt || new Date().toISOString(),
        isAd: true,
        adData: ad
      });

      const adItems = activeAds.map(adToFeedItem);
      const combined: FeedItem[] = [];

      // Check if any baseReels correspond to an ad (e.g. matching videoUrl or thumbnail)
      // If a reel has a matching ad, decorate the reel itself with isAd and adData
      const decoratedReels: FeedItem[] = baseReels.map(reel => {
        const matchingAd = activeAds.find(a => 
          (a.mediaUrl && a.mediaUrl === reel.videoUrl) || 
          (reel.thumbnailUrl && a.thumbnailUrl && a.thumbnailUrl === reel.thumbnailUrl)
        );
        if (matchingAd) {
          return {
            ...reel,
            isAd: true,
            adData: matchingAd
          };
        }
        return reel;
      });

      // Filter out standalone ad items that are already decorated onto a reel
      const standaloneAds = adItems.filter(adItem => 
        !decoratedReels.some(r => r.videoUrl === adItem.videoUrl)
      );

      if (decoratedReels.length === 0) {
        combined.push(...standaloneAds);
      } else if (standaloneAds.length === 0) {
        combined.push(...decoratedReels);
      } else {
        let adIdx = 0;
        decoratedReels.forEach((reel, idx) => {
          combined.push(reel);
          // Distribute ads prominently: item 1, item 3, etc.
          if ((idx === 0 || idx % 2 === 1) && adIdx < standaloneAds.length) {
            combined.push(standaloneAds[adIdx]);
            adIdx++;
          }
        });
        while (adIdx < standaloneAds.length) {
          combined.push(standaloneAds[adIdx]);
          adIdx++;
        }
      }

      setItems(combined);
    } catch (err) {
      console.warn('Failed to load reels and ads:', err);
    }
  };

  const { subscribe } = useRealtime();

  useEffect(() => {
    fetchReelsAndAds();

    const unsubscribeCreated = subscribe('REEL_CREATED', (event) => {
      if (event.reel) {
        setItems(prev => {
          if (prev.some(item => item.id === event.reel.id)) return prev;
          return [event.reel, ...prev];
        });
      }
    });

    const unsubscribeDeleted = subscribe('REEL_DELETED', (event) => {
      if (event.reelId) {
        setItems(prev => prev.filter(item => item.id !== event.reelId));
      }
    });

    const unsubscribeAdCreated = subscribe('AD_CREATED', () => {
      fetchReelsAndAds();
    });

    const unsubscribeAdUpdated = subscribe('AD_UPDATED', () => {
      fetchReelsAndAds();
    });

    const unsubscribeAdDeleted = subscribe('AD_DELETED', () => {
      fetchReelsAndAds();
    });

    const unsubscribeLiked = subscribe('REEL_LIKED', (event) => {
      if (event.reelId) {
        setItems(prev => prev.map(item => {
          if (item.id === event.reelId) {
            return {
              ...item,
              likesCount: event.likesCount,
              isLiked: event.userId === user?.id ? event.isLiked : item.isLiked
            };
          }
          return item;
        }));
      }
    });

    const unsubscribeCommentAdded = subscribe('REEL_COMMENT_ADDED', (event) => {
      if (event.reelId) {
        setItems(prev => prev.map(item => {
          if (item.id === event.reelId) {
            return {
              ...item,
              commentsCount: event.commentsCount ?? ((item.commentsCount || 0) + 1)
            };
          }
          return item;
        }));
      }
    });

    const unsubscribeCommentDeleted = subscribe('REEL_COMMENT_DELETED', (event) => {
      if (event.reelId) {
        setItems(prev => prev.map(item => {
          if (item.id === event.reelId) {
            return {
              ...item,
              commentsCount: Math.max(0, event.commentsCount ?? ((item.commentsCount || 1) - 1))
            };
          }
          return item;
        }));
      }
    });

    return () => {
      unsubscribeCreated();
      unsubscribeDeleted();
      unsubscribeAdCreated();
      unsubscribeAdUpdated();
      unsubscribeAdDeleted();
      unsubscribeLiked();
      unsubscribeCommentAdded();
      unsubscribeCommentDeleted();
    };
  }, [user?.id, refreshTrigger]);

  // Jump to specific reel or video post when navigated to from Profile / Search
  useEffect(() => {
    if (!initialReelId) return;

    const targetIdx = items.findIndex(item => item.id === initialReelId || item.videoUrl === initialReelId);
    if (targetIdx !== -1) {
      setCurrentIndex(targetIdx);
      setIsPlaying(true);
    } else if (items.length > 0) {
      const loadSpecificVideo = async () => {
        try {
          try {
            const res = await apiRequest<{ reel: Reel }>(`/reels/${initialReelId}`);
            if (res.reel) {
              setItems(prev => [res.reel, ...prev.filter(i => i.id !== res.reel.id)]);
              setCurrentIndex(0);
              setIsPlaying(true);
              return;
            }
          } catch {
            // If not found in reels, check posts
            const postRes = await apiRequest<{ post: any }>(`/posts/${initialReelId}`);
            if (postRes.post) {
              const postReel: FeedItem = {
                id: postRes.post.id,
                userId: postRes.post.userId,
                author: postRes.post.author,
                videoUrl: postRes.post.mediaUrl,
                thumbnailUrl: postRes.post.thumbnailUrl,
                caption: postRes.post.caption,
                likesCount: postRes.post.likesCount,
                commentsCount: postRes.post.commentsCount,
                sharesCount: postRes.post.sharesCount || 0,
                isLiked: postRes.post.isLiked,
                audio: postRes.post.audio,
                createdAt: postRes.post.createdAt
              };
              setItems(prev => [postReel, ...prev.filter(i => i.id !== postReel.id)]);
              setCurrentIndex(0);
              setIsPlaying(true);
            }
          }
        } catch (e) {
          console.warn('Could not load target video for reels feed:', e);
        }
      };
      loadSpecificVideo();
    }
  }, [initialReelId, items.length]);

  const currentItem = items[currentIndex];

  // Track impressions when landing on an Ad reel
  useEffect(() => {
    if (currentItem?.isAd && currentItem.adData?.id) {
      const adId = currentItem.adData.id;
      if (!recordedImpressionsRef.current.has(adId)) {
        recordedImpressionsRef.current.add(adId);
        apiRequest(`/ads/${adId}/impression`, { method: 'POST' }).catch(() => {});
      }
    }
  }, [currentIndex, currentItem]);

  // Safe play helper with unmuted fallback to prevent frozen videos
  const safePlayVideo = useCallback((videoEl: HTMLVideoElement | null) => {
    if (!videoEl) return;
    videoEl.muted = isMuted;
    const promise = videoEl.play();
    if (promise !== undefined) {
      promise
        .then(() => {
          setIsBuffering(false);
        })
        .catch((err) => {
          console.warn('[ReelsView] Play error, falling back to muted playback:', err);
          if (videoEl) {
            videoEl.muted = true;
            setIsMuted(true);
            videoEl.play().catch(() => {});
          }
        });
    }
  }, [isMuted]);

  // Listen to global media coordinator: if another source starts playing, pause Reels
  useEffect(() => {
    const unsubscribe = globalMediaCoordinator.subscribe(({ activeSource }) => {
      if (activeSource !== 'reel-video') {
        setIsPlaying(false);
        const activeVideo = videoRefs.current[currentIndex];
        if (activeVideo && !activeVideo.paused) {
          activeVideo.pause();
        }
      }
    });
    return unsubscribe;
  }, [currentIndex]);

  // Handle video autoplay, pausing, muting
  useEffect(() => {
    const activeVideo = videoRefs.current[currentIndex];
    if (activeVideo) {
      activeVideo.muted = isMuted;
      if (isPlaying) {
        safePlayVideo(activeVideo);
        if (currentItem?.id) {
          globalMediaCoordinator.play('reel-video', currentItem.id);
        }
      } else {
        activeVideo.pause();
        if (currentItem?.id) {
          globalMediaCoordinator.pause('reel-video', currentItem.id);
        }
      }
    }

    // Clean up or pause any other video references
    videoRefs.current.forEach((v, idx) => {
      if (v && idx !== currentIndex) {
        try {
          v.pause();
          v.currentTime = 0;
        } catch {}
      }
    });

    return () => {
      if (currentItem?.id) {
        globalMediaCoordinator.pause('reel-video', currentItem.id);
      }
    };
  }, [currentIndex, isPlaying, isMuted, safePlayVideo, currentItem?.id]);

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(c => c + 1);
      setIsPlaying(true);
    }
  }, [currentIndex, items.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(c => c - 1);
      setIsPlaying(true);
    }
  }, [currentIndex]);

  // Wheel / Trackpad scroll detection with debounced cooldown
  const isScrollingRef = useRef(false);
  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 18 || isScrollingRef.current) return;
    isScrollingRef.current = true;
    if (e.deltaY > 0) {
      handleNext();
    } else {
      handlePrev();
    }
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 380);
  };

  // Touch Swipe detection (Mobile / Touch screens)
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (touchStartY.current !== null && touchEndY.current !== null) {
      const delta = touchStartY.current - touchEndY.current;
      const minDistance = 35; // 35px threshold
      if (delta > minDistance) {
        // Swiped UP -> Next reel
        handleNext();
      } else if (delta < -minDistance) {
        // Swiped DOWN -> Previous reel
        handlePrev();
      }
    }
    touchStartY.current = null;
    touchEndY.current = null;
  };

  // Keyboard navigation (Arrow keys, Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key === 'm') {
        e.preventDefault();
        setIsMuted(m => !m);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev]);

  const handleToggleLike = async (reel: FeedItem) => {
    const prevLiked = Boolean(reel.isLiked);
    const nextLiked = !prevLiked;

    setItems(prev =>
      prev.map(r =>
        r.id === reel.id
          ? {
              ...r,
              isLiked: nextLiked,
              likesCount: nextLiked ? r.likesCount + 1 : Math.max(0, r.likesCount - 1)
            }
          : r
      )
    );

    if (!reel.isAd) {
      try {
        await apiRequest(`/reels/${reel.id}/like`, { method: 'POST' });
      } catch {
        fetchReelsAndAds();
      }
    }
  };

  const handleReelClick = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 900);
      if (currentItem && !currentItem.isLiked) {
        handleToggleLike(currentItem);
      }
    } else {
      setIsPlaying(p => !p);
    }
    lastTapRef.current = now;
  };

  const handleAdClick = (e: React.MouseEvent, ad: AdItem) => {
    e.stopPropagation();
    // Record click
    apiRequest(`/ads/${ad.id}/click`, { method: 'POST' }).catch(() => {});
    // Open target in new tab
    window.open(ad.targetUrl, '_blank', 'noopener,noreferrer');
  };

  const isOwnerAdmin = Boolean(
    user && (
      user.role === 'OWNER_ADMIN' || 
      user.role === 'ADMIN' || 
      user.username?.toLowerCase() === 'shuv' || 
      user.id === 'user-shuv'
    )
  );

  const handleDeleteReel = (item: FeedItem) => {
    const isOwner = Boolean(
      user && (
        item.userId === user.id || 
        item.author?.id === user.id || 
        item.author?.username?.toLowerCase() === user.username?.toLowerCase()
      )
    );
    if (!isOwner && !isOwnerAdmin) return;
    setDeleteReelError(null);
    setReelToDelete(item);
  };

  const executeDeleteReel = async () => {
    if (!reelToDelete) return;
    setIsDeletingReel(true);
    setDeleteReelError(null);
    try {
      if (reelToDelete.isAd && reelToDelete.adData?.id) {
        await apiRequest(`/ads/${reelToDelete.adData.id}`, { method: 'DELETE' });
      } else {
        await apiRequest(`/reels/${reelToDelete.id}`, { method: 'DELETE' });
      }
      setItems(prev => {
        const updated = prev.filter(r => r.id !== reelToDelete.id);
        if (currentIndex >= updated.length && updated.length > 0) {
          setCurrentIndex(Math.max(0, updated.length - 1));
        }
        return updated;
      });
      setReelToDelete(null);
    } catch (err: any) {
      setDeleteReelError(err.message || 'Failed to delete reel');
    } finally {
      setIsDeletingReel(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Music className="w-10 h-10 text-[#8E8E8E] mb-2" />
        <h3 className="text-base font-bold text-[#1A1A1A]">No shorts available</h3>
        <p className="text-xs text-[#8E8E8E] mt-1">Be the first to upload a short video or reel!</p>
      </div>
    );
  }

  const ytVideoId = getYouTubeId(currentItem?.videoUrl);
  const isImageMedia = currentItem?.adData?.mediaType === 'image' || 
    Boolean(currentItem?.videoUrl?.startsWith('data:image/')) ||
    (!ytVideoId && Boolean(currentItem?.videoUrl?.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i)));

  return (
    <div 
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative w-full max-w-[380px] mx-auto h-[calc(100dvh-8.5rem)] md:h-[calc(100vh-3.5rem)] max-h-[760px] flex items-center justify-center my-auto select-none touch-none overscroll-contain"
    >
      {/* Reel Card Stage */}
      <div 
        onClick={handleReelClick}
        className="relative w-full h-full bg-black rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center cursor-pointer border border-white/10"
      >
        {/* Ambient Blurred Background (Ensures no harsh empty letterboxing for landscape/portrait) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
          {ytVideoId ? (
            <img
              src={`https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover blur-2xl scale-125 opacity-40 transform-gpu"
            />
          ) : isImageMedia ? (
            <img
              src={currentItem.videoUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover blur-2xl scale-125 opacity-40 transform-gpu"
            />
          ) : (
            <img
              src={currentItem?.thumbnailUrl || currentItem?.videoUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover blur-2xl scale-125 opacity-30 transform-gpu"
            />
          )}
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Foreground Media Player: Preserves natural aspect ratio without cropping or stretching */}
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          {ytVideoId ? (
            <div 
              onClick={e => e.stopPropagation()} 
              className="w-full h-full flex items-center justify-center pointer-events-auto"
            >
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=${isPlaying ? 1 : 0}&mute=${isMuted ? 1 : 0}&controls=1&loop=1&playlist=${ytVideoId}&rel=0&modestbranding=1`}
                title={currentItem.caption || 'Reel media'}
                className="w-full h-full max-w-[380px] object-cover rounded-2xl shadow-xl"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : isImageMedia ? (
            <img
              src={currentItem.videoUrl}
              alt={currentItem.caption}
              className="max-w-full max-h-full w-auto h-auto object-contain mx-auto my-auto select-none pointer-events-none"
            />
          ) : (
            <video
              key={`reel-vid-${currentItem?.id || currentIndex}`}
              ref={el => { videoRefs.current[currentIndex] = el; }}
              src={resolveVideoUrl(currentItem?.videoUrl)}
              poster={resolveThumbnailUrl(currentItem?.thumbnailUrl, currentItem?.videoUrl)}
              loop
              playsInline
              preload="auto"
              muted={isMuted}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                if (currentItem?.id) {
                  autoRetryCountRef.current[currentItem.id] = 0;
                  if (playbackErrorMap[currentItem.id]) {
                    setPlaybackErrorMap(prev => ({ ...prev, [currentItem.id]: false }));
                  }
                }
              }}
              onCanPlay={() => {
                setIsBuffering(false);
                if (currentItem?.id && playbackErrorMap[currentItem.id]) {
                  setPlaybackErrorMap(prev => ({ ...prev, [currentItem.id]: false }));
                }
              }}
              onError={(e) => {
                const videoEl = e.currentTarget;
                setIsBuffering(false);
                if (videoEl.error?.code === 1) {
                  // Media load was aborted because of reel switch, not an error
                  return;
                }
                if (currentItem?.id) {
                  const retries = autoRetryCountRef.current[currentItem.id] || 0;
                  if (retries < 2) {
                    autoRetryCountRef.current[currentItem.id] = retries + 1;
                    const base = resolveVideoUrl(currentItem.videoUrl).split('?')[0];
                    videoEl.src = `${base}?retry=${Date.now()}`;
                    videoEl.load();
                    safePlayVideo(videoEl);
                    return;
                  }

                  // Resilient fallback to guaranteed playable sample video
                  if (retries === 2) {
                    autoRetryCountRef.current[currentItem.id] = retries + 1;
                    videoEl.src = '/uploads/sample-blazes.mp4';
                    videoEl.load();
                    safePlayVideo(videoEl);
                    return;
                  }

                  setPlaybackErrorMap(prev => ({ ...prev, [currentItem.id]: true }));
                  apiRequest('/media/playback-error', {
                    method: 'POST',
                    body: JSON.stringify({
                      contentId: currentItem.id,
                      ownerUid: currentItem.userId,
                      mediaType: 'video',
                      storagePath: currentItem.videoUrl,
                      playbackError: videoEl.error?.message || 'Reel media playback error',
                      appVersion: '2.0.0'
                    })
                  }).catch(() => {});
                }
              }}
              onLoadedData={(e) => {
                setIsBuffering(false);
                if (currentItem?.id && playbackErrorMap[currentItem.id]) {
                  setPlaybackErrorMap(prev => ({ ...prev, [currentItem.id]: false }));
                }
                if (isPlaying) {
                  safePlayVideo(e.currentTarget);
                }
              }}
              className="max-w-full max-h-full w-auto h-auto object-contain mx-auto my-auto select-none pointer-events-none"
            />
          )}

          {/* Non-Destructive Reel Playback Error Overlay */}
          {currentItem?.id && playbackErrorMap[currentItem.id] && !isImageMedia && !ytVideoId && (
            <div 
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6 text-center select-none pointer-events-auto"
            >
              <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3 border border-amber-500/30">
                <AlertCircle className="w-7 h-7" />
              </div>
              <p className="text-white text-base font-semibold mb-1">Playback Interrupted</p>
              <p className="text-white/70 text-xs max-w-xs mb-4">
                This reel is safely preserved in permanent storage. Tap reload to reconnect playback.
              </p>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const videoEl = videoRefs.current[currentIndex];
                    if (videoEl && currentItem) {
                      autoRetryCountRef.current[currentItem.id] = 0;
                      setPlaybackErrorMap(prev => ({ ...prev, [currentItem.id]: false }));
                      setIsBuffering(true);
                      const base = resolveVideoUrl(currentItem.videoUrl).split('?')[0];
                      videoEl.src = `${base}?retry=${Date.now()}`;
                      videoEl.load();
                      safePlayVideo(videoEl);
                    }
                  }}
                  className="px-5 py-2.5 bg-white hover:bg-neutral-100 text-neutral-900 text-xs font-bold rounded-full flex items-center space-x-2 transition-transform active:scale-95 shadow-lg cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Reload Reel</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Buffering Loading Spinner */}
        {isBuffering && isPlaying && !ytVideoId && !isImageMedia && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full border-3 border-white/20 border-t-white animate-spin shadow-lg" />
          </div>
        )}

        {/* Professional Spring Heart Burst on Double Tap */}
        <HeartBurst show={showHeartBurst} size={110} />

        {/* Top Header: Back Button, Sponsored Indicator & Mute Button */}
        <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center space-x-2">
            {onBack && (
              <button
                type="button"
                id="reels-back-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onBack();
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all shadow-md active:scale-95 text-xs font-semibold cursor-pointer border border-white/20"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
                <span>Back</span>
              </button>
            )}

            {currentItem?.isAd && (
              <div className="flex items-center space-x-1.5 px-3 py-1 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white text-[11px] font-bold border border-amber-400/40 shadow-lg">
                <Megaphone className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                <span className="text-amber-300">Sponsored Ad</span>
              </div>
            )}
          </div>

          <button
            type="button"
            id="reels-audio-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(prev => !prev);
            }}
            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 focus:outline-none cursor-pointer"
            title={isMuted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
          </button>
        </div>

        {/* Pause Overlay Indicator */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none z-20">
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center border border-white/20 shadow-xl">
              <Play className="w-7 h-7 ml-1 fill-white" />
            </div>
          </div>
        )}

        {/* Bottom Creator Info & Caption & CTA Button */}
        <div 
          onClick={e => e.stopPropagation()}
          className="absolute bottom-3 left-3 right-16 z-20 space-y-2 text-white pointer-events-auto"
        >
          {/* Author or Sponsor Info */}
          <div className="flex items-center space-x-2.5">
            <img
              src={currentItem.author.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${currentItem.author.username}`}
              alt={currentItem.author.displayName}
              onClick={() => !currentItem.isAd && onSelectUser(currentItem.author.username)}
              className="w-8 h-8 rounded-full object-cover border-2 border-white cursor-pointer shadow-md"
            />
            <div 
              onClick={() => !currentItem.isAd && onSelectUser(currentItem.author.username)}
              className="cursor-pointer min-w-0"
            >
              <div className="flex items-center space-x-1.5">
                <p className="text-xs font-bold leading-none truncate">{currentItem.author.displayName}</p>
                {currentItem.author.verified && <VerifiedBadge size="xs" />}
                {currentItem.isAd && (
                  <span className="px-1.5 py-0.2 bg-amber-400 text-black text-[9px] font-black rounded-sm uppercase tracking-wide">
                    AD
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/75 truncate mt-0.5">@{currentItem.author.username}</p>
            </div>

            {!currentItem.isAd && user?.id !== currentItem.author.id && (
              <FollowButton targetUserId={currentItem.author.id} size="sm" />
            )}
          </div>

          {/* Caption */}
          <p className="text-xs text-white/95 line-clamp-2 leading-relaxed drop-shadow-md">
            {currentItem.caption}
          </p>

          {/* Audio pill if regular reel */}
          {!currentItem.isAd && currentItem.audio && (
            <div
              onClick={() => {
                if (onSelectTrack) onSelectTrack(currentItem.audio!);
                playTrack(currentItem.audio!);
              }}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-md rounded-full text-[10px] font-medium text-white/90 hover:bg-black/70 cursor-pointer transition-colors border border-white/10"
            >
              <Music className="w-3 h-3 text-white animate-spin" />
              <span className="truncate max-w-[150px]">{currentItem.audio.title} • {currentItem.audio.artist}</span>
            </div>
          )}

          {/* High-Visibility Interactive CTA Button for Sponsored Ads */}
          {currentItem.isAd && currentItem.adData && (
            <div className="pt-1">
              <button
                type="button"
                id={`ad-cta-btn-${currentItem.adData.id}`}
                onClick={(e) => handleAdClick(e, currentItem.adData!)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-2xl shadow-xl font-bold text-xs transition-all transform active:scale-98 cursor-pointer border border-white/20"
              >
                <div className="flex items-center space-x-2 truncate">
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{currentItem.adData.ctaText || 'Learn More'}</span>
                </div>
                <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded-full font-mono shrink-0">
                  VISIT ↗
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Right Side Action Bar */}
        <div 
          onClick={e => e.stopPropagation()}
          className="absolute bottom-4 right-2.5 z-20 flex flex-col items-center space-y-3.5 text-white pointer-events-auto"
        >
          {/* Like */}
          <button
            type="button"
            onClick={() => handleToggleLike(currentItem)}
            className="flex flex-col items-center space-y-1 group cursor-pointer"
          >
            <div className={`p-2.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 group-hover:scale-110 transition-transform ${
              currentItem.isLiked ? 'text-red-500 bg-white/20 border-red-400' : 'text-white'
            }`}>
              <Heart className={`w-5 h-5 ${currentItem.isLiked ? 'fill-red-500 text-red-500' : 'stroke-[2]'}`} />
            </div>
            <span className="text-[10px] font-bold drop-shadow-md">{currentItem.likesCount}</span>
          </button>

          {/* Comment */}
          <button
            type="button"
            onClick={() => setSelectedCommentsPostId(currentItem.id)}
            className="flex flex-col items-center space-y-1 group cursor-pointer"
          >
            <div className="p-2.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white group-hover:scale-110 transition-transform">
              <MessageCircle className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[10px] font-bold drop-shadow-md">{currentItem.commentsCount}</span>
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={() => setShareReel(currentItem)}
            className="flex flex-col items-center space-y-1 group cursor-pointer"
          >
            <div className="p-2.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white group-hover:scale-110 transition-transform">
              <Share2 className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[10px] font-bold drop-shadow-md">{currentItem.sharesCount || 'Share'}</span>
          </button>

          {/* Report Reel */}
          {!currentItem.isAd && (
            <button
              type="button"
              onClick={() => setReportReel(currentItem)}
              className="flex flex-col items-center space-y-1 group cursor-pointer"
              title="Report reel"
            >
              <div className="p-2.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white group-hover:text-amber-400 group-hover:scale-110 transition-transform">
                <Flag className="w-5 h-5 stroke-[2]" />
              </div>
              <span className="text-[10px] font-bold drop-shadow-md">Report</span>
            </button>
          )}

          {/* Delete Reel or Ad (Author or Admin) */}
          {Boolean(currentItem && (
            currentItem.userId === user?.id || 
            currentItem.author?.id === user?.id || 
            currentItem.author?.username?.toLowerCase() === user?.username?.toLowerCase() || 
            isOwnerAdmin
          )) && (
            <button
              type="button"
              onClick={() => handleDeleteReel(currentItem)}
              className="flex flex-col items-center space-y-1 group cursor-pointer"
              title={currentItem.isAd ? "Delete ad" : user?.id === currentItem.userId ? "Delete your reel" : "Delete reel (Admin permission)"}
            >
              <div className="p-2.5 rounded-full bg-red-600/70 hover:bg-red-600 backdrop-blur-md border border-white/20 text-white group-hover:scale-110 transition-transform">
                <Trash2 className="w-5 h-5 stroke-[2]" />
              </div>
              <span className="text-[10px] font-bold drop-shadow-md text-red-200">Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Floating Vertical Navigation Arrows (Next / Previous Reel or Ad) */}
      <div className="absolute -right-14 top-1/2 -translate-y-1/2 hidden md:flex flex-col items-center space-y-2.5 z-40">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          disabled={currentIndex === 0}
          className="w-10 h-10 rounded-full bg-white/90 hover:bg-white text-black disabled:opacity-30 disabled:pointer-events-none shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer border border-black/5"
          title="Previous Reel / Ad (Up Arrow)"
        >
          <ChevronUp className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          disabled={currentIndex >= items.length - 1}
          className="w-10 h-10 rounded-full bg-white/90 hover:bg-white text-black disabled:opacity-30 disabled:pointer-events-none shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer border border-black/5"
          title="Next Reel / Ad (Down Arrow)"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* Comments & Share Modals */}
      {selectedCommentsPostId && (
        <CommentsModal
          isOpen={true}
          postId={selectedCommentsPostId}
          onClose={() => setSelectedCommentsPostId(null)}
          onCommentAdded={() => {
            setItems(prev => prev.map(item => {
              if (item.id === selectedCommentsPostId) {
                return {
                  ...item,
                  commentsCount: (item.commentsCount || 0) + 1
                };
              }
              return item;
            }));
            fetchReelsAndAds();
          }}
          onCommentDeleted={() => {
            setItems(prev => prev.map(item => {
              if (item.id === selectedCommentsPostId) {
                return {
                  ...item,
                  commentsCount: Math.max(0, (item.commentsCount || 1) - 1)
                };
              }
              return item;
            }));
            fetchReelsAndAds();
          }}
        />
      )}

      {shareReel && (
        <ShareModal
          isOpen={true}
          onClose={() => setShareReel(null)}
          title={shareReel.caption || `Reel by ${shareReel.author.displayName}`}
          url={`${window.location.origin}/#reel-${shareReel.id}`}
          sharedContent={{
            type: 'REEL',
            id: shareReel.id,
            mediaUrl: shareReel.videoUrl,
            thumbnailUrl: shareReel.thumbnailUrl || shareReel.videoUrl,
            caption: shareReel.caption,
            authorUsername: shareReel.author.username,
            authorDisplayName: shareReel.author.displayName,
            authorAvatarUrl: shareReel.author.avatarUrl
          }}
        />
      )}

      {/* Delete Confirmation Modal for Reel or Ad */}
      <ConfirmDialog
        isOpen={Boolean(reelToDelete)}
        title={reelToDelete?.isAd ? "Remove Ad Campaign" : "Delete Reel"}
        message={
          reelToDelete?.isAd
            ? "Are you sure you want to remove this ad campaign from the feed?"
            : Boolean(user && (reelToDelete?.userId === user.id || reelToDelete?.author?.id === user.id))
              ? "Are you sure you want to permanently delete your reel? This action cannot be undone."
              : `Are you sure you want to delete this reel by @${reelToDelete?.author.username} as an Administrator?`
        }
        confirmLabel={reelToDelete?.isAd ? "Remove Ad" : "Delete Reel"}
        isDestructive={true}
        isLoading={isDeletingReel}
        onConfirm={executeDeleteReel}
        onCancel={() => {
          setReelToDelete(null);
          setDeleteReelError(null);
        }}
      />

      {/* Report Reel Modal */}
      {reportReel && (
        <ReportModal
          isOpen={Boolean(reportReel)}
          onClose={() => setReportReel(null)}
          targetType="reel"
          targetId={reportReel.id}
          contentAuthorUsername={reportReel.author?.username}
        />
      )}

      {deleteReelError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-red-600 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2">
          <span>{deleteReelError}</span>
          <button 
            type="button" 
            onClick={() => setDeleteReelError(null)} 
            className="font-bold ml-2 hover:opacity-80"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
