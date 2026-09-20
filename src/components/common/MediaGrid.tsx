import React, { useState } from 'react';
import { Heart, MessageCircle, Film, Play } from 'lucide-react';
import { getYouTubeId, isVideoUrl } from '../../lib/upload';

export interface MediaGridItem {
  id: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel';
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  authorUsername?: string;
  isReel?: boolean;
}

interface MediaGridProps {
  items: MediaGridItem[];
  onItemClick?: (item: MediaGridItem) => void;
  aspectRatio?: 'square' | 'reel'; // defaults to 'square' (1 / 1) as required
  emptyMessage?: string;
  className?: string;
}

const MediaGridCell: React.FC<{
  item: MediaGridItem;
  ratioClass: string;
  onClick?: () => void;
}> = ({ item, ratioClass, onClick }) => {
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Check whether this item is a video / reel
  const isVideo = Boolean(
    item.mediaType === 'video' ||
    item.isReel ||
    isVideoUrl(item.mediaUrl) ||
    isVideoUrl(item.thumbnailUrl)
  );

  // 1. YouTube thumbnail detection
  const ytVideoId = getYouTubeId(item.mediaUrl || item.thumbnailUrl);
  const ytThumbnail = ytVideoId ? `https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg` : null;

  // 2. Determine best image candidate:
  // Use ytThumbnail, or thumbnailUrl (if not an mp4 video file), or mediaUrl (if not video)
  let imageCandidate: string | null = null;
  if (ytThumbnail) {
    imageCandidate = ytThumbnail;
  } else if (item.thumbnailUrl && !isVideoUrl(item.thumbnailUrl)) {
    imageCandidate = item.thumbnailUrl;
  } else if (!isVideo && item.mediaUrl && !isVideoUrl(item.mediaUrl)) {
    imageCandidate = item.mediaUrl;
  }

  // 3. Video source candidate for HTML5 video preview
  const videoSource = (item.mediaUrl && isVideoUrl(item.mediaUrl)) 
    ? item.mediaUrl 
    : (item.thumbnailUrl && isVideoUrl(item.thumbnailUrl)) 
      ? item.thumbnailUrl 
      : item.mediaUrl;

  const showImage = Boolean(imageCandidate && !imgError);
  const showVideo = Boolean(!showImage && isVideo && videoSource && !videoError && !ytVideoId);

  return (
    <div
      onClick={onClick}
      className={`relative w-full ${ratioClass} overflow-hidden rounded-xl sm:rounded-2xl bg-[#1A1A1A] select-none group cursor-pointer shadow-xs border border-black/5`}
    >
      {/* Media Container: Controls Dimensions */}
      <div className="w-full h-full relative overflow-hidden bg-zinc-900 flex items-center justify-center">
        {showImage ? (
          <img
            src={imageCandidate!}
            alt={item.caption || ''}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover block group-hover:scale-105 transition-transform duration-300 pointer-events-none"
          />
        ) : showVideo ? (
          <video
            src={`${videoSource}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            onError={() => setVideoError(true)}
            className="w-full h-full object-cover block group-hover:scale-105 transition-transform duration-300 pointer-events-none"
          />
        ) : (
          /* Graceful Fallback Card when media cannot be decoded */
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-white select-none">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-1.5 backdrop-blur-xs group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 ml-0.5 fill-white text-white" />
            </div>
            {item.caption && (
              <p className="text-[10px] text-zinc-300 line-clamp-2 px-1">
                {item.caption}
              </p>
            )}
          </div>
        )}

        {/* Video Indicator Badge Overlay (Top Right) */}
        {isVideo && (
          <div className="absolute top-2 right-2 z-10 p-1 sm:p-1.5 rounded-lg bg-black/65 backdrop-blur-xs text-white shadow-sm pointer-events-none flex items-center space-x-1">
            <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
        )}

        {/* Center Play Icon on Hover for Video */}
        {isVideo && (
          <div className="absolute inset-0 z-15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-xs shadow-lg transform group-hover:scale-105 transition-transform">
              <Play className="w-5 h-5 ml-0.5 fill-white text-white" />
            </div>
          </div>
        )}

        {/* Interactive Hover Overlay (Likes & Comments count) */}
        <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-3 sm:space-x-5 text-white text-xs font-bold pointer-events-none px-2">
          {item.likesCount !== undefined && (
            <div className="flex items-center space-x-1 drop-shadow-md">
              <Heart className="w-4 h-4 fill-white text-white" />
              <span>{item.likesCount}</span>
            </div>
          )}
          {item.commentsCount !== undefined && (
            <div className="flex items-center space-x-1 drop-shadow-md">
              <MessageCircle className="w-4 h-4 fill-white text-white" />
              <span>{item.commentsCount}</span>
            </div>
          )}
        </div>

        {/* Author Username Badge Overlay (Bottom Left) */}
        {item.authorUsername && (
          <div className="absolute bottom-0 inset-x-0 z-10 p-1.5 sm:p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white text-[10px] sm:text-xs font-semibold truncate pointer-events-none">
            @{item.authorUsername}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Shared Media Grid Component
 * Adheres strictly to ISHARA grid rules:
 * - Real CSS Grid layout (grid-cols-3)
 * - Perfectly aligned rows and columns with equal cell dimensions
 * - Media container reserves exact 1/1 aspect ratio (or 9/16 for reel mode)
 * - object-fit: cover on all images and videos
 * - Overlays positioned absolutely inside the media container
 */
export const MediaGrid: React.FC<MediaGridProps> = ({
  items,
  onItemClick,
  aspectRatio = 'square',
  emptyMessage = 'No media uploaded yet.',
  className = ''
}) => {
  if (items.length === 0) {
    return (
      <div className="w-full bg-white border border-[#EEEEEE] rounded-2xl p-12 text-center text-xs text-[#8E8E8E] shadow-xs">
        {emptyMessage}
      </div>
    );
  }

  const ratioClass = aspectRatio === 'reel' ? 'aspect-[9/16]' : 'aspect-square';

  return (
    <div className={`grid grid-cols-3 gap-1 sm:gap-2 md:gap-3 w-full ${className}`}>
      {items.map((item) => (
        <MediaGridCell
          key={item.id}
          item={item}
          ratioClass={ratioClass}
          onClick={() => onItemClick?.(item)}
        />
      ))}
    </div>
  );
};

