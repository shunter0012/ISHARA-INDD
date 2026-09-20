/**
 * Real Device Media Gallery Service
 * Persists actual user photos and videos locally in IndexedDB
 * so users see their real media rather than fake placeholder images.
 */

export interface UserGalleryItem {
  id: string;
  name: string;
  type: 'image' | 'video';
  file: File;
  url: string; // Object URL for instantaneous rendering
  thumbnailUrl?: string;
  duration?: number;
  durationFormatted?: string;
  size: number;
  timestamp: number;
}

const DB_NAME = 'ishara_gallery_db';
const DB_VERSION = 1;
const STORE_NAME = 'gallery_media';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Format video duration in mm:ss or hh:mm:ss
 */
export function formatGalleryDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00';
  const totalSec = Math.round(seconds);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Probe video duration and generate a lightweight preview frame
 */
export function probeVideoDetails(file: File): Promise<{ duration: number; formatted: string; thumbnail?: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({ duration: 0, formatted: '0:00' });
    }, 4000);

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;
      const formatted = formatGalleryDuration(duration);

      // Seek slightly into video to capture frame
      video.currentTime = Math.min(0.5, duration > 1 ? 1 : 0);
    };

    video.onseeked = () => {
      clearTimeout(timer);
      let thumbnail: string | undefined;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth || 320, 480);
        canvas.height = Math.min(video.videoHeight || 320, 480);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        }
      } catch {}
      cleanup();
      resolve({ duration: video.duration || 0, formatted: formatGalleryDuration(video.duration || 0), thumbnail });
    };

    video.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve({ duration: 0, formatted: '0:00' });
    };
  });
}

/**
 * Retrieve stored user gallery items from IndexedDB
 */
export async function getSavedGalleryItems(): Promise<UserGalleryItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const rawItems = request.result || [];
        rawItems.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

        const hydrated: UserGalleryItem[] = [];
        const corruptedIds: string[] = [];

        for (const item of rawItems) {
          try {
            let file: File | null = null;
            if (item.blob instanceof File && item.blob.size > 0) {
              file = item.blob;
            } else if (item.blob instanceof Blob && item.blob.size > 0) {
              file = new File([item.blob], item.name || 'media', {
                type: item.blob.type || (item.type === 'video' ? 'video/mp4' : 'image/jpeg')
              });
            }

            if (!file || file.size === 0) {
              corruptedIds.push(item.id);
              continue;
            }

            const freshUrl = URL.createObjectURL(file);
            // Always generate a fresh valid URL for this session (never use expired blob URLs from DB)
            const thumb = item.type === 'image' 
              ? freshUrl 
              : (item.thumbnailUrl && item.thumbnailUrl.startsWith('data:') ? item.thumbnailUrl : freshUrl);

            hydrated.push({
              id: item.id,
              name: item.name,
              type: item.type,
              file,
              url: freshUrl,
              thumbnailUrl: thumb,
              duration: item.duration,
              durationFormatted: item.durationFormatted,
              size: file.size,
              timestamp: item.timestamp || Date.now()
            });
          } catch {
            corruptedIds.push(item.id);
          }
        }

        // Auto-purge corrupted / empty records
        if (corruptedIds.length > 0) {
          try {
            const delTx = db.transaction(STORE_NAME, 'readwrite');
            const delStore = delTx.objectStore(STORE_NAME);
            for (const cId of corruptedIds) {
              delStore.delete(cId);
            }
          } catch {}
        }

        resolve(hydrated);
      };

      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('[userGallery] Failed to load stored gallery items:', err);
    return [];
  }
}

/**
 * Save user files from device into IndexedDB gallery
 */
export async function saveFilesToGallery(files: FileList | File[]): Promise<UserGalleryItem[]> {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) return [];

  const newItems: UserGalleryItem[] = [];

  for (const file of fileArray) {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);

    if (!isVideo && !isImage) continue;

    const id = `local-gallery-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const url = URL.createObjectURL(file);
    let duration: number | undefined = undefined;
    let durationFormatted: string | undefined = undefined;
    let thumbnailUrl: string | undefined = undefined;

    if (isVideo) {
      try {
        const probe = await probeVideoDetails(file);
        duration = probe.duration;
        durationFormatted = probe.formatted;
        thumbnailUrl = probe.thumbnail;
      } catch {}
    }

    const item: UserGalleryItem = {
      id,
      name: file.name,
      type: isVideo ? 'video' : 'image',
      file,
      url,
      thumbnailUrl: thumbnailUrl || (isImage ? url : undefined),
      duration,
      durationFormatted,
      size: file.size,
      timestamp: Date.now()
    };

    newItems.push(item);

    // Save to IndexedDB (keeping max 60 recent device items)
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.put({
        id: item.id,
        name: item.name,
        type: item.type,
        blob: file, // Store actual File/Blob
        thumbnailUrl: item.thumbnailUrl,
        duration: item.duration,
        durationFormatted: item.durationFormatted,
        size: item.size,
        timestamp: item.timestamp
      });
    } catch (err) {
      console.warn('[userGallery] Error saving item to IndexedDB:', err);
    }
  }

  return newItems;
}

/**
 * Remove an item from the local gallery
 */
export async function removeGalleryItem(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch (err) {
    console.warn('[userGallery] Error removing gallery item:', err);
  }
}

/**
 * Clear all items from the local gallery
 */
export async function clearAllGalleryItems(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.warn('[userGallery] Error clearing gallery:', err);
  }
}
