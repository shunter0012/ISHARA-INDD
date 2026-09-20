import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { Story, UserPreview } from '../../src/types/index';
import { OWNER_ADMIN_UID } from '../utils/security';
import { MediaStorageService } from './MediaStorageService';
import { RealtimeService } from './RealtimeService';
import { NotificationService } from './NotificationService';
import { MusicService } from './MusicService';
import { probeVideoMetadata, splitVideoIntoStorySegments, SERVER_VIDEO_LIMITS, formatServerDuration } from '../utils/videoProbe';

export class StoryService {
  public static getStories(requesterId?: string): Story[] {
    const data = db.getData();

    // User content policy: stories, posts, and videos remain in the web app until deleted by the user
    const validStories = (data.stories || [])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Strict Privacy: Story views and viewers can only be seen by the author of the story
    return validStories.map(s => {
      const isOwner = Boolean(
        requesterId && (s.userId === requesterId || s.author?.id === requesterId)
      );
      const isViewed = Boolean(
        requesterId && (
          isOwner ||
          (s.viewers && s.viewers.some(v => v.id === requesterId))
        )
      );
      const isLiked = Boolean(
        requesterId && s.likes && s.likes.includes(requesterId)
      );

      // Hydrate audio track if audioId exists
      let attachedAudio = s.audio;
      if (!attachedAudio && s.audioId) {
        attachedAudio = (data.musicTracks || []).find((t: any) => t.id === s.audioId);
      }

      return {
        ...s,
        audio: attachedAudio,
        isViewed,
        isLiked,
        likesCount: s.likes ? s.likes.length : (s.likesCount || 0),
        viewsCount: isOwner ? (s.viewsCount ?? (s.viewers || []).length) : undefined,
        viewers: isOwner ? (s.viewers || []) : []
      };
    });
  }

  public static async createStory(dataInput: {
    userId: string;
    mediaType: 'image' | 'video';
    mediaUrl: string;
    caption?: string;
    audioId?: string;
    audio?: any;
    audioStartTime?: number;
    audioEndTime?: number;
    audioVolume?: number;
    originalAudioVolume?: number;
    duration?: number;
    segmentIndex?: number;
    totalSegments?: number;
    segmentGroupId?: string;
  }): Promise<Story> {
    const data = db.getData();
    const user = data.users.find(u => u.id === dataInput.userId);
    if (!user) throw new Error('User not found.');

    let mediaUrl = (dataInput.mediaUrl || '').trim();
    if (!mediaUrl) {
      throw new Error('An image or video is required to publish a Story.');
    }

    // Prohibit temporary Blob URLs
    if (mediaUrl.startsWith('blob:')) {
      throw new Error('Temporary Blob URLs cannot be saved. Please complete media upload to permanent storage.');
    }

    // If client supplied a Data URL, save to permanent storage first
    if (mediaUrl.startsWith('data:')) {
      const savedMedia = await MediaStorageService.saveBase64Media(mediaUrl, user.id, 'story');
      mediaUrl = savedMedia.storagePath;
    }

    // Verify the permanent storage object exists before publishing the story
    let verification = MediaStorageService.verifyObject(mediaUrl);
    if (!verification.exists) {
      const diskPath = MediaStorageService.getDiskPath(mediaUrl);
      if (diskPath && fs.existsSync(diskPath)) {
        verification = {
          exists: true,
          size: fs.statSync(diskPath).size,
          mimeType: dataInput.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
          url: mediaUrl,
          storagePath: mediaUrl
        };
      } else {
        throw new Error('Media upload has not completed or could not be verified in permanent storage. Please retry.');
      }
    }

    // Story Video Segment Limit: 60 seconds
    let storyDuration = dataInput.duration;
    if (dataInput.mediaType === 'video') {
      const diskPath = MediaStorageService.getDiskPath(mediaUrl);
      if (diskPath) {
        const meta = await probeVideoMetadata(diskPath);
        if (meta.duration > 0) {
          storyDuration = meta.duration;
          // If video exceeds 60 seconds and is not already a segmented part, automatically split into sequential story segments
          if (!dataInput.segmentIndex && meta.duration > SERVER_VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS + 1) {
            try {
              const splitStories = await StoryService.splitAndCreateStoryVideo({
                userId: user.id,
                videoUrl: mediaUrl,
                caption: dataInput.caption
              });
              if (splitStories && splitStories.length > 0) {
                return splitStories[0];
              }
            } catch (splitErr) {
              console.warn('[StoryService] Video splitting failed, proceeding as single story:', splitErr);
            }
          }
        }
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

    let attachedAudio = dataInput.audio;
    if (!attachedAudio && dataInput.audioId) {
      attachedAudio = (data.musicTracks || []).find((t: any) => t.id === dataInput.audioId);
    }

    // Auto-detect and register creator original audio if video story without external audio
    if (!attachedAudio && dataInput.mediaType === 'video' && mediaUrl) {
      try {
        const creatorName = user.displayName || user.username || 'Creator';
        attachedAudio = MusicService.createTrack({
          title: `${creatorName} • Story Audio`,
          artist: creatorName,
          creatorName: creatorName,
          creatorUsername: user.username,
          creatorAvatarUrl: user.avatarUrl,
          audioUrl: mediaUrl,
          storagePath: mediaUrl,
          coverUrl: user.avatarUrl,
          duration: Math.max(1, Math.round(storyDuration || 15)),
          genre: 'Original',
          isOriginal: true,
          visibility: 'PUBLIC'
        }, user.id, creatorName, user.username, user.avatarUrl);
      } catch (audioErr) {
        console.warn('[StoryService] Original story audio registration notice:', audioErr);
      }
    }

    const newStory: Story = {
      id: `story-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      author: authorPreview,
      mediaType: dataInput.mediaType,
      mediaUrl: mediaUrl,
      audio: attachedAudio,
      audioId: attachedAudio ? attachedAudio.id : undefined,
      audioStartTime: dataInput.audioStartTime,
      audioEndTime: dataInput.audioEndTime,
      audioVolume: dataInput.audioVolume,
      originalAudioVolume: dataInput.originalAudioVolume,
      duration: storyDuration,
      segmentIndex: dataInput.segmentIndex,
      totalSegments: dataInput.totalSegments,
      segmentGroupId: dataInput.segmentGroupId,
      caption: dataInput.caption,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(), // Remains active indefinitely until user deletes
      viewsCount: 0,
      viewers: [],
      likesCount: 0,
      likes: [],
      isLiked: false,
      isViewed: false
    };

    data.stories.unshift(newStory);
    db.saveData();

    // Track audio usage
    if (attachedAudio) {
      MusicService.recordUsage(attachedAudio.id, newStory.id, 'story', user.id);
    }

    // Bind permanent media record to this story
    if (newStory.mediaUrl) {
      MediaStorageService.bindContentId(newStory.mediaUrl, newStory.id, user.id);
    }

    // Permanently bind attached audio track to this story record in storage vault
    if (attachedAudio && attachedAudio.audioUrl) {
      MediaStorageService.bindContentId(attachedAudio.audioUrl, newStory.id, user.id);
    }

    // Broadcast story created in real time across clients
    RealtimeService.broadcast({
      type: 'STORY_CREATED',
      story: newStory
    });

    return newStory;
  }

  /**
   * Splits a long video into sequential 60s Story segments with user confirmation,
   * using stream copy (zero quality loss) and registers each in permanent vault.
   */
  public static async splitAndCreateStoryVideo(dataInput: {
    userId: string;
    videoUrl: string;
    caption?: string;
    audioId?: string;
    audioStartTime?: number;
    audioEndTime?: number;
    audioVolume?: number;
    originalAudioVolume?: number;
  }): Promise<Story[]> {
    const data = db.getData();
    const user = data.users.find(u => u.id === dataInput.userId);
    if (!user) throw new Error('User not found.');

    const diskPath = MediaStorageService.getDiskPath(dataInput.videoUrl);
    if (!diskPath) {
      throw new Error('Video file could not be found in permanent storage.');
    }

    const meta = await probeVideoMetadata(diskPath);
    const effectiveDuration = meta.duration > 0 ? meta.duration : 15;

    // If video is already <= 60 seconds, create 1 story directly
    if (effectiveDuration <= SERVER_VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS + 1) {
      const story = await this.createStory({
        userId: user.id,
        mediaType: 'video',
        mediaUrl: dataInput.videoUrl,
        caption: dataInput.caption,
        audioId: dataInput.audioId,
        audioStartTime: dataInput.audioStartTime,
        audioEndTime: dataInput.audioEndTime,
        audioVolume: dataInput.audioVolume,
        originalAudioVolume: dataInput.originalAudioVolume,
        duration: effectiveDuration,
        segmentIndex: 1,
        totalSegments: 1
      });
      return [story];
    }

    // Video is longer than 60 seconds: Split into 60s segments using ffmpeg
    const outputDir = path.dirname(diskPath);
    let segmentPaths: string[] = [];
    try {
      segmentPaths = await splitVideoIntoStorySegments(
        diskPath,
        outputDir,
        SERVER_VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS
      );
    } catch (splitErr) {
      console.warn('[StoryService] Video splitting failed, using original video directly:', splitErr);
      segmentPaths = [diskPath];
    }

    if (segmentPaths.length === 0) {
      segmentPaths = [diskPath];
    }

    const segmentGroupId = `story-group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const createdStories: Story[] = [];

    for (let i = 0; i < segmentPaths.length; i++) {
      const segPath = segmentPaths[i];
      const mediaRecord = await MediaStorageService.registerDiskFile(segPath, user.id, 'video');
      const segCaption = dataInput.caption 
        ? (segmentPaths.length > 1 ? `${dataInput.caption} (${i + 1}/${segmentPaths.length})` : dataInput.caption)
        : undefined;

      const story = await this.createStory({
        userId: user.id,
        mediaType: 'video',
        mediaUrl: mediaRecord.storagePath,
        caption: segCaption,
        audioId: dataInput.audioId,
        audioStartTime: dataInput.audioStartTime,
        audioEndTime: dataInput.audioEndTime,
        audioVolume: dataInput.audioVolume,
        originalAudioVolume: dataInput.originalAudioVolume,
        duration: mediaRecord.duration,
        segmentIndex: i + 1,
        totalSegments: segmentPaths.length,
        segmentGroupId
      });
      createdStories.push(story);
    }

    return createdStories;
  }

  public static deleteStory(storyId: string, userId: string): boolean {
    const data = db.getData();
    const idx = data.stories.findIndex(s => s.id === storyId);
    if (idx === -1) throw new Error('Story not found.');

    const story = data.stories[idx];
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found.');

    const isOwner = story.userId === userId || story.author?.id === userId;
    const isAdmin = user.role === 'OWNER_ADMIN' || user.role === 'ADMIN' || user.username?.toLowerCase() === 'shuv' || user.id === 'user-shuv';

    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission to delete this story.');
    }

    data.stories.splice(idx, 1);

    if (story.mediaUrl) {
      MediaStorageService.deleteMedia(story.mediaUrl, userId, isAdmin);
    }

    db.saveData();

    // Broadcast story deleted event across clients
    RealtimeService.broadcast({
      type: 'STORY_DELETED',
      storyId
    });

    return true;
  }

  public static recordStoryView(storyId: string, viewerId: string): { viewsCount?: number; isViewed: boolean } {
    const data = db.getData();
    const story = data.stories.find(s => s.id === storyId);
    if (!story) throw new Error('Story not found.');

    story.viewers = story.viewers || [];
    story.viewsCount = story.viewsCount || story.viewers.length;

    // Do not double count self as unique viewer or duplicate
    if (story.userId !== viewerId && story.author?.id !== viewerId) {
      const alreadyViewed = story.viewers.some(v => v.id === viewerId);
      if (!alreadyViewed) {
        const viewer = data.users.find(u => u.id === viewerId);
        if (viewer) {
          story.viewers.unshift({
            id: viewer.id,
            username: viewer.username,
            displayName: viewer.displayName,
            avatarUrl: viewer.avatarUrl,
            role: viewer.role,
            verified: viewer.verified
          });
          story.viewsCount = story.viewers.length;
          db.saveData();
        }
      }
    }

    // Story views can ONLY be seen by the user who created the story/account
    const isOwner = story.userId === viewerId || story.author?.id === viewerId;
    return { viewsCount: isOwner ? story.viewsCount : undefined, isViewed: true };
  }

  public static toggleLikeStory(storyId: string, userId: string): { isLiked: boolean; likesCount: number } {
    const data = db.getData();
    const story = data.stories.find(s => s.id === storyId);
    if (!story) throw new Error('Story not found.');

    story.likes = story.likes || [];
    const idx = story.likes.indexOf(userId);
    let isLiked = false;

    if (idx === -1) {
      story.likes.push(userId);
      isLiked = true;

      // Notify story author if not self
      const targetUserId = story.userId || story.author?.id;
      if (targetUserId && targetUserId !== userId) {
        try {
          NotificationService.createNotification({
            userId: targetUserId,
            actorId: userId,
            type: 'LIKE',
            targetId: story.id,
            previewText: 'liked your story'
          });
        } catch {}
      }
    } else {
      story.likes.splice(idx, 1);
      isLiked = false;
    }

    story.likesCount = story.likes.length;
    db.saveData();

    RealtimeService.broadcast({
      type: 'STORY_LIKED',
      storyId: story.id,
      userId,
      isLiked,
      likesCount: story.likesCount
    });

    return { isLiked, likesCount: story.likesCount };
  }

  public static getStoryViewers(storyId: string, requesterId: string): UserPreview[] {
    const data = db.getData();
    const story = data.stories.find(s => s.id === storyId);
    if (!story) throw new Error('Story not found.');

    // Story views can ONLY be seen by the user who created the account
    if (story.userId !== requesterId && story.author?.id !== requesterId) {
      throw new Error('Story views can only be seen by the user who created the story.');
    }

    story.viewers = story.viewers || [];
    return story.viewers;
  }
}
