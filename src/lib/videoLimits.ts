/**
 * ISHARA Video Length Limits & Validation System
 * 
 * Rules:
 * 1. Standard Feed Posts (Desktop & Mobile): Maximum 60 minutes (3600s).
 *    Never automatically trim, compress, or convert to Reels.
 * 2. Reels: Maximum 15 minutes (900s).
 *    If exceeded, offer user the option to publish as a standard Feed Post.
 * 3. Carousel Posts: Each individual video can be up to 60 seconds (60s).
 *    Reject longer carousel videos with a clear message rather than silently trimming.
 * 4. Stories: Limit each Story segment to 60 seconds (60s).
 *    If a longer video is selected, offer splitting into 60s segments ONLY with user confirmation.
 */

export const VIDEO_LIMITS = {
  // Feed Post Video: up to 60 minutes (3600 seconds) on both desktop and mobile
  FEED_MAX_SECONDS: 3600,
  FEED_MAX_LABEL: '60 minutes',

  // Reel: 15 minutes (900 seconds)
  REEL_MAX_SECONDS: 900,
  REEL_MAX_LABEL: '15 minutes',

  // Carousel Post: each individual video up to 60 seconds
  CAROUSEL_ITEM_MAX_SECONDS: 60,
  CAROUSEL_ITEM_MAX_LABEL: '60 seconds',

  // Story Video Segment: 60 seconds
  STORY_SEGMENT_MAX_SECONDS: 60,
  STORY_SEGMENT_MAX_LABEL: '60 seconds',

  SUPPORTED_EXTENSIONS: ['.mp4', '.webm', '.mov', '.m4v', '.mkv'],
  SUPPORTED_MIME_TYPES: [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'video/x-matroska'
  ]
} as const;

/**
 * Human-readable duration formatter
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0s';
  const total = Math.round(seconds);
  if (total < 60) {
    return `${total}s`;
  }
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

/**
 * Checks if a file is an acceptable video by extension or mime type
 */
export function isSupportedVideoFile(file: File): boolean {
  if (!file) return false;
  if (file.type && file.type.startsWith('video/')) return true;
  const name = file.name.toLowerCase();
  return VIDEO_LIMITS.SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
}

/**
 * Client-side video duration detection using HTML5 video metadata.
 * Designed to handle large files and longer videos without premature timeout.
 */
export async function getVideoFileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return resolve(0);
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let timer: any = null;
    let resolved = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignore
        }
      }
    };

    const handleSuccess = () => {
      if (resolved) return;
      const dur = video.duration;
      if (typeof dur === 'number' && !isNaN(dur) && dur > 0 && isFinite(dur)) {
        resolved = true;
        cleanup();
        resolve(dur);
      }
    };

    video.onloadedmetadata = handleSuccess;
    video.ondurationchange = handleSuccess;
    video.onloadeddata = handleSuccess;

    video.onerror = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(0);
      }
    };

    // 5-second fast timeout: if browser HTML5 video decoder hangs or doesn't support codec,
    // gracefully resolve 0 and allow server-side ffprobe/ffmpeg to perform canonical check
    timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(0);
      }
    }, 5000);

    video.src = objectUrl;
  });
}

export interface VideoValidationResult {
  valid: boolean;
  duration?: number;
  formattedDuration?: string;
  error?: string;
  errorCode?: 'VIDEO_TOO_LONG' | 'UNSUPPORTED_FORMAT' | 'CORRUPTED_MEDIA';
  exceedsReelLimit?: boolean;
  requiresStorySplit?: boolean;
  suggestedSegmentCount?: number;
}

/**
 * Validates a video file against the configured limits for the target post format
 */
export async function validateVideoFile(
  file: File,
  context: 'feed' | 'reel' | 'carousel' | 'story'
): Promise<VideoValidationResult> {
  if (!isSupportedVideoFile(file)) {
    return {
      valid: false,
      errorCode: 'UNSUPPORTED_FORMAT',
      error: `Unsupported video format. Please upload MP4, WebM, MOV, or M4V.`
    };
  }

  const duration = await getVideoFileDuration(file);
  const formattedDuration = duration > 0 ? formatDuration(duration) : undefined;

  // 1. Carousel Individual Video Limit: 60s
  if (context === 'carousel') {
    if (duration > VIDEO_LIMITS.CAROUSEL_ITEM_MAX_SECONDS) {
      return {
        valid: false,
        duration,
        formattedDuration,
        errorCode: 'VIDEO_TOO_LONG',
        error: `Video "${file.name}" is ${formattedDuration} long. Videos inside carousel posts cannot exceed 60 seconds. Please choose a shorter clip (up to 60s) or share it as a standard Feed Post (supports up to 60 minutes).`
      };
    }
  }

  // 2. Reel Limit: 15 minutes (900s)
  if (context === 'reel') {
    if (duration > VIDEO_LIMITS.REEL_MAX_SECONDS) {
      return {
        valid: false,
        duration,
        formattedDuration,
        errorCode: 'VIDEO_TOO_LONG',
        exceedsReelLimit: true,
        error: `This video is ${formattedDuration} long, which exceeds the Reel limit of ${VIDEO_LIMITS.REEL_MAX_LABEL}. Reels are designed for clips up to 15 minutes.`
      };
    }
  }

  // 3. Story Segment Limit: 60s
  if (context === 'story') {
    if (duration > VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS) {
      const suggestedSegmentCount = Math.ceil(duration / VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS);
      return {
        valid: false,
        duration,
        formattedDuration,
        errorCode: 'VIDEO_TOO_LONG',
        requiresStorySplit: true,
        suggestedSegmentCount,
        error: `This video is ${formattedDuration} long. Stories are played in 60-second segments.`
      };
    }
  }

  // 4. Feed Post Limit: 60 minutes (3600s)
  if (context === 'feed') {
    if (duration > VIDEO_LIMITS.FEED_MAX_SECONDS) {
      return {
        valid: false,
        duration,
        formattedDuration,
        errorCode: 'VIDEO_TOO_LONG',
        error: `This video is ${formattedDuration} long, which exceeds the maximum limit of ${VIDEO_LIMITS.FEED_MAX_LABEL} for Feed Posts. Please choose a video under 60 minutes.`
      };
    }
  }

  return {
    valid: true,
    duration: duration > 0 ? duration : undefined,
    formattedDuration
  };
}

export interface MediaMetadataInfo {
  mediaType: 'image' | 'video';
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
  durationFormatted?: string;
  orientation?: 'portrait' | 'landscape' | 'square';
  resolution?: string;
}

/**
 * Auto-detects photo vs video, duration, MIME type, file size, orientation, and resolution.
 */
export async function probeMediaMetadata(file: File): Promise<MediaMetadataInfo> {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
  const mimeType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');
  const fileSize = file.size;

  if (isVideo) {
    return new Promise((resolve) => {
      let objectUrl: string | null = null;
      try {
        objectUrl = URL.createObjectURL(file);
      } catch {
        return resolve({
          mediaType: 'video',
          mimeType,
          fileSize
        });
      }

      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      let resolved = false;
      const cleanup = () => {
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            mediaType: 'video',
            mimeType,
            fileSize
          });
        }
      }, 5000);

      video.onloadedmetadata = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const duration = video.duration && isFinite(video.duration) ? video.duration : undefined;
        const width = video.videoWidth || undefined;
        const height = video.videoHeight || undefined;
        cleanup();

        let orientation: 'portrait' | 'landscape' | 'square' | undefined;
        if (width && height) {
          if (width > height * 1.05) orientation = 'landscape';
          else if (height > width * 1.05) orientation = 'portrait';
          else orientation = 'square';
        }

        resolve({
          mediaType: 'video',
          mimeType,
          fileSize,
          duration,
          durationFormatted: duration ? formatDuration(duration) : undefined,
          width,
          height,
          orientation,
          resolution: width && height ? `${width}×${height}` : undefined
        });
      };

      video.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve({
            mediaType: 'video',
            mimeType,
            fileSize
          });
        }
      };

      video.src = objectUrl;
    });
  } else {
    return new Promise((resolve) => {
      let objectUrl: string | null = null;
      try {
        objectUrl = URL.createObjectURL(file);
      } catch {
        return resolve({
          mediaType: 'image',
          mimeType,
          fileSize
        });
      }

      const img = new Image();
      let resolved = false;
      const cleanup = () => {
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            mediaType: 'image',
            mimeType,
            fileSize
          });
        }
      }, 3000);

      img.onload = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const width = img.naturalWidth || undefined;
        const height = img.naturalHeight || undefined;
        cleanup();

        let orientation: 'portrait' | 'landscape' | 'square' | undefined;
        if (width && height) {
          if (width > height * 1.05) orientation = 'landscape';
          else if (height > width * 1.05) orientation = 'portrait';
          else orientation = 'square';
        }

        resolve({
          mediaType: 'image',
          mimeType,
          fileSize,
          width,
          height,
          orientation,
          resolution: width && height ? `${width}×${height}` : undefined
        });
      };

      img.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve({
            mediaType: 'image',
            mimeType,
            fileSize
          });
        }
      };

      img.src = objectUrl;
    });
  }
}
