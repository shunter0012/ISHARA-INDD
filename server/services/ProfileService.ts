import { db } from '../db';
import { UserProfile, Post, Reel, User } from '../../src/types/index';
import { FollowService } from './FollowService';
import { MediaStorageService } from './MediaStorageService';
import { PostService } from './PostService';
import { ReelService } from './ReelService';
import { FirebaseSyncService } from './FirebaseSyncService';
import { 
  OWNER_ADMIN_UID, 
  OWNER_ADMIN_USERNAME, 
  normalizeUsername, 
  validateUsernameFormat 
} from '../utils/security';

export class ProfileService {
  public static getProfile(targetUsername: string, currentUserId?: string): {
    profile: UserProfile;
    posts: Post[];
    reels: Reel[];
    savedPosts: Post[];
  } {
    const data = db.getData();
    const clean = normalizeUsername(targetUsername);
    const user = data.users.find(u => 
      normalizeUsername(u.username) === clean || 
      u.id === targetUsername ||
      u.id === clean
    );
    if (!user) {
      throw new Error(`User "${targetUsername}" not found.`);
    }

    // Ensure MediaStorageService is imported for permanent storage verification
    const rel = currentUserId 
      ? FollowService.getRelationshipState(currentUserId, user.id)
      : { state: 'Follow' as const, isFollowing: false, isRequested: false };

    const profile: UserProfile = {
      ...user,
      isFollowing: rel.isFollowing,
      isRequested: rel.isRequested,
      relationshipState: rel.state
    };

    const userPosts = data.posts
      .filter(p => p.userId === user.id)
      .map(p => {
        const sanitized = PostService.sanitizePost(p);
        return {
          ...sanitized,
          isLiked: currentUserId ? (data.likedPostIds[currentUserId] || []).includes(p.id) : false,
          isSaved: currentUserId ? (data.savedPostIds[currentUserId] || []).includes(p.id) : false
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const userReels = data.reels
      .filter(r => r.userId === user.id)
      .map(r => {
        const sanitized = ReelService.sanitizeReel(r);
        return {
          ...sanitized,
          isLiked: currentUserId ? (data.likedReelIds[currentUserId] || []).includes(r.id) : false
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const savedPostIds = currentUserId === user.id ? (data.savedPostIds[user.id] || []) : [];
    const savedPosts = data.posts.filter(p => savedPostIds.includes(p.id));

    return {
      profile,
      posts: userPosts,
      reels: userReels,
      savedPosts
    };
  }

  public static async updateProfile(userId: string, updates: Partial<User>): Promise<User> {
    const data = db.getData();
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found.');

    // Handle username update safely with validation & uniqueness checks
    if (updates.username && updates.username.trim() !== '') {
      const rawNew = updates.username.trim();
      const norm = normalizeUsername(rawNew);
      
      if (norm !== normalizeUsername(user.username)) {
        // Enforce format & reserved username checks
        const check = validateUsernameFormat(norm);
        if (!check.isValid) {
          throw new Error(check.error || 'Invalid username.');
        }

        // Enforce uniqueness
        if (!data.usernames) data.usernames = {};
        const existingUid = data.usernames[norm];
        if (existingUid && existingUid !== userId) {
          throw new Error('This username is already taken.');
        }

        // Clean up old mapping and register new
        delete data.usernames[normalizeUsername(user.username)];
        data.usernames[norm] = userId;
        user.username = norm;
      }
    }

    if (updates.displayName) user.displayName = updates.displayName.trim();
    if (updates.bio !== undefined) user.bio = updates.bio;

    if (updates.avatarBase64 && updates.avatarBase64.startsWith('data:image/')) {
      user.avatarBase64 = updates.avatarBase64;
      try {
        const saved = await MediaStorageService.saveBase64Media(updates.avatarBase64, user.id, 'avatar');
        user.avatarUrl = saved.storagePath;
      } catch (err) {
        console.warn('[ProfileService] Failed saving avatar base64 to storage:', err);
      }
    }

    if (updates.avatarUrl !== undefined && updates.avatarUrl !== '') {
      let av = (updates.avatarUrl || '').trim();
      if (av.startsWith('blob:')) {
        throw new Error('Temporary Blob URLs cannot be saved as permanent profile pictures.');
      } else if (av.startsWith('data:')) {
        user.avatarBase64 = av;
        const saved = await MediaStorageService.saveBase64Media(av, user.id, 'avatar');
        user.avatarUrl = saved.storagePath;
      } else if (av.startsWith('/uploads/')) {
        user.avatarUrl = av;
      } else if (av) {
        user.avatarUrl = av;
      }

      if (user.avatarUrl.startsWith('/uploads/')) {
        MediaStorageService.bindContentId(user.avatarUrl, user.id, user.id);
      }
    } else if (updates.avatarUrl === '') {
      // Explicit reset to clean initials avatar
      user.avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.username)}&backgroundColor=18181b,0f172a&textColor=ffffff&fontWeight=700`;
      user.avatarBase64 = undefined;
    }

    if (updates.isPrivate !== undefined) user.isPrivate = Boolean(updates.isPrivate);
    if (updates.phone !== undefined) {
      const trimmedPhone = (updates.phone || '').trim();
      user.phone = trimmedPhone || undefined;
      if (trimmedPhone) {
        if (!data.usernames) data.usernames = {};
        data.usernames[trimmedPhone] = user.id;
      }
    }

    // Propagate profile picture, display name, and username updates to all user-authored content
    // so profile updates remain consistent across all views in the web app
    const updatedAvatar = user.avatarUrl;
    const updatedAvatarBase64 = user.avatarBase64;
    const updatedName = user.displayName;
    const updatedUsername = user.username;

    if (data.posts) {
      data.posts.forEach(p => {
        if (p.userId === userId && p.author) {
          p.author.avatarUrl = updatedAvatar;
          if (updatedAvatarBase64) p.author.avatarBase64 = updatedAvatarBase64;
          if (updatedName) p.author.displayName = updatedName;
          if (updatedUsername) p.author.username = updatedUsername;
        }
      });
    }

    if (data.reels) {
      data.reels.forEach(r => {
        if (r.userId === userId && r.author) {
          r.author.avatarUrl = updatedAvatar;
          if (updatedAvatarBase64) r.author.avatarBase64 = updatedAvatarBase64;
          if (updatedName) r.author.displayName = updatedName;
          if (updatedUsername) r.author.username = updatedUsername;
        }
      });
    }

    if (data.stories) {
      data.stories.forEach(s => {
        if (s.userId === userId && s.author) {
          s.author.avatarUrl = updatedAvatar;
          if (updatedAvatarBase64) s.author.avatarBase64 = updatedAvatarBase64;
          if (updatedName) s.author.displayName = updatedName;
          if (updatedUsername) s.author.username = updatedUsername;
        }
      });
    }

    if (data.comments) {
      data.comments.forEach(c => {
        if (c.userId === userId && c.author) {
          c.author.avatarUrl = updatedAvatar;
          if (updatedAvatarBase64) c.author.avatarBase64 = updatedAvatarBase64;
          if (updatedName) c.author.displayName = updatedName;
          if (updatedUsername) c.author.username = updatedUsername;
        }
      });
    }

    // Explicitly reject privilege escalation attempts
    // Roles can never be changed via updateProfile

    db.saveData();
    FirebaseSyncService.syncUser(user).catch(() => {});
    return user;
  }
}
