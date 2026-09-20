import { db } from '../db';
import { UserPreview, Post, Reel, MusicTrack, Hashtag } from '../../src/types/index';
import { FollowService } from './FollowService';
import { PostService } from './PostService';
import { ReelService } from './ReelService';
import { OWNER_ADMIN_UID, OWNER_ADMIN_USERNAME, normalizeUsername } from '../utils/security';

export class SearchService {
  public static search(query: string, currentUserId?: string): {
    users: UserPreview[];
    posts: Post[];
    reels: Reel[];
    tracks: MusicTrack[];
    hashtags: Hashtag[];
  } {
    const q = (query || '').toLowerCase().trim();
    const data = db.getData();
    const isOwnerRequester = currentUserId === OWNER_ADMIN_UID;

    if (!q) {
      // Return suggested items
      const suggestedUsers: UserPreview[] = data.users
        .filter(u => {
          if (u.id === currentUserId) return false;
          if (u.isBanned) return false;
          return true;
        })
        .slice(0, 10)
        .map(u => {
          const rel = currentUserId ? FollowService.getRelationshipState(currentUserId, u.id) : { state: 'Follow' as const, isFollowing: false, isRequested: false };
          return {
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            role: u.role,
            verified: u.verified,
            followersCount: u.followersCount,
            relationshipState: rel.state
          };
        });

      return {
        users: suggestedUsers,
        posts: [...data.posts]
          .filter(p => !data.users.find(u => u.id === p.userId)?.isBanned)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 24)
          .map(p => PostService.sanitizePost(p)),
        reels: [...data.reels]
          .filter(r => !data.users.find(u => u.id === r.userId)?.isBanned)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 24)
          .map(r => ReelService.sanitizeReel(r)),
        tracks: data.musicTracks.slice(0, 12),
        hashtags: [
          { name: 'creator', postsCount: 124 },
          { name: 'ishara', postsCount: 340 },
          { name: 'photography', postsCount: 520 },
          { name: 'music', postsCount: 890 }
        ]
      };
    }

    const matchedUsers: UserPreview[] = data.users
      .filter(u => {
        if (u.isBanned) return false;
        return u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
      })
      .map(u => {
        const rel = currentUserId ? FollowService.getRelationshipState(currentUserId, u.id) : { state: 'Follow' as const, isFollowing: false, isRequested: false };
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          role: u.role,
          verified: u.verified,
          followersCount: u.followersCount,
          relationshipState: rel.state
        };
      });

    const matchedPosts = data.posts
      .filter(p => {
        const author = data.users.find(u => u.id === p.userId);
        if (author?.isBanned) return false;
        return p.caption.toLowerCase().includes(q) || 
          (p.tags && p.tags.some(t => t.toLowerCase().includes(q))) ||
          (author && (author.username.toLowerCase().includes(q) || author.displayName.toLowerCase().includes(q)));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(p => PostService.sanitizePost(p));

    const matchedReels = data.reels
      .filter(r => {
        const author = data.users.find(u => u.id === r.userId);
        if (author?.isBanned) return false;
        return r.caption.toLowerCase().includes(q) ||
          (author && (author.username.toLowerCase().includes(q) || author.displayName.toLowerCase().includes(q)));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(r => ReelService.sanitizeReel(r));

    const matchedTracks = data.musicTracks.filter(
      t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || (t.genre && t.genre.toLowerCase().includes(q))
    );

    const hashtags: Hashtag[] = [
      { name: q.replace('#', ''), postsCount: matchedPosts.length }
    ];

    return {
      users: matchedUsers,
      posts: matchedPosts,
      reels: matchedReels,
      tracks: matchedTracks,
      hashtags
    };
  }
}
