import { db } from '../db';
import { Reel, UserPreview } from '../../src/types/index';
import { NotificationService } from './NotificationService';
import { RealtimeService } from './RealtimeService';
import { FollowService } from './FollowService';
import { OWNER_ADMIN_UID } from '../utils/security';
import { MediaStorageService } from './MediaStorageService';
import { MusicService } from './MusicService';
import { FirebaseSyncService } from './FirebaseSyncService';
import { probeVideoMetadata, SERVER_VIDEO_LIMITS, formatServerDuration } from '../utils/videoProbe';

export class ReelService {
  public static sanitizeReel(reel: Reel): Reel {
    let videoUrl = reel.videoUrl;
    let thumbnailUrl = reel.thumbnailUrl;

    if (videoUrl) {
      if (videoUrl.includes('commondatastorage.googleapis.com')) {
        if (videoUrl.includes('Escapes')) videoUrl = '/uploads/sample-escapes.mp4';
        else if (videoUrl.includes('Fun')) videoUrl = '/uploads/sample-fun.mp4';
        else if (videoUrl.includes('BigBuck') || videoUrl.includes('nature') || videoUrl.includes('flower')) videoUrl = '/uploads/sample-nature.mp4';
        else videoUrl = '/uploads/sample-ocean.mp4';
      }
    }

    if (!thumbnailUrl || thumbnailUrl.includes('commondatastorage.googleapis.com')) {
      if (videoUrl?.includes('sample-escapes')) thumbnailUrl = '/uploads/sample-escapes.jpg';
      else if (videoUrl?.includes('sample-fun')) thumbnailUrl = '/uploads/sample-fun.jpg';
      else if (videoUrl?.includes('sample-nature')) thumbnailUrl = '/uploads/sample-nature.jpg';
      else thumbnailUrl = '/uploads/sample-nature.jpg';
    }

    return {
      ...reel,
      videoUrl,
      thumbnailUrl
    };
  }

  public static getReels(userId?: string): Reel[] {
    const data = db.getData();
    const liked = userId ? data.likedReelIds[userId] || [] : [];

    // Filter out banned users; reels are public discovery content available throughout the app
    const filtered = data.reels.filter(r => {
      const author = data.users.find(u => u.id === r.userId);
      if (!author) return false;
      if (author.isBanned) return false;
      return true;
    });

    return filtered
      .map(r => {
        const sanitized = ReelService.sanitizeReel(r);
        return {
          ...sanitized,
          isLiked: liked.includes(r.id)
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getReelById(reelId: string, userId?: string): Reel | null {
    const data = db.getData();
    const reel = data.reels.find(r => r.id === reelId);
    if (!reel) return null;

    const author = data.users.find(u => u.id === reel.userId);
    if (!author || author.isBanned) return null;

    const liked = userId ? data.likedReelIds[userId] || [] : [];
    const sanitized = ReelService.sanitizeReel(reel);
    return {
      ...sanitized,
      isLiked: liked.includes(reel.id)
    };
  }

  public static async createReel(dataInput: {
    userId: string;
    caption: string;
    videoUrl: string;
    thumbnailUrl?: string;
    audioId?: string;
    audioStartTime?: number;
    audioEndTime?: number;
    audioVolume?: number;
    originalAudioVolume?: number;
  }): Promise<Reel> {
    const data = db.getData();
    const user = data.users.find(u => u.id === dataInput.userId);
    if (!user) throw new Error('User not found.');

    if (user.isBanned) {
      throw new Error('Your account is banned. You cannot publish reels.');
    }

    let videoUrl = (dataInput.videoUrl || '').trim();
    let thumbnailUrl = (dataInput.thumbnailUrl || '').trim();

    if (!videoUrl) {
      throw new Error('A video file or URL is required to publish a reel.');
    }

    // Prohibit temporary Blob URLs
    if (videoUrl.startsWith('blob:')) {
      throw new Error('Temporary Blob URLs cannot be saved. Please complete video upload to permanent storage.');
    }
    if (thumbnailUrl.startsWith('blob:')) {
      thumbnailUrl = '';
    }

    // If client supplied a Data URL, save to permanent storage first
    if (videoUrl.startsWith('data:')) {
      const savedMedia = await MediaStorageService.saveBase64Media(videoUrl, user.id, 'reel');
      videoUrl = savedMedia.storagePath;
    }
    if (thumbnailUrl.startsWith('data:')) {
      const savedThumb = await MediaStorageService.saveBase64Media(thumbnailUrl, user.id, 'thumb');
      thumbnailUrl = savedThumb.storagePath;
    }

    // Verify the permanent storage object exists before publishing the reel
    const verification = MediaStorageService.verifyObject(videoUrl);
    if (!verification.exists) {
      throw new Error('Video upload has not completed or could not be verified in permanent storage. Please retry.');
    }

    // Validate Reel Duration: Maximum 15 minutes (900 seconds)
    let reelDuration: number | undefined = undefined;
    const diskPath = MediaStorageService.getDiskPath(videoUrl);
    if (diskPath) {
      const meta = await probeVideoMetadata(diskPath);
      if (meta.duration > 0) {
        reelDuration = meta.duration;
        if (meta.duration > SERVER_VIDEO_LIMITS.REEL_MAX_SECONDS + 1) {
          const formatted = formatServerDuration(meta.duration);
          throw new Error(
            `This video is ${formatted} long, which exceeds the Reel limit of ${SERVER_VIDEO_LIMITS.REEL_MAX_LABEL}. Please publish it as a standard Feed Post instead (supports up to 60 minutes).`
          );
        }
      }
    }

    // Auto-provide matching thumbnail if none
    if (!thumbnailUrl) {
      thumbnailUrl = '/uploads/sample-blazes.jpg';
    }

    let audioTrack = dataInput.audioId
      ? data.musicTracks.find(t => t.id === dataInput.audioId)
      : undefined;

    // Original Audio Detection: If creator uploaded video without third-party soundtrack,
    // automatically register creator's audio as "Original Audio" reusable across ISHARA
    if (!audioTrack && videoUrl) {
      try {
        const creatorName = user.displayName || user.username || 'Creator';
        audioTrack = MusicService.createTrack({
          title: `${creatorName} • Original Audio`,
          artist: creatorName,
          creatorName: creatorName,
          creatorUsername: user.username,
          creatorAvatarUrl: user.avatarUrl,
          audioUrl: videoUrl,
          storagePath: videoUrl,
          coverUrl: thumbnailUrl || user.avatarUrl,
          duration: Math.max(1, Math.round(reelDuration || 30)),
          genre: 'Original',
          isOriginal: true,
          visibility: 'PUBLIC'
        }, user.id, creatorName, user.username, user.avatarUrl);
      } catch (audioErr) {
        console.warn('[ReelService] Original audio registration notice:', audioErr);
      }
    }

    const authorPreview: UserPreview = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      verified: user.verified
    };

    const newReel: Reel = {
      id: `reel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      author: authorPreview,
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      caption: dataInput.caption,
      duration: reelDuration,
      videoDuration: reelDuration,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      audio: audioTrack,
      audioId: audioTrack ? audioTrack.id : undefined,
      audioStartTime: dataInput.audioStartTime,
      audioEndTime: dataInput.audioEndTime,
      audioVolume: dataInput.audioVolume,
      originalAudioVolume: dataInput.originalAudioVolume,
      createdAt: new Date().toISOString()
    };

    data.reels.unshift(newReel);
    db.saveData();

    FirebaseSyncService.syncReel(newReel).catch(() => {});

    // Track audio usage for trending signals
    if (audioTrack) {
      MusicService.recordUsage(audioTrack.id, newReel.id, 'reel', user.id);
    }

    // Bind permanent media record to this reel
    if (newReel.videoUrl) {
      MediaStorageService.bindContentId(newReel.videoUrl, newReel.id, user.id);
    }
    if (newReel.thumbnailUrl) {
      MediaStorageService.bindContentId(newReel.thumbnailUrl, newReel.id, user.id);
    }

    // Broadcast new reel event in real time to all connected clients
    RealtimeService.broadcast({
      type: 'REEL_CREATED',
      reel: newReel
    });

    return newReel;
  }

  public static toggleLike(reelId: string, userId: string): { isLiked: boolean; likesCount: number } {
    const data = db.getData();
    const reel = data.reels.find(r => r.id === reelId);
    if (!reel) throw new Error('Reel not found.');

    const user = data.users.find(u => u.id === userId);
    if (user?.isBanned) {
      throw new Error('Your account is banned.');
    }

    if (!data.likedReelIds[userId]) {
      data.likedReelIds[userId] = [];
    }

    const isLiked = data.likedReelIds[userId].includes(reelId);

    if (isLiked) {
      data.likedReelIds[userId] = data.likedReelIds[userId].filter(id => id !== reelId);
      reel.likesCount = Math.max(0, reel.likesCount - 1);
    } else {
      data.likedReelIds[userId].push(reelId);
      reel.likesCount += 1;

      NotificationService.createNotification({
        userId: reel.userId,
        actorId: userId,
        type: 'LIKE',
        targetId: reelId,
        previewText: 'liked your reel.'
      });
    }

    db.saveData();
    return { isLiked: !isLiked, likesCount: reel.likesCount };
  }

  public static deleteReel(reelId: string, userId: string): boolean {
    const data = db.getData();
    const idx = data.reels.findIndex(r => r.id === reelId);
    if (idx === -1) throw new Error('Reel not found.');

    const reel = data.reels[idx];
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found.');

    const isOwner = reel.userId === userId;
    const isAdmin = user.role === 'OWNER_ADMIN' || user.role === 'ADMIN' || user.username?.toLowerCase() === 'shuv' || user.id === 'user-shuv';

    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission to delete this reel.');
    }

    data.reels.splice(idx, 1);
    data.comments = data.comments.filter(c => c.postId !== reelId);

    // Enforce strict media delete policy: only content owner or admin can delete
    if (reel.videoUrl) {
      MediaStorageService.deleteMedia(reel.videoUrl, userId, isAdmin);
    }
    if (reel.thumbnailUrl) {
      MediaStorageService.deleteMedia(reel.thumbnailUrl, userId, isAdmin);
    }

    db.saveData();

    RealtimeService.broadcast({
      type: 'REEL_DELETED',
      reelId
    });

    return true;
  }
}
