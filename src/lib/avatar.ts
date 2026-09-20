/**
 * Avatar resilience and image optimization utilities
 * Guarantees permanent retention of profile pictures across redeployments and container recycles.
 */

export function getDefaultAvatar(username: string = 'user', displayName?: string): string {
  const seed = (displayName || username || 'user').trim();
  // Elegant, high-contrast dark initials badge (replaces ugly random shapes/stripes)
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=18181b,0f172a,27272a,09090b&textColor=ffffff&fontWeight=700&fontSize=44`;
}

/**
 * High-performance browser-side image optimizer:
 * Scales image to square max 512x512 with crisp quality, preventing oversized uploads
 * while producing a compact base64 string and file that easily fits inside database storage limits.
 */
export async function compressProfileImage(
  file: File,
  maxDimension: number = 512,
  quality: number = 0.9
): Promise<{ file: File; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file could not be decoded as an image.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Square crop from center for optimal profile picture framing
        const minSide = Math.min(width, height);
        const startX = (width - minSide) / 2;
        const startY = (height - minSide) / 2;

        const targetSize = Math.min(minSide, maxDimension);
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to acquire canvas context for image processing.'));
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw cropped & resized square
        ctx.drawImage(img, startX, startY, minSide, minSide, 0, 0, targetSize, targetSize);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Canvas conversion to blob failed.'));
            }
            const cleanName = `${Date.now()}-avatar.jpg`;
            const optimizedFile = new File([blob], cleanName, { type: 'image/jpeg' });
            resolve({ file: optimizedFile, dataUrl });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Save persistent avatar in localStorage cache
 */
export function saveLocalAvatarCache(userId: string, dataUrl: string): void {
  if (!userId || !dataUrl) return;
  try {
    localStorage.setItem(`ishara_avatar_${userId}`, dataUrl);
  } catch (err) {
    console.warn('[Avatar] Failed to cache avatar to localStorage:', err);
  }
}

/**
 * Retrieve cached persistent avatar from localStorage
 */
export function getLocalAvatarCache(userId: string): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(`ishara_avatar_${userId}`);
  } catch {
    return null;
  }
}

/**
 * Remove local avatar cache
 */
export function removeLocalAvatarCache(userId: string): void {
  if (!userId) return null as any;
  try {
    localStorage.removeItem(`ishara_avatar_${userId}`);
  } catch {}
}

/**
 * Resolve the optimal, non-flickering avatar URL:
 * 1. Base64 payload stored directly on user record (bulletproof against disk wipes)
 * 2. Locally cached data URL for the current device
 * 3. Server storage path /uploads/... if valid
 * 4. Fallback to clean initials SVG (never ugly random striped test patterns)
 */
export function resolveAvatarUrl(
  user?: { id?: string; username?: string; displayName?: string; avatarUrl?: string; avatarBase64?: string } | null
): string {
  if (!user) return getDefaultAvatar('user');

  // 1. Direct base64 string
  if (user.avatarBase64 && user.avatarBase64.startsWith('data:image/')) {
    return user.avatarBase64;
  }

  // 2. Local device cache
  if (user.id) {
    const cached = getLocalAvatarCache(user.id);
    if (cached && cached.startsWith('data:image/')) {
      return cached;
    }
  }

  // 3. User avatarUrl (if not corrupted shapes/svg)
  const url = user.avatarUrl;
  if (url && typeof url === 'string' && url.trim() !== '') {
    if (!url.includes('/shapes/svg')) {
      return url;
    }
  }

  // 4. Clean initials fallback
  return getDefaultAvatar(user.username || 'user', user.displayName);
}
