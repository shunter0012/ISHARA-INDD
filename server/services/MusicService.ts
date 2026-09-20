import { db } from '../db';
import { MusicTrack, Post, Reel } from '../../src/types/index';

export interface GetTracksOptions {
  tab?: 'for-you' | 'trending' | 'saved' | 'original' | 'recent' | 'all';
  query?: string;
  genre?: string;
  creatorId?: string;
  userId?: string;
  page?: number;
  limit?: number;
  isAdmin?: boolean;
}

export class MusicService {
  /**
   * Discovery & Search for audio tracks with real ranking and signal calculations
   */
  public static getTracks(options: GetTracksOptions = {}): { tracks: MusicTrack[]; total: number } {
    const data = db.getData();
    const {
      tab = 'all',
      query = '',
      genre = 'All',
      creatorId,
      userId,
      page = 1,
      limit = 30,
      isAdmin = false
    } = options;

    const cleanQuery = query.trim().toLowerCase();
    const savedIds = new Set(userId && data.audioSaves[userId] ? data.audioSaves[userId] : []);

    // Filter baseline visibility & status
    let candidateTracks = data.musicTracks.filter(t => {
      // Admins see all
      if (isAdmin) return true;

      // Active / Approved tracks
      const isApproved = !t.status || t.status === 'APPROVED' || t.status === 'ACTIVE';
      if (!isApproved) {
        // Owner can still see their own pending/restricted track
        if (userId && t.ownerUid === userId) return true;
        return false;
      }

      // Public tracks can be seen by everyone; Private only by owner
      if (t.visibility === 'PRIVATE') {
        return userId && t.ownerUid === userId;
      }

      return true;
    });

    // Creator filter
    if (creatorId) {
      candidateTracks = candidateTracks.filter(t => 
        t.ownerUid === creatorId || 
        t.creatorId === creatorId || 
        t.creatorUsername?.toLowerCase() === creatorId.toLowerCase()
      );
    }

    // Genre filter
    if (genre && genre.toLowerCase() !== 'all') {
      candidateTracks = candidateTracks.filter(t => 
        t.genre?.toLowerCase() === genre.toLowerCase()
      );
    }

    // Tab-specific filters
    if (tab === 'saved') {
      candidateTracks = candidateTracks.filter(t => savedIds.has(t.id));
    } else if (tab === 'original') {
      candidateTracks = candidateTracks.filter(t => t.isOriginal === true);
    }

    // Compute trending scores & ranking signals
    const now = Date.now();
    const scoredTracks = candidateTracks.map(track => {
      let score = 0;

      // 1. Exact query match boost
      if (cleanQuery) {
        const titleLower = track.title.toLowerCase();
        const artistLower = track.artist.toLowerCase();
        const albumLower = (track.album || '').toLowerCase();
        const creatorLower = (track.creatorName || track.creatorUsername || '').toLowerCase();
        const genreLower = (track.genre || '').toLowerCase();
        const licensingLower = (track.licensing || '').toLowerCase();

        if (titleLower === cleanQuery) {
          score += 2000;
        } else if (titleLower.startsWith(cleanQuery)) {
          score += 1000;
        } else if (titleLower.includes(cleanQuery)) {
          score += 500;
        }

        if (artistLower === cleanQuery || creatorLower === cleanQuery) {
          score += 600;
        } else if (artistLower.includes(cleanQuery) || creatorLower.includes(cleanQuery)) {
          score += 300;
        }

        if (albumLower === cleanQuery) {
          score += 400;
        } else if (albumLower.includes(cleanQuery)) {
          score += 200;
        }

        if (genreLower.includes(cleanQuery)) {
          score += 150;
        }

        if (licensingLower.includes(cleanQuery)) {
          score += 100;
        }

        // If query provided and track does not match any keyword, reject
        if (!titleLower.includes(cleanQuery) && 
            !artistLower.includes(cleanQuery) && 
            !albumLower.includes(cleanQuery) &&
            !creatorLower.includes(cleanQuery) && 
            !genreLower.includes(cleanQuery) &&
            !licensingLower.includes(cleanQuery)) {
          return { track, score: -1, trendingScore: 0 };
        }
      }

      // 2. Real Trending Algorithm (Time-decay engagement formula)
      // Signal weights: Recent uses (5x), Saves (3x), Plays (1x)
      const usageCount = track.usageCount || 0;
      const saveCount = track.saveCount || 0;
      const playCount = track.playCount || 0;

      // Calculate recent uses within last 7 days
      const trackUsages = data.audioUsage.filter(u => u.audioId === track.id);
      const recentUsages = trackUsages.filter(u => {
        const uTime = new Date(u.createdAt).getTime();
        return (now - uTime) < (7 * 24 * 60 * 60 * 1000);
      }).length;

      // Calculate recent plays within last 7 days
      const trackPlays = data.audioPlays.filter(p => p.audioId === track.id);
      const recentPlays = trackPlays.filter(p => {
        const pTime = new Date(p.createdAt).getTime();
        return (now - pTime) < (7 * 24 * 60 * 60 * 1000);
      }).length;

      const trackAgeHours = Math.max(1, (now - new Date(track.createdAt || '2026-01-01').getTime()) / (1000 * 60 * 60));
      const gravity = 1.2;

      // Real engagement momentum
      const momentum = (recentUsages * 15) + (usageCount * 5) + (saveCount * 4) + (recentPlays * 2) + (playCount * 0.1);
      const trendingScore = (momentum + (track.featured ? 50 : 0)) / Math.pow(trackAgeHours + 2, gravity);

      if (tab === 'trending') {
        score += trendingScore * 100;
      } else if (tab === 'for-you') {
        // Balanced recommendation score based on featured status, trending momentum, and variety
        score += (track.featured ? 400 : 0) + (trendingScore * 40) + (usageCount * 2);
      } else if (tab === 'recent') {
        score += -trackAgeHours; // newer tracks have higher score
      } else {
        score += trendingScore * 10 + (usageCount * 2);
      }

      return { track, score, trendingScore: Math.round(trendingScore * 10) / 10 };
    });

    // Filter out non-matching query items
    const filteredScored = cleanQuery ? scoredTracks.filter(st => st.score >= 0) : scoredTracks;

    // Sort by descending score
    filteredScored.sort((a, b) => b.score - a.score);

    const total = filteredScored.length;
    const startIndex = (page - 1) * limit;
    const pagedTracks = filteredScored.slice(startIndex, startIndex + limit).map(st => {
      const t = st.track;
      return {
        ...t,
        trendingScore: st.trendingScore,
        isSaved: savedIds.has(t.id)
      };
    });

    return { tracks: pagedTracks, total };
  }

  /**
   * Get available genres and counts of tracks
   */
  public static getGenres(): Array<{ name: string; count: number }> {
    const data = db.getData();
    const genreMap: Record<string, number> = {};

    data.musicTracks.forEach(t => {
      if (!t.status || t.status === 'APPROVED' || t.status === 'ACTIVE') {
        const g = t.genre || 'General';
        genreMap[g] = (genreMap[g] || 0) + 1;
      }
    });

    const list = Object.keys(genreMap).map(name => ({
      name,
      count: genreMap[name]
    }));

    list.sort((a, b) => b.count - a.count);
    return [{ name: 'All', count: data.musicTracks.length }, ...list];
  }

  /**
   * Get recently used tracks by a user across posts, reels, and stories
   */
  public static getRecentlyUsed(userId: string, limit = 10): MusicTrack[] {
    const data = db.getData();
    const userUsages = data.audioUsage
      .filter(u => u.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const seenIds = new Set<string>();
    const recentTracks: MusicTrack[] = [];

    const savedIds = new Set(data.audioSaves[userId] || []);

    for (const u of userUsages) {
      if (!seenIds.has(u.audioId)) {
        seenIds.add(u.audioId);
        const track = data.musicTracks.find(t => t.id === u.audioId);
        if (track && (!track.status || track.status === 'APPROVED' || track.status === 'ACTIVE')) {
          recentTracks.push({
            ...track,
            isSaved: savedIds.has(track.id)
          });
          if (recentTracks.length >= limit) break;
        }
      }
    }

    return recentTracks;
  }

  /**
   * Get track by ID with hydration and saved state
   */
  public static getTrackById(trackId: string, userId?: string): MusicTrack | null {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === trackId || t.audioId === trackId);
    if (!track) return null;

    const savedIds = userId && data.audioSaves[userId] ? data.audioSaves[userId] : [];
    return {
      ...track,
      isSaved: savedIds.includes(track.id)
    };
  }

  /**
   * Upload / Create a new audio track
   */
  public static createTrack(
    dataInput: {
      title: string;
      artist?: string;
      creatorName?: string;
      creatorUsername?: string;
      creatorAvatarUrl?: string;
      description?: string;
      audioUrl: string;
      coverUrl?: string;
      storagePath?: string;
      duration: number;
      mimeType?: string;
      fileSize?: number;
      genre?: string;
      isOriginal?: boolean;
      visibility?: 'PUBLIC' | 'PRIVATE';
    },
    ownerUid: string,
    ownerDisplayName: string,
    ownerUsername?: string,
    ownerAvatar?: string
  ): MusicTrack {
    const data = db.getData();

    const trackId = `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const newTrack: MusicTrack = {
      id: trackId,
      audioId: trackId,
      ownerUid,
      title: dataInput.title.trim(),
      artist: (dataInput.artist || ownerDisplayName || 'Creator').trim(),
      creatorName: ownerDisplayName || 'Creator',
      creatorUsername: ownerUsername || '',
      creatorAvatarUrl: ownerAvatar || '',
      description: dataInput.description?.trim() || '',
      audioUrl: dataInput.audioUrl,
      coverUrl: dataInput.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      storagePath: dataInput.storagePath || dataInput.audioUrl,
      duration: Math.max(1, Math.round(dataInput.duration || 30)),
      mimeType: dataInput.mimeType || 'audio/mpeg',
      fileSize: dataInput.fileSize || 0,
      genre: dataInput.genre || 'Original',
      isOriginal: dataInput.isOriginal !== false,
      visibility: dataInput.visibility || 'PUBLIC',
      status: 'APPROVED',
      usageCount: 0,
      playCount: 0,
      saveCount: 0,
      featured: false,
      isSaved: false,
      creatorId: ownerUid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    data.musicTracks.unshift(newTrack);
    db.saveData();

    console.log(`[MusicService] 🎵 Registered new track "${newTrack.title}" by @${newTrack.creatorUsername} (${newTrack.id})`);
    return newTrack;
  }

  /**
   * Update track metadata
   */
  public static updateTrack(
    trackId: string,
    updates: {
      title?: string;
      artist?: string;
      description?: string;
      coverUrl?: string;
      genre?: string;
      visibility?: 'PUBLIC' | 'PRIVATE';
    },
    requesterUid: string,
    isAdmin = false
  ): MusicTrack {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === trackId || t.audioId === trackId);
    if (!track) {
      throw new Error('Track not found');
    }

    if (track.ownerUid !== requesterUid && !isAdmin) {
      throw new Error('Unauthorized to modify this audio track');
    }

    if (updates.title) track.title = updates.title.trim();
    if (updates.artist) track.artist = updates.artist.trim();
    if (typeof updates.description === 'string') track.description = updates.description.trim();
    if (updates.coverUrl) track.coverUrl = updates.coverUrl;
    if (updates.genre) track.genre = updates.genre;
    if (updates.visibility) track.visibility = updates.visibility;
    track.updatedAt = new Date().toISOString();

    db.saveData();
    return track;
  }

  /**
   * Safe audio deletion:
   * Checks if audio is referenced by any published post or reel.
   * If referenced, soft-deletes (sets status = 'REMOVED' and visibility = 'PRIVATE') to protect published content.
   * If unreferenced, hard-deletes.
   */
  public static deleteTrack(
    trackId: string,
    requesterUid: string,
    isAdmin = false
  ): { success: boolean; softDeleted: boolean; message: string } {
    const data = db.getData();
    const trackIndex = data.musicTracks.findIndex(t => t.id === trackId || t.audioId === trackId);
    if (trackIndex === -1) {
      throw new Error('Track not found');
    }

    const track = data.musicTracks[trackIndex];
    if (track.ownerUid !== requesterUid && !isAdmin) {
      throw new Error('Unauthorized to delete this audio track');
    }

    // Check usage in posts or reels
    const hasPostUsage = data.posts.some(p => p.audioId === trackId || p.audio?.id === trackId);
    const hasReelUsage = data.reels.some(r => r.audioId === trackId || r.audio?.id === trackId);
    const hasRecordedUsage = data.audioUsage.some(u => u.audioId === trackId);

    if (hasPostUsage || hasReelUsage || hasRecordedUsage) {
      // Soft-delete to preserve existing media streams
      track.status = 'REMOVED';
      track.visibility = 'PRIVATE';
      track.updatedAt = new Date().toISOString();
      db.saveData();
      return {
        success: true,
        softDeleted: true,
        message: 'Track has been removed from discovery. Existing posts using this track will continue playing safely.'
      };
    }

    // Hard-delete if never used
    data.musicTracks.splice(trackIndex, 1);
    db.saveData();
    return {
      success: true,
      softDeleted: false,
      message: 'Track permanently deleted.'
    };
  }

  /**
   * Toggle Save / Bookmark audio
   */
  public static toggleSaveTrack(audioId: string, userId: string): { isSaved: boolean; saveCount: number } {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === audioId || t.audioId === audioId);
    if (!track) throw new Error('Audio track not found');

    data.audioSaves[userId] = data.audioSaves[userId] || [];
    const idx = data.audioSaves[userId].indexOf(track.id);

    let isSaved = false;
    if (idx >= 0) {
      data.audioSaves[userId].splice(idx, 1);
      track.saveCount = Math.max(0, (track.saveCount || 1) - 1);
      isSaved = false;
    } else {
      data.audioSaves[userId].unshift(track.id);
      track.saveCount = (track.saveCount || 0) + 1;
      isSaved = true;
    }

    track.updatedAt = new Date().toISOString();
    db.saveData();
    return { isSaved, saveCount: track.saveCount };
  }

  /**
   * Record audio play / preview
   */
  public static recordPlay(audioId: string, userId?: string): { playCount: number } {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === audioId || t.audioId === audioId);
    if (!track) return { playCount: 0 };

    data.audioPlays.push({
      id: `play-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      audioId: track.id,
      userId,
      createdAt: new Date().toISOString()
    });

    // Keep plays array from ballooning indefinitely (keep last 50,000 plays)
    if (data.audioPlays.length > 50000) {
      data.audioPlays = data.audioPlays.slice(-40000);
    }

    track.playCount = (track.playCount || 0) + 1;
    db.saveData();
    return { playCount: track.playCount };
  }

  /**
   * Record usage of an audio track when a post, reel, or story is published
   */
  public static recordUsage(
    audioId: string,
    contentId: string,
    contentType: 'post' | 'reel' | 'story',
    userId: string
  ): void {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === audioId || t.audioId === audioId);
    if (!track) return;

    data.audioUsage.push({
      id: `usage-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      audioId: track.id,
      contentId,
      contentType,
      userId,
      createdAt: new Date().toISOString()
    });

    track.usageCount = (track.usageCount || 0) + 1;
    track.updatedAt = new Date().toISOString();
    db.saveData();
  }

  /**
   * Report an audio track for copyright, inappropriate content, etc.
   */
  public static reportTrack(
    audioId: string,
    reporterId: string,
    reporterUsername: string,
    reason: string,
    description?: string
  ): { reportId: string; status: string } {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === audioId || t.audioId === audioId);
    if (!track) throw new Error('Track not found');

    const reportId = `areport-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    data.audioReports.push({
      id: reportId,
      audioId: track.id,
      reporterId,
      reporterUsername,
      reason,
      description: description?.trim(),
      status: 'PENDING',
      createdAt: new Date().toISOString()
    });

    // Check how many reports this track has
    const pendingReports = data.audioReports.filter(r => r.audioId === track.id && r.status === 'PENDING');
    if (pendingReports.length >= 3 && track.status !== 'FLAGGED') {
      track.status = 'FLAGGED';
      track.updatedAt = new Date().toISOString();
      console.warn(`[MusicService] 🚩 Track "${track.title}" (${track.id}) auto-flagged due to ${pendingReports.length} pending reports.`);
    }

    db.saveData();
    return { reportId, status: track.status || 'PENDING' };
  }

  /**
   * Get published content (Posts and Reels) using this track
   */
  public static getAudioContent(audioId: string): { posts: Post[]; reels: Reel[] } {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === audioId || t.audioId === audioId);
    const targetId = track ? track.id : audioId;

    const posts = data.posts.filter(p => 
      (p.audioId === targetId || p.audio?.id === targetId) &&
      p.visibility !== 'PRIVATE' &&
      p.status !== 'archived'
    );

    const reels = data.reels.filter(r => 
      (r.audioId === targetId || r.audio?.id === targetId) &&
      r.visibility !== 'PRIVATE' &&
      r.status !== 'archived'
    );

    return { posts, reels };
  }

  // ================= ADMIN CONSOLE METHODS =================

  public static getAllTracksAdmin(query?: string, status?: string): MusicTrack[] {
    const data = db.getData();
    let result = [...data.musicTracks];

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.artist.toLowerCase().includes(q) ||
        (t.creatorName && t.creatorName.toLowerCase().includes(q))
      );
    }

    if (status && status !== 'ALL') {
      result = result.filter(t => t.status === status);
    }

    return result;
  }

  public static updateTrackStatusAdmin(
    audioId: string,
    status: 'APPROVED' | 'ACTIVE' | 'FLAGGED' | 'REMOVED',
    adminUid: string
  ): MusicTrack {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === audioId || t.audioId === audioId);
    if (!track) throw new Error('Track not found');

    track.status = status;
    track.updatedAt = new Date().toISOString();
    db.saveData();
    console.log(`[MusicService] Admin ${adminUid} updated track "${track.title}" status to ${status}`);
    return track;
  }

  public static toggleFeaturedAdmin(audioId: string, featured: boolean, adminUid: string): MusicTrack {
    const data = db.getData();
    const track = data.musicTracks.find(t => t.id === audioId || t.audioId === audioId);
    if (!track) throw new Error('Track not found');

    track.featured = featured;
    track.updatedAt = new Date().toISOString();
    db.saveData();
    console.log(`[MusicService] Admin ${adminUid} set featured=${featured} on track "${track.title}"`);
    return track;
  }

  public static getAudioReportsAdmin() {
    const data = db.getData();
    return data.audioReports.map(r => {
      const track = data.musicTracks.find(t => t.id === r.audioId);
      return {
        ...r,
        track
      };
    });
  }

  public static resolveAudioReportAdmin(
    reportId: string,
    action: 'DISMISSED' | 'REMOVED' | 'RESTRICTED',
    adminUid: string
  ): void {
    const data = db.getData();
    const report = data.audioReports.find(r => r.id === reportId);
    if (!report) throw new Error('Report not found');

    report.status = action === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED';
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = adminUid;

    if (action === 'REMOVED') {
      const track = data.musicTracks.find(t => t.id === report.audioId);
      if (track) {
        track.status = 'REMOVED';
        track.visibility = 'PRIVATE';
      }
    } else if (action === 'RESTRICTED') {
      const track = data.musicTracks.find(t => t.id === report.audioId);
      if (track) {
        track.status = 'FLAGGED';
        track.visibility = 'PRIVATE';
      }
    }

    db.saveData();
  }
}

