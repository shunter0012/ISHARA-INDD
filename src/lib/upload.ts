/**
 * Universal media upload and URL helper
 */

export interface UploadMediaOptions {
  onProgress?: (percent: number, loaded: number, total: number) => void;
  signal?: AbortSignal;
}

const CHUNK_SIZE = 2.5 * 1024 * 1024; // 2.5MB per chunk for optimal throughput and resumability

/**
 * Universal media upload helper supporting reliable chunked & resumable transfers for large files (up to 60m videos)
 */
export async function uploadMediaFile(file: File, options?: UploadMediaOptions): Promise<string> {
  const token = localStorage.getItem('ishara_token');
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Use chunked upload for videos or any file > 2.5MB to support pauses, resume, and prevent timeouts
  const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|m4v|mkv)$/i);
  const shouldChunk = isVideo || file.size > CHUNK_SIZE;

  if (shouldChunk) {
    try {
      return await uploadChunkedMediaFile(file, headers, options);
    } catch (chunkErr) {
      console.warn('[uploadMediaFile] Chunked upload issue, falling back to direct upload:', chunkErr);
      // Fall through to direct upload fallback
    }
  }

  // Direct upload for small files
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers,
    body: formData,
    signal: options?.signal
  });

  if (!response.ok) {
    let errorMsg = 'Failed to upload media to permanent storage.';
    try {
      const errJson = await response.json();
      if (errJson?.error) errorMsg = errJson.error;
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  if (!data?.url) {
    throw new Error('Upload succeeded but no permanent storage URL was returned.');
  }

  options?.onProgress?.(100, file.size, file.size);
  return data.url;
}

/**
 * Chunked resumable upload engine: slices large files, tracks chunk completion, retries on glitch
 */
async function uploadChunkedMediaFile(
  file: File,
  authHeaders: Record<string, string>,
  options?: UploadMediaOptions
): Promise<string> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const fileId = `${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}_${file.size}_${file.lastModified}`;

  // 1. Initialize upload session and discover previously uploaded chunks
  const initRes = await fetch('/api/upload/chunk/init', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileId,
      filename: file.name,
      fileSize: file.size,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      mimeType: file.type || 'video/mp4'
    }),
    signal: options?.signal
  });

  if (!initRes.ok) {
    throw new Error('Failed to initialize resumable upload session.');
  }

  const initData = await initRes.json();
  const uploadId: string = initData.uploadId;
  const uploadedSet = new Set<number>(initData.uploadedChunks || []);

  let uploadedBytes = 0;
  for (const idx of uploadedSet) {
    const start = idx * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    uploadedBytes += (end - start);
  }

  // Report initial progress if resuming from earlier
  const initialPercent = Math.min(99, Math.round((uploadedBytes / file.size) * 100));
  options?.onProgress?.(initialPercent, uploadedBytes, file.size);

  // 2. Upload missing chunks sequentially with exponential backoff retry
  for (let i = 0; i < totalChunks; i++) {
    if (uploadedSet.has(i)) {
      continue; // Chunk already safely saved on server
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);
    const currentChunkBytes = end - start;

    let retries = 5;
    let success = false;
    let lastError: any = null;

    while (retries > 0 && !success) {
      if (options?.signal?.aborted) {
        throw new Error('Upload cancelled by user.');
      }

      try {
        const chunkFormData = new FormData();
        chunkFormData.append('chunk', chunkBlob, `chunk_${i}`);
        chunkFormData.append('uploadId', uploadId);
        chunkFormData.append('chunkIndex', i.toString());

        const chunkRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: authHeaders,
          body: chunkFormData,
          signal: options?.signal
        });

        if (!chunkRes.ok) {
          throw new Error(`Server returned HTTP ${chunkRes.status} for chunk ${i}`);
        }

        success = true;
        uploadedSet.add(i);
        uploadedBytes += currentChunkBytes;
        const percent = Math.min(99, Math.round((uploadedBytes / file.size) * 100));
        options?.onProgress?.(percent, uploadedBytes, file.size);
      } catch (err: any) {
        lastError = err;
        retries--;
        if (retries > 0) {
          // Exponential backoff wait (1s, 2s, 4s...)
          const backoff = (6 - retries) * 1000;
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }

    if (!success) {
      throw new Error(`Chunk ${i + 1}/${totalChunks} failed after multiple attempts: ${lastError?.message || 'Network error'}`);
    }
  }

  // 3. Assemble chunks and finalize into permanent media vault
  const completeRes = await fetch('/api/upload/chunk/complete', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uploadId,
      filename: file.name
    }),
    signal: options?.signal
  });

  if (!completeRes.ok) {
    let msg = 'Failed to assemble video upload.';
    try {
      const errJson = await completeRes.json();
      if (errJson?.error) msg = errJson.error;
    } catch {}
    throw new Error(msg);
  }

  const completeData = await completeRes.json();
  if (!completeData?.url) {
    throw new Error('Upload completed but permanent storage URL is missing.');
  }

  options?.onProgress?.(100, file.size, file.size);
  return completeData.url;
}

/**
 * Uploads a base64 Data URL (e.g. video thumbnail frame) to be saved permanently on disk
 */
export async function uploadDataUrl(dataUrl: string, prefix: string = 'media'): Promise<string> {
  const token = localStorage.getItem('ishara_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/upload-base64', {
    method: 'POST',
    headers,
    body: JSON.stringify({ dataUrl, prefix })
  });

  if (!res.ok) {
    throw new Error('Failed to save media in permanent storage.');
  }

  const data = await res.json();
  return data.url;
}

/**
 * Extracts YouTube video ID if URL is a YouTube Shorts or video link
 */
export function getYouTubeId(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;

  // Match shorts: youtube.com/shorts/ID
  const shortsMatch = url.match(/(?:youtube\.com\/shorts\/|youtu\.be\/shorts\/)([a-zA-Z0-9_-]{11})/i);
  if (shortsMatch && shortsMatch[1]) {
    return shortsMatch[1];
  }

  // Match standard watch: youtube.com/watch?v=ID
  const watchMatch = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }

  // Match embed: youtube.com/embed/ID
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
  if (embedMatch && embedMatch[1]) {
    return embedMatch[1];
  }

  return null;
}

export function isYouTubeUrl(url?: string | null): boolean {
  return Boolean(getYouTubeId(url));
}

export function isVideoUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return Boolean(
    url.match(/\.(mp4|webm|mov|ogg|m4v|avi)($|\?)/i) ||
    (url.includes('/uploads/') && !url.match(/\.(jpeg|jpg|png|webp|gif|svg)($|\?)/i)) ||
    isYouTubeUrl(url)
  );
}

/**
 * Extracts a frame from a video File or URL to use as an actual visual image thumbnail
 */
export function extractVideoThumbnail(fileOrUrl: File | string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      const isFile = typeof fileOrUrl !== 'string';
      const url = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
      video.src = url;

      let resolved = false;
      const cleanup = () => {
        if (isFile) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Ignore
          }
        }
      };

      const finish = (result: string) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(result);
        }
      };

      video.onloadedmetadata = () => {
        // Seek to 0.5s or midpoint for short clips
        video.currentTime = Math.min(0.5, Math.max(0.1, (video.duration || 1) / 3));
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = video.videoWidth || 480;
          const height = video.videoHeight || 640;
          canvas.width = Math.min(width, 720);
          canvas.height = Math.round((canvas.width / width) * height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumb = canvas.toDataURL('image/jpeg', 0.85);
            finish(thumb);
            return;
          }
        } catch (e) {
          console.warn('Could not draw video frame to canvas:', e);
        }
        finish('');
      };

      video.onerror = () => {
        finish('');
      };

      // Safety timeout in case video loading hangs
      setTimeout(() => {
        finish('');
      }, 5000);
    } catch {
      resolve('');
    }
  });
}

/**
 * Converts a base64 Data URL to a File object for multipart form upload
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(parts[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Resolves and sanitizes a video URL to guarantee playback across all devices and browsers.
 * Replaces broken external Google Storage URLs with high-performance local MP4s,
 * ensures leading slash on relative paths, and handles protocol resolution.
 */
export function resolveVideoUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '/uploads/sample-blazes.mp4';
  const clean = url.trim();
  if (!clean) return '/uploads/sample-blazes.mp4';

  // Handle broken Google Cloud storage bucket URLs
  if (clean.includes('commondatastorage.googleapis.com')) {
    if (clean.includes('Escapes')) return '/uploads/sample-escapes.mp4';
    if (clean.includes('Fun')) return '/uploads/sample-fun.mp4';
    if (clean.includes('BigBuck') || clean.includes('nature') || clean.includes('flower')) return '/uploads/sample-nature.mp4';
    return '/uploads/sample-blazes.mp4';
  }

  // Preserve external streaming URLs and blob/data URLs
  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('blob:') || clean.startsWith('data:')) {
    return clean;
  }

  // Ensure leading slash on relative upload/video routes
  if (!clean.startsWith('/')) {
    return `/${clean}`;
  }

  return clean;
}

/**
 * Resolves a thumbnail URL, providing an instant visual poster if none was supplied,
 * preventing any initial black box while the video is preparing to play.
 */
export function resolveThumbnailUrl(thumbnailUrl?: string | null, videoUrl?: string | null): string {
  if (thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim()) {
    const clean = thumbnailUrl.trim();
    if (!clean.includes('commondatastorage.googleapis.com')) {
      if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('blob:') || clean.startsWith('data:')) {
        return clean;
      }
      return clean.startsWith('/') ? clean : `/${clean}`;
    }
  }

  // Auto-associate with matching video poster
  const vUrl = (videoUrl || '').toLowerCase();
  if (vUrl.includes('escapes')) return '/uploads/sample-escapes.jpg';
  if (vUrl.includes('fun')) return '/uploads/sample-fun.jpg';
  if (vUrl.includes('nature') || vUrl.includes('flower')) return '/uploads/sample-nature.jpg';
  return '/uploads/sample-blazes.jpg';
}

