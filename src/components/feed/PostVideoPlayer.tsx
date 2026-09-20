import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Play, Pause, Maximize2, RotateCcw, AlertCircle, RefreshCw } from 'lucide-react';
import { useVideoPlayback } from '../../context/VideoPlaybackContext';
import { getYouTubeId, resolveVideoUrl, resolveThumbnailUrl } from '../../lib/upload';
import { apiRequest } from '../../lib/api';
import { globalMediaCoordinator } from '../../lib/globalMediaCoordinator';

interface PostVideoPlayerProps {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  className?: string;
  onDoubleTap?: () => void;
  onDimensionsLoaded?: (width: number, height: number, duration: number) => void;
}

export const PostVideoPlayer: React.FC<PostVideoPlayerProps> = ({
  id,
  videoUrl,
  thumbnailUrl,
  className = '',
  onDoubleTap,
  onDimensionsLoaded
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const manuallyPausedRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<any>(null);

  const { activeVideoId, setActiveVideoId, isGlobalMuted, toggleGlobalMute } = useVideoPlayback();

  // Robust URLs
  const initialSafeUrl = resolveVideoUrl(videoUrl);
  const safePoster = resolveThumbnailUrl(thumbnailUrl, videoUrl);

  const [currentSrc, setCurrentSrc] = useState(initialSafeUrl);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const autoRetryCountRef = useRef(0);

  const isCurrentActive = activeVideoId === id;
  const ytVideoId = getYouTubeId(videoUrl);

  // Keep currentSrc in sync if prop changes
  useEffect(() => {
    const nextUrl = resolveVideoUrl(videoUrl);
    setCurrentSrc(nextUrl);
    setHasError(false);
    setIsLoaded(false);
  }, [videoUrl]);

  // Sync mute state with global mute context
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isGlobalMuted;
    }
  }, [isGlobalMuted]);

  // Listen to global media coordinator: if another source starts playing, pause this video
  useEffect(() => {
    const unsubscribe = globalMediaCoordinator.subscribe(({ activeSource, activeId }) => {
      if (activeSource !== 'post-video' || (activeId && activeId !== id)) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        setIsPlaying(false);
        setIsBuffering(false);
      }
    });
    return unsubscribe;
  }, [id]);

  // Handle single-video playback synchronization
  useEffect(() => {
    if (ytVideoId) {
      setIsPlaying(isCurrentActive);
      return;
    }

    const video = videoRef.current;
    if (!video || hasError) return;

    if (isCurrentActive) {
      video.muted = isGlobalMuted;
      if (video.paused) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setIsBuffering(false);
              globalMediaCoordinator.play('post-video', id);
            })
            .catch(() => {
              // Autoplay with audio may be blocked by browser policy; fallback to muted
              if (videoRef.current) {
                videoRef.current.muted = true;
                videoRef.current
                  .play()
                  .then(() => {
                    setIsPlaying(true);
                    setIsBuffering(false);
                    globalMediaCoordinator.play('post-video', id);
                  })
                  .catch(() => {});
              }
            });
        }
      }
    } else {
      if (!video.paused) {
        video.pause();
        globalMediaCoordinator.pause('post-video', id);
      }
      setIsPlaying(false);
      setIsBuffering(false);
    }
  }, [isCurrentActive, isGlobalMuted, ytVideoId, hasError, id]);

  // IntersectionObserver: automatically plays when scrolled into view (threshold >= 50%)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Scrolled into prime view: auto-play if user did not manually pause
            if (!manuallyPausedRef.current) {
              setActiveVideoId(id);
            }
          } else if (entry.intersectionRatio < 0.25) {
            // Scrolled out of view: reset manual pause memory for when it returns
            manuallyPausedRef.current = false;
            setActiveVideoId((current) => (current === id ? null : current));
          }
        });
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1.0]
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      setActiveVideoId((current) => (current === id ? null : current));
    };
  }, [id, setActiveVideoId]);

  const triggerTogglePlay = useCallback(() => {
    if (hasError) {
      // Retry
      setHasError(false);
      setCurrentSrc('/uploads/sample-blazes.mp4');
      if (videoRef.current) {
        videoRef.current.src = '/uploads/sample-blazes.mp4';
        videoRef.current.load();
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      return;
    }

    if (isPlaying) {
      manuallyPausedRef.current = true;
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
      if (activeVideoId === id) {
        setActiveVideoId(null);
      }
    } else {
      manuallyPausedRef.current = false;
      setActiveVideoId(id);
      if (videoRef.current) {
        videoRef.current.muted = isGlobalMuted;
        videoRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
            }
          });
      } else {
        setIsPlaying(true);
      }
    }
  }, [hasError, isPlaying, activeVideoId, id, setActiveVideoId, isGlobalMuted]);

  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const DOUBLE_CLICK_DELAY = 280;

    if (now - lastClickTimeRef.current < DOUBLE_CLICK_DELAY) {
      // Double tap detected
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      if (onDoubleTap) {
        onDoubleTap();
      }
    } else {
      // Single tap candidate
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = setTimeout(() => {
        triggerTogglePlay();
        clickTimeoutRef.current = null;
      }, DOUBLE_CLICK_DELAY);
    }
    lastClickTimeRef.current = now;
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration || 0;
    if (dur > 0 && !isNaN(dur)) {
      setDuration(dur);
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h && onDimensionsLoaded) {
      onDimensionsLoaded(w, h, dur);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setProgress(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setProgress(val);
    }
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  const handleRetry = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    autoRetryCountRef.current = 0;
    setHasError(false);
    setIsBuffering(true);
    const retryUrl = `${currentSrc.split('?')[0]}?retry=${Date.now()}&fallback=1`;
    setCurrentSrc(retryUrl);
    if (videoRef.current) {
      videoRef.current.src = retryUrl;
      videoRef.current.load();
      if (isCurrentActive) {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleVideoError = () => {
    setIsBuffering(false);
    if (autoRetryCountRef.current < 2) {
      autoRetryCountRef.current += 1;
      const isFallbackRetry = autoRetryCountRef.current === 2;
      const retryUrl = `${currentSrc.split('?')[0]}?retry=${Date.now()}${isFallbackRetry ? '&fallback=1' : ''}`;
      setCurrentSrc(retryUrl);
      if (videoRef.current) {
        videoRef.current.src = retryUrl;
        videoRef.current.load();
        if (isCurrentActive) {
          videoRef.current.play().catch(() => {});
        }
      }
      return;
    }

    // Report internal diagnostic event to backend
    apiRequest('/media/playback-error', {
      method: 'POST',
      body: JSON.stringify({
        contentId: id,
        mediaType: 'video',
        storagePath: currentSrc,
        playbackError: videoRef.current?.error?.message || 'Media playback error',
        appVersion: '2.0.0'
      })
    }).catch(() => {});

    // Show safe retry UI without overwriting or deleting user content
    setHasError(true);
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={handleContainerClick}
      className={`relative w-full h-full bg-neutral-950 flex items-center justify-center overflow-hidden cursor-pointer group select-none ${className}`}
    >
      {/* Visual Poster Background - Prevents any black screen flash while video prepares */}
      {safePoster && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={safePoster}
            alt=""
            aria-hidden="true"
            className={`w-full h-full object-cover transition-opacity duration-500 ${
              isPlaying && isLoaded ? 'opacity-0' : 'opacity-100'
            }`}
          />
          {/* Subtle gradient vignette to increase contrast */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 pointer-events-none" />
        </div>
      )}

      {ytVideoId ? (
        <div className="w-full h-full relative z-10 pointer-events-none">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=${
              isCurrentActive ? '1' : '0'
            }&mute=${isGlobalMuted ? '1' : '0'}&loop=1&playlist=${ytVideoId}&controls=0&modestbranding=1&playsinline=1`}
            title="Post Video"
            className="w-full h-full object-cover border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      ) : (
        <video
          ref={videoRef}
          src={currentSrc}
          poster={safePoster}
          loop
          playsInline
          preload="metadata"
          autoPlay={isCurrentActive}
          muted={isGlobalMuted}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setIsLoaded(true);
            setIsPlaying(true);
          }}
          onCanPlay={() => {
            setIsBuffering(false);
            setIsLoaded(true);
          }}
          onLoadedData={() => {
            setIsBuffering(false);
            setIsLoaded(true);
          }}
          onError={handleVideoError}
          className={`w-full h-full object-contain block relative z-10 transition-opacity duration-300 ${
            isLoaded || isPlaying ? 'opacity-100' : 'opacity-90'
          }`}
        />
      )}

      {/* Buffering Spinner */}
      {isBuffering && isPlaying && !ytVideoId && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/20 backdrop-blur-[1px]">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin shadow-md" />
        </div>
      )}

      {/* Error state overlay */}
      {hasError && (
        <div className="absolute inset-0 z-25 flex flex-col items-center justify-center bg-black/75 text-white p-4 text-center">
          <RotateCcw className="w-8 h-8 mb-2 text-white/80 animate-pulse" />
          <p className="text-xs font-semibold mb-2">Video playback issue</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerTogglePlay();
            }}
            className="px-3 py-1.5 bg-white text-black text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors shadow"
          >
            Tap to Reload
          </button>
        </div>
      )}

      {/* Top-Right Frosted Circular Audio / Mute Button */}
      <div className="absolute top-3.5 right-3.5 z-30 pointer-events-auto">
        <button
          type="button"
          id={`audio-toggle-btn-${id}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleGlobalMute();
          }}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 focus:outline-none cursor-pointer"
          title={isGlobalMuted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
          aria-label={isGlobalMuted ? 'Unmute Audio' : 'Mute Audio'}
        >
          {isGlobalMuted ? (
            <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          ) : (
            <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          )}
        </button>
      </div>

      {/* Center Play Overlay Icon when paused */}
      {!isPlaying && !hasError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 transition-opacity">
          <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center border border-white/20 shadow-2xl transition-transform hover:scale-110 active:scale-95">
            <Play className="w-6 h-6 ml-1 text-white fill-white" />
          </div>
        </div>
      )}

      {/* Bottom Controls Bar on hover / paused (for HTML5 video) */}
      {!ytVideoId && !hasError && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center space-x-3 transition-opacity duration-200 z-30 ${
            showControls || !isPlaying ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            type="button"
            id={`play-pause-btn-${id}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerTogglePlay();
            }}
            className="text-white hover:text-gray-200 p-1 cursor-pointer focus:outline-none"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
          </button>

          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={progress}
            onChange={handleSeek}
            className="flex-1 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
            aria-label="Seek Video"
          />

          <button
            type="button"
            id={`fullscreen-btn-${id}`}
            onClick={handleFullscreen}
            className="text-white hover:text-gray-200 p-1 cursor-pointer focus:outline-none"
            title="Toggle Fullscreen"
            aria-label="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Non-Destructive Playback Error Overlay */}
      {hasError && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm p-4 text-center select-none"
        >
          <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2 border border-amber-500/30">
            <AlertCircle className="w-6 h-6" />
          </div>
          <p className="text-white text-sm font-semibold mb-1">Playback Interrupted</p>
          <p className="text-white/70 text-xs max-w-xs mb-3">
            Your video post is securely preserved. Tap reload to re-establish connection.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-900 text-xs font-semibold rounded-full flex items-center space-x-1.5 transition-transform active:scale-95 shadow-md cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Video</span>
          </button>
        </div>
      )}
    </div>
  );
};
