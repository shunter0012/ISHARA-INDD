import { db } from '../db';
import { Post, Comment, UserPreview, CarouselItem } from '../../src/types/index';
import { NotificationService } from './NotificationService';
import { RealtimeService } from './RealtimeService';
import { FollowService } from './FollowService';
import { OWNER_ADMIN_UID } from '../utils/security';
import { MediaStorageService } from './MediaStorageService';
import { MusicService } from './MusicService';
import { FirebaseSyncService } from './FirebaseSyncService';
import { probeVideoMetadata, SERVER_VIDEO_LIMITS, formatServerDuration } from '../utils/videoProbe';

export class PostService {
  public static sanitizePost(post: Post): Post {
    let mediaUrl = post.mediaUrl;
    let thumbnailUrl = post.thumbnailUrl;

    if (mediaUrl) {
      if (mediaUrl.includes('commondatastorage.googleapis.com')) {
        if (mediaUrl.includes('Escapes')) mediaUrl = '/uploads/sample-escapes.mp4';
        else if (mediaUrl.includes('Fun')) mediaUrl = '/uploads/sample-fun.mp4';
        else if (mediaUrl.includes('BigBuck') || mediaUrl.includes('nature') || mediaUrl.includes('flower')) mediaUrl = '/uploads/sample-nature.mp4';
        else mediaUrl = '/uploads/sample-ocean.mp4';
      }
    }

    if (post.mediaType === 'video') {
      if (!thumbnailUrl || thumbnailUrl.includes('commondatastorage.googleapis.com')) {
        if (mediaUrl?.includes('sample-escapes')) thumbnailUrl = '/uploads/sample-escapes.jpg';
        else if (mediaUrl?.includes('sample-fun')) thumbnailUrl = '/uploads/sample-fun.jpg';
        else if (mediaUrl?.includes('sample-nature')) thumbnailUrl = '/uploads/sample-nature.jpg';
        else thumbnailUrl = '/uploads/sample-nature.jpg';
      }
    }

    return {
      ...post,
      mediaUrl,
      thumbnailUrl
    };
  }

  public static getFeedPosts(userId?: string): Post[] {
    const data = db.getData();
    const liked = userId ? data.likedPostIds[userId] || [] : [];
    const saved = userId ? data.savedPostIds[userId] || [] : [];

    // Filter out posts from banned users and ensure user content is published across the feed
    const filtered = data.posts.filter(p => {
      const author = data.users.find(u => u.id === p.userId);
      if (!author) return false;
      if (author.isBanned) return false;

      // Only restrict if the post is explicitly marked private
      if (author.isPrivate && (p as any).visibility === 'PRIVATE') {
        if (!userId) return false;
        if (userId === author.id) return true;
        const rel = FollowService.getRelationshipState(userId, author.id);
        return rel.isFollowing;
      }

      return true;
    });

    return filtered
      .map(p => {
        const sanitized = PostService.sanitizePost(p);
        return {
          ...sanitized,
          isLiked: liked.includes(p.id),
          isSaved: saved.includes(p.id)
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getPostById(postId: string, userId?: string): Post | null {
    const data = db.getData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return null;

    const author = data.users.find(u => u.id === post.userId);
    if (!author || author.isBanned) return null;

    if (author.isPrivate && (post as any).visibility === 'PRIVATE') {
      if (!userId) return null;
      if (userId !== author.id) {
        const rel = FollowService.getRelationshipState(userId, author.id);
        if (!rel.isFollowing) return null;
      }
    }

    const liked = userId ? data.likedPostIds[userId] || [] : [];
    const saved = userId ? data.savedPostIds[userId] || [] : [];

    const sanitized = PostService.sanitizePost(post);
    return {
      ...sanitized,
      isLiked: liked.includes(post.id),
      isSaved: saved.includes(post.id)
    };
  }

  public static async createPost(dataInput: {
    userId: string;
    caption: string;
    mediaType?: 'image' | 'video' | 'carousel';
    mediaUrl?: string;
    thumbnailUrl?: string;
    carouselItems?: CarouselItem[];
    audioId?: string;
    audioStartTime?: number;
    audioEndTime?: number;
    audioVolume?: number;
    originalAudioVolume?: number;
    location?: string;
    tags?: string[];
  }): Promise<Post> {
    const data = db.getData();
    const authorUser = data.users.find(u => u.id === dataInput.userId);
    if (!authorUser) {
      throw new Error('User not found.');
    }

    if (authorUser.isBanned) {
      throw new Error('Your account is banned. You cannot create posts.');
    }

    const trimmedCaption = (dataInput.caption || '').trim();
    let mediaUrl = (dataInput.mediaUrl || '').trim();
    let thumbnailUrl = (dataInput.thumbnailUrl || '').trim();
    const isCarousel = Boolean(
      dataInput.mediaType === 'carousel' ||
      (Array.isArray(dataInput.carouselItems) && dataInput.carouselItems.length > 0)
    );

    if (!trimmedCaption && !mediaUrl && !isCarousel) {
      throw new Error('Please provide either a photo, video, carousel, or caption to publish.');
    }

    let processedCarouselItems: CarouselItem[] | undefined = undefined;
    let postVideoDuration: number | undefined = undefined;

    // 1. Validate Carousel Items if this is a carousel post
    if (isCarousel && dataInput.carouselItems && dataInput.carouselItems.length > 0) {
      processedCarouselItems = [];
      for (let i = 0; i < dataInput.carouselItems.length; i++) {
        const item = dataInput.carouselItems[i];
        let itemUrl = item.mediaUrl || '';
        if (itemUrl.startsWith('blob:')) {
          throw new Error('Temporary Blob URLs cannot be saved in carousel items.');
        }

        let itemDuration = item.duration;

        if (item.mediaType === 'video') {
          const diskPath = MediaStorageService.getDiskPath(itemUrl);
          if (diskPath) {
            const meta = await probeVideoMetadata(diskPath);
            if (meta.duration > 0) {
              itemDuration = meta.duration;
            }
          }

          // Strict Carousel Rule: Each individual video inside a carousel can be up to 60 seconds
          if (itemDuration && itemDuration > SERVER_VIDEO_LIMITS.CAROUSEL_ITEM_MAX_SECONDS + 1) {
            const formatted = formatServerDuration(itemDuration);
            throw new Error(
              `Video "${item.originalName || `Item ${i + 1}`}" is ${formatted} long. Videos inside carousel posts cannot exceed 60 seconds. Please select a shorter video or share this video as a standard Feed Post (supports up to 60 minutes).`
            );
          }
        }

        processedCarouselItems.push({
          ...item,
          duration: itemDuration
        });
      }

      // Use first item as default preview media
      if (!mediaUrl && processedCarouselItems.length > 0) {
        mediaUrl = processedCarouselItems[0].mediaUrl;
        thumbnailUrl = processedCarouselItems[0].thumbnailUrl || '';
      }
    } else {
      // 2. Prohibit temporary Blob URLs from ever entering the database
      if (mediaUrl.startsWith('blob:')) {
        throw new Error('Temporary Blob URLs cannot be saved. Please complete media upload to permanent storage.');
      }
      if (thumbnailUrl.startsWith('blob:')) {
        thumbnailUrl = '';
      }

      // If client supplied a Data URL, save to permanent storage first
      if (mediaUrl.startsWith('data:')) {
        const savedMedia = await MediaStorageService.saveBase64Media(mediaUrl, authorUser.id, 'post');
        mediaUrl = savedMedia.storagePath;
      }
      if (thumbnailUrl.startsWith('data:')) {
        const savedThumb = await MediaStorageService.saveBase64Media(thumbnailUrl, authorUser.id, 'thumb');
        thumbnailUrl = savedThumb.storagePath;
      }

      // Verify the permanent storage object exists before publishing the post
      if (mediaUrl) {
        const verification = MediaStorageService.verifyObject(mediaUrl);
        if (!verification.exists) {
          throw new Error('Media file upload has not completed or could not be verified in permanent storage. Please retry.');
        }
      }

      // 3. Validate Single Video Duration (Feed Post: up to 60 minutes)
      const isVideoPost = dataInput.mediaType === 'video' || (mediaUrl && (mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.webm') || mediaUrl.endsWith('.mov')));
      if (isVideoPost && mediaUrl) {
        const diskPath = MediaStorageService.getDiskPath(mediaUrl);
        if (diskPath) {
          const meta = await probeVideoMetadata(diskPath);
          if (meta.duration > 0) {
            postVideoDuration = meta.duration;
            // Feed Post Rule: Max 60 minutes (3600 seconds)
            if (meta.duration > SERVER_VIDEO_LIMITS.FEED_MAX_SECONDS + 5) {
              const formatted = formatServerDuration(meta.duration);
              throw new Error(
                `Video length (${formatted}) exceeds the maximum allowed limit of ${SERVER_VIDEO_LIMITS.FEED_MAX_LABEL} for Feed Posts. Please choose a video under 60 minutes.`
              );
            }
          }
        }
      }
    }

    let audioTrack = dataInput.audioId 
      ? data.musicTracks.find(t => t.id === dataInput.audioId) 
      : undefined;

    const finalMediaType: 'image' | 'video' | 'carousel' = isCarousel 
      ? 'carousel' 
      : (dataInput.mediaType || (postVideoDuration ? 'video' : 'image'));

    // Original Audio Detection for video posts / video carousel items
    if (!audioTrack && (finalMediaType === 'video' || (finalMediaType === 'carousel' && processedCarouselItems?.some(i => i.mediaType === 'video')))) {
      try {
        const creatorName = authorUser.displayName || authorUser.username || 'Creator';
        const primaryVideoUrl = mediaUrl || processedCarouselItems?.find(i => i.mediaType === 'video')?.mediaUrl;
        if (primaryVideoUrl) {
          audioTrack = MusicService.createTrack({
            title: `${creatorName} • Original Audio`,
            artist: creatorName,
            creatorName: creatorName,
            creatorUsername: authorUser.username,
            creatorAvatarUrl: authorUser.avatarUrl,
            audioUrl: primaryVideoUrl,
            storagePath: primaryVideoUrl,
            coverUrl: thumbnailUrl || authorUser.avatarUrl,
            duration: Math.max(1, Math.round(postVideoDuration || 30)),
            genre: 'Original',
            isOriginal: true,
            visibility: 'PUBLIC'
          }, authorUser.id, creatorName, authorUser.username, authorUser.avatarUrl);
        }
      } catch (audioErr) {
        console.warn('[PostService] Original audio registration notice:', audioErr);
      }
    }

    const authorPreview: UserPreview = {
      id: authorUser.id,
      username: authorUser.username,
      displayName: authorUser.displayName,
      avatarUrl: authorUser.avatarUrl,
      role: authorUser.role,
      verified: authorUser.verified
    };

    const newPost: Post = {
      id: `post-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: authorUser.id,
      author: authorPreview,
      caption: trimmedCaption,
      mediaType: finalMediaType,
      mediaUrl: mediaUrl || '',
      thumbnailUrl: thumbnailUrl || undefined,
      carouselItems: processedCarouselItems,
      videoDuration: postVideoDuration,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      audio: audioTrack,
      audioId: audioTrack ? audioTrack.id : undefined,
      audioStartTime: dataInput.audioStartTime,
      audioEndTime: dataInput.audioEndTime,
      audioVolume: dataInput.audioVolume,
      originalAudioVolume: dataInput.originalAudioVolume,
      location: dataInput.location,
      tags: dataInput.tags || [],
      createdAt: new Date().toISOString()
    };

    data.posts.unshift(newPost);
    authorUser.postsCount = (authorUser.postsCount || 0) + 1;
    db.saveData();

    // Track audio usage for trending signals
    if (audioTrack) {
      MusicService.recordUsage(audioTrack.id, newPost.id, 'post', authorUser.id);
    }

    // Bind permanent media record to this post
    if (newPost.mediaUrl) {
      MediaStorageService.bindContentId(newPost.mediaUrl, newPost.id, authorUser.id);
    }
    if (newPost.thumbnailUrl) {
      MediaStorageService.bindContentId(newPost.thumbnailUrl, newPost.id, authorUser.id);
    }

    RealtimeService.broadcast({
      type: 'POST_CREATED',
      post: newPost
    });

    FirebaseSyncService.syncPost(newPost).catch(() => {});

    return newPost;
  }

  public static toggleLike(postId: string, userId: string): { isLiked: boolean; likesCount: number } {
    const data = db.getData();
    const user = data.users.find(u => u.id === userId);
    if (user?.isBanned) throw new Error('Your account is banned.');

    const post = data.posts.find(p => p.id === postId);
    if (!post) throw new Error('Post not found.');

    if (!data.likedPostIds[userId]) {
      data.likedPostIds[userId] = [];
    }

    const isLiked = data.likedPostIds[userId].includes(postId);

    if (isLiked) {
      data.likedPostIds[userId] = data.likedPostIds[userId].filter(id => id !== postId);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      data.likedPostIds[userId].push(postId);
      post.likesCount += 1;

      NotificationService.createNotification({
        userId: post.userId,
        actorId: userId,
        type: 'LIKE',
        targetId: postId,
        previewText: 'liked your post.'
      });
    }

    db.saveData();
    return { isLiked: !isLiked, likesCount: post.likesCount };
  }

  public static toggleSave(postId: string, userId: string): { isSaved: boolean } {
    const data = db.getData();
    if (!data.savedPostIds[userId]) {
      data.savedPostIds[userId] = [];
    }

    const isSaved = data.savedPostIds[userId].includes(postId);
    if (isSaved) {
      data.savedPostIds[userId] = data.savedPostIds[userId].filter(id => id !== postId);
    } else {
      data.savedPostIds[userId].push(postId);
    }

    db.saveData();
    return { isSaved: !isSaved };
  }

  public static getComments(postId: string, userId?: string): Comment[] {
    const data = db.getData();
    const liked = userId ? data.likedCommentIds[userId] || [] : [];
    return data.comments
      .filter(c => c.postId === postId)
      .map(c => ({
        ...c,
        isLiked: liked.includes(c.id)
      }));
  }

  public static toggleCommentLike(commentId: string, userId: string): { isLiked: boolean; likesCount: number } {
    const data = db.getData();
    const user = data.users.find(u => u.id === userId);
    if (user?.isBanned) throw new Error('Your account is banned.');

    const comment = data.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comment not found.');

    if (!data.likedCommentIds[userId]) {
      data.likedCommentIds[userId] = [];
    }

    const isLiked = data.likedCommentIds[userId].includes(commentId);
    if (isLiked) {
      data.likedCommentIds[userId] = data.likedCommentIds[userId].filter(id => id !== commentId);
      comment.likesCount = Math.max(0, (comment.likesCount || 0) - 1);
    } else {
      data.likedCommentIds[userId].push(commentId);
      comment.likesCount = (comment.likesCount || 0) + 1;
    }

    db.saveData();
    return { isLiked: !isLiked, likesCount: comment.likesCount };
  }

  public static addComment(targetId: string, userId: string, text: string): Comment {
    const data = db.getData();
    const post = data.posts.find(p => p.id === targetId);
    const reel = !post ? data.reels.find(r => r.id === targetId) : undefined;
    const ad = (!post && !reel) ? data.ads?.find(a => a.id === targetId || `ad-reel-${a.id}` === targetId) : undefined;
    const user = data.users.find(u => u.id === userId);

    if ((!post && !reel && !ad) || !user) {
      throw new Error('Invalid post, reel, or user.');
    }
    if (user.isBanned) {
      throw new Error('Your account is banned. You cannot comment.');
    }

    const authorPreview: UserPreview = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      verified: user.verified
    };

    const newComment: Comment = {
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      postId: targetId,
      userId: user.id,
      author: authorPreview,
      text: text.trim(),
      likesCount: 0,
      createdAt: new Date().toISOString()
    };

    data.comments.push(newComment);

    if (post) {
      post.commentsCount = (post.commentsCount || 0) + 1;
      if (post.userId !== userId) {
        NotificationService.createNotification({
          userId: post.userId,
          actorId: userId,
          type: 'COMMENT',
          targetId: post.id,
          previewText: `commented: "${text.substring(0, 30)}..."`
        });
      }
      RealtimeService.broadcast({
        type: 'POST_COMMENT_ADDED',
        postId: post.id,
        commentsCount: post.commentsCount,
        comment: newComment
      });
    } else if (reel) {
      reel.commentsCount = (reel.commentsCount || 0) + 1;
      if (reel.userId !== userId) {
        NotificationService.createNotification({
          userId: reel.userId,
          actorId: userId,
          type: 'COMMENT',
          targetId: reel.id,
          previewText: `commented on your reel: "${text.substring(0, 30)}..."`
        });
      }
      RealtimeService.broadcast({
        type: 'REEL_COMMENT_ADDED',
        reelId: reel.id,
        commentsCount: reel.commentsCount,
        comment: newComment
      });
    }

    db.saveData();
    return newComment;
  }

  public static deleteComment(commentId: string, userId: string): { success: boolean; targetId: string; commentsCount: number } {
    const data = db.getData();
    const commentIdx = data.comments.findIndex(c => c.id === commentId);
    if (commentIdx === -1) throw new Error('Comment not found.');

    const comment = data.comments[commentIdx];
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found.');

    const post = data.posts.find(p => p.id === comment.postId);
    const reel = !post ? data.reels.find(r => r.id === comment.postId) : undefined;

    const isCommentAuthor = comment.userId === userId;
    const isTargetAuthor = (post && post.userId === userId) || (reel && reel.userId === userId);
    const isAdmin = user.role === 'OWNER_ADMIN' || user.role === 'ADMIN' || user.username?.toLowerCase() === 'shuv' || user.id === 'user-shuv';

    if (!isCommentAuthor && !isTargetAuthor && !isAdmin) {
      throw new Error('You do not have permission to delete this comment.');
    }

    data.comments.splice(commentIdx, 1);

    let updatedCount = 0;
    if (post) {
      post.commentsCount = Math.max(0, (post.commentsCount || 1) - 1);
      updatedCount = post.commentsCount;
      RealtimeService.broadcast({
        type: 'POST_COMMENT_DELETED',
        postId: post.id,
        commentsCount: post.commentsCount,
        commentId
      });
    } else if (reel) {
      reel.commentsCount = Math.max(0, (reel.commentsCount || 1) - 1);
      updatedCount = reel.commentsCount;
      RealtimeService.broadcast({
        type: 'REEL_COMMENT_DELETED',
        reelId: reel.id,
        commentsCount: reel.commentsCount,
        commentId
      });
    }

    db.saveData();
    return { success: true, targetId: comment.postId, commentsCount: updatedCount };
  }

  public static deletePost(postId: string, userId: string): boolean {
    const data = db.getData();
    const idx = data.posts.findIndex(p => p.id === postId);
    if (idx === -1) throw new Error('Post not found.');

    const post = data.posts[idx];
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found.');

    const isOwner = post.userId === userId;
    const isAdmin = user.role === 'OWNER_ADMIN' || user.role === 'ADMIN' || user.username?.toLowerCase() === 'shuv' || user.id === 'user-shuv';

    if (!isOwner && !isAdmin) {
      throw new Error('You do not have permission to delete this post.');
    }

    data.posts.splice(idx, 1);
    data.comments = data.comments.filter(c => c.postId !== postId);

    // Enforce strict media delete policy: only content owner or admin can delete
    if (post.mediaUrl) {
      MediaStorageService.deleteMedia(post.mediaUrl, userId, isAdmin);
    }
    if (post.thumbnailUrl) {
      MediaStorageService.deleteMedia(post.thumbnailUrl, userId, isAdmin);
    }

    const author = data.users.find(u => u.id === post.userId);
    if (author) {
      author.postsCount = Math.max(0, (author.postsCount || 1) - 1);
    }

    db.saveData();

    RealtimeService.broadcast({
      type: 'POST_DELETED',
      postId
    });

    return true;
  }
}
