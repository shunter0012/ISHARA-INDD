import { db } from '../db';
import { User, UserRole, ReportItem, AdItem, BanRecord, BanHistoryEntry } from '../../src/types/index';
import { RealtimeService } from './RealtimeService';
import { NotificationService } from './NotificationService';
import { OWNER_ADMIN_UID } from '../utils/security';

export class AdminService {
  public static getStats() {
    const data = db.getData();
    const pendingReports = data.reports.filter(r => r.status === 'pending').length;
    const bannedUsers = data.users.filter(u => u.isBanned).length;

    return {
      totalUsers: data.users.length,
      bannedUsers,
      totalPosts: data.posts.length,
      totalReels: data.reels.length,
      totalTracks: data.musicTracks.length,
      totalReports: data.reports.length,
      pendingReports,
      activeAds: (data.ads || []).filter(a => a.isActive).length
    };
  }

  public static updateUserRole(userId: string, newRole: UserRole): User {
    const data = db.getData();
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found.');

    user.role = newRole;
    if (newRole === 'VERIFIED' || newRole === 'OWNER_ADMIN' || newRole === 'ADMIN') {
      user.verified = true;
    }
    db.saveData();
    return user;
  }

  public static toggleVerified(userId: string, verified?: boolean): User {
    const data = db.getData();
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found.');

    user.verified = verified !== undefined ? verified : !user.verified;
    db.saveData();
    return user;
  }

  public static banUser(
    adminUser: User,
    targetUserId: string,
    options: {
      banType: 'temporary' | 'permanent';
      durationHours?: number;
      reason: string;
    }
  ): { user: User; historyEntry: BanHistoryEntry } {
    const data = db.getData();
    const targetUser = data.users.find(u => u.id === targetUserId);
    if (!targetUser) throw new Error('Target user not found.');

    if (targetUser.role === 'OWNER_ADMIN' || targetUser.id === 'user-shuv') {
      throw new Error('Cannot ban the system OWNER_ADMIN account.');
    }

    if (!options.reason || !options.reason.trim()) {
      throw new Error('A valid ban reason must be provided.');
    }

    const now = new Date();
    let expiresAt: string | undefined = undefined;

    if (options.banType === 'temporary') {
      const hours = Number(options.durationHours) || 24;
      const expDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
      expiresAt = expDate.toISOString();
    }

    const banRecord: BanRecord = {
      isBanned: true,
      banType: options.banType,
      reason: options.reason.trim(),
      bannedAt: now.toISOString(),
      expiresAt,
      bannedBy: adminUser.id,
      bannedByUsername: adminUser.username
    };

    targetUser.isBanned = true;
    targetUser.banInfo = banRecord;

    const historyEntry: BanHistoryEntry = {
      id: `ban-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: targetUser.id,
      targetUsername: targetUser.username,
      action: 'BAN',
      banType: options.banType,
      reason: options.reason.trim(),
      timestamp: now.toISOString(),
      durationHours: options.durationHours,
      expiresAt,
      performedBy: adminUser.id,
      performedByUsername: adminUser.username
    };

    data.banHistory = data.banHistory || [];
    data.banHistory.unshift(historyEntry);

    db.saveData();

    // Broadcast real-time ban event so client sessions for targetUser are terminated immediately
    RealtimeService.broadcast({
      type: 'USER_BANNED',
      userId: targetUser.id,
      banInfo: banRecord
    });

    return { user: targetUser, historyEntry };
  }

  public static unbanUser(
    adminUser: User,
    targetUserId: string,
    reason: string = 'Ban revoked by admin'
  ): { user: User; historyEntry: BanHistoryEntry } {
    const data = db.getData();
    const targetUser = data.users.find(u => u.id === targetUserId);
    if (!targetUser) throw new Error('Target user not found.');

    targetUser.isBanned = false;
    targetUser.banInfo = {
      isBanned: false
    };

    const historyEntry: BanHistoryEntry = {
      id: `unban-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: targetUser.id,
      targetUsername: targetUser.username,
      action: 'UNBAN',
      reason: reason.trim(),
      timestamp: new Date().toISOString(),
      performedBy: adminUser.id,
      performedByUsername: adminUser.username
    };

    data.banHistory = data.banHistory || [];
    data.banHistory.unshift(historyEntry);

    db.saveData();

    RealtimeService.broadcast({
      type: 'USER_UNBANNED',
      userId: targetUser.id
    });

    return { user: targetUser, historyEntry };
  }

  public static getBanHistory(userId?: string): BanHistoryEntry[] {
    const data = db.getData();
    data.banHistory = data.banHistory || [];
    if (userId) {
      return data.banHistory.filter(h => h.userId === userId);
    }
    return data.banHistory;
  }
}

export class ModerationService {
  public static reportContent(params: {
    reporterId: string;
    targetType: 'post' | 'reel' | 'user' | 'comment';
    targetId: string;
    reason: string;
    details?: string;
  }): ReportItem {
    const data = db.getData();
    const reporter = data.users.find(u => u.id === params.reporterId);
    if (!reporter) throw new Error('Reporter not found.');

    let targetPreview: any = undefined;
    let targetAuthorId: string | undefined = undefined;

    if (params.targetType === 'post') {
      const post = data.posts.find(p => p.id === params.targetId);
      if (post) {
        targetAuthorId = post.userId;
        targetPreview = {
          authorId: post.userId,
          username: post.author?.username,
          caption: post.caption,
          mediaUrl: post.mediaUrl,
          mediaType: post.mediaType,
          thumbnailUrl: post.thumbnailUrl
        };
      }
    } else if (params.targetType === 'reel') {
      const reel = data.reels.find(r => r.id === params.targetId);
      if (reel) {
        targetAuthorId = reel.userId;
        targetPreview = {
          authorId: reel.userId,
          username: reel.author?.username,
          caption: reel.caption,
          mediaUrl: reel.thumbnailUrl || reel.videoUrl,
          mediaType: 'video',
          thumbnailUrl: reel.thumbnailUrl
        };
      }
    } else if (params.targetType === 'user') {
      const u = data.users.find(usr => usr.id === params.targetId || usr.username === params.targetId);
      if (u) {
        targetAuthorId = u.id;
        targetPreview = {
          authorId: u.id,
          username: u.username,
          caption: u.bio,
          mediaUrl: u.avatarUrl,
          mediaType: 'avatar'
        };
      }
    }

    const newReport: ReportItem = {
      id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      reporterId: params.reporterId,
      reporter: {
        id: reporter.id,
        username: reporter.username,
        displayName: reporter.displayName,
        avatarUrl: reporter.avatarUrl
      },
      targetType: params.targetType,
      targetId: params.targetId,
      targetAuthorId,
      targetPreview,
      reason: params.reason,
      details: params.details,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    data.reports = data.reports || [];
    data.reports.unshift(newReport);
    db.saveData();

    // Notify all admin accounts so reports show up in Admin Notifications & Alerts
    const adminUsers = data.users.filter(u => 
      u.role === 'OWNER_ADMIN' || 
      u.role === 'ADMIN' || 
      u.id === OWNER_ADMIN_UID || 
      u.username?.toLowerCase() === 'shuv'
    );

    adminUsers.forEach(admin => {
      NotificationService.createNotification({
        userId: admin.id,
        actorId: reporter.id,
        type: 'REPORT',
        targetId: newReport.id,
        previewText: `flagged ${params.targetType} by @${targetPreview?.username || 'user'}: "${params.reason}"`
      });
    });

    // Broadcast report event in real time to admin
    RealtimeService.broadcast({
      type: 'NEW_REPORT',
      report: newReport
    });

    return newReport;
  }

  public static getReports(): ReportItem[] {
    const data = db.getData();
    data.reports = data.reports || [];
    return data.reports;
  }

  public static updateReportStatus(
    reportId: string,
    status: 'resolved' | 'dismissed',
    actionTaken?: string,
    adminId?: string
  ): ReportItem {
    const data = db.getData();
    data.reports = data.reports || [];
    const report = data.reports.find(r => r.id === reportId);
    if (!report) throw new Error('Report not found.');

    report.status = status;
    report.actionTaken = actionTaken;
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = adminId;

    db.saveData();

    RealtimeService.broadcast({
      type: 'REPORT_UPDATED',
      report
    });

    return report;
  }

  public static warnUser(
    adminUser: User, 
    reportId: string, 
    warningMessage?: string
  ): ReportItem {
    const data = db.getData();
    data.reports = data.reports || [];
    const report = data.reports.find(r => r.id === reportId);
    if (!report) throw new Error('Report not found.');

    // Find target author
    let targetAuthorId = report.targetAuthorId || report.targetPreview?.authorId;
    if (!targetAuthorId) {
      if (report.targetType === 'post') {
        const p = data.posts.find(post => post.id === report.targetId);
        if (p) targetAuthorId = p.userId;
      } else if (report.targetType === 'reel') {
        const r = data.reels.find(reel => reel.id === report.targetId);
        if (r) targetAuthorId = r.userId;
      } else if (report.targetType === 'user') {
        targetAuthorId = report.targetId;
      }
    }

    if (!targetAuthorId) {
      throw new Error('Target content author could not be found.');
    }

    const author = data.users.find(u => u.id === targetAuthorId || u.username === targetAuthorId);
    if (!author) {
      throw new Error('Author user profile could not be found.');
    }

    const reasonText = warningMessage?.trim() || report.reason || 'Violation of community standards';

    // Record warning on author profile
    author.warningsCount = (author.warningsCount || 0) + 1;
    author.warnings = author.warnings || [];
    author.warnings.unshift({
      id: `warn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: author.id,
      reportId: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      message: reasonText,
      issuedAt: new Date().toISOString(),
      issuedBy: adminUser.id,
      issuedByUsername: adminUser.username || 'admin'
    });

    // Send official WARNING notification to author
    NotificationService.createNotification({
      userId: author.id,
      actorId: adminUser.id,
      type: 'WARNING',
      targetId: report.targetId,
      previewText: `Official Warning: ${reasonText}`
    });

    // Update report
    report.status = 'resolved';
    report.actionTaken = `Warned author (@${author.username}): ${reasonText}`;
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = adminUser.id;

    db.saveData();

    RealtimeService.broadcast({
      type: 'REPORT_UPDATED',
      report
    });

    RealtimeService.broadcast({
      type: 'USER_WARNED',
      userId: author.id,
      warningsCount: author.warningsCount
    });

    return report;
  }

  public static deleteContent(adminUser: User, targetType: 'post' | 'reel', targetId: string): boolean {
    const data = db.getData();

    if (targetType === 'post') {
      const idx = data.posts.findIndex(p => p.id === targetId);
      if (idx === -1) {
        // Even if already deleted, resolve pending reports
        data.reports.forEach(r => {
          if (r.targetType === 'post' && r.targetId === targetId && (r.status === 'pending' || (r.status as string) === 'PENDING')) {
            r.status = 'resolved';
            r.actionTaken = 'Post removed by admin';
            r.resolvedAt = new Date().toISOString();
            r.resolvedBy = adminUser.id;
          }
        });
        db.saveData();
        return true;
      }

      const post = data.posts[idx];
      const authorId = post.userId;
      data.posts.splice(idx, 1);

      // Clean up comments and likes
      data.comments = data.comments.filter(c => c.postId !== targetId);

      // Decrement author post count
      const author = data.users.find(u => u.id === post.userId);
      if (author) {
        author.postsCount = Math.max(0, (author.postsCount || 1) - 1);
      }

      // Notify author that their content was deleted
      if (authorId && authorId !== adminUser.id) {
        NotificationService.createNotification({
          userId: authorId,
          actorId: adminUser.id,
          type: 'WARNING',
          targetId,
          previewText: 'Your post was removed by admin for violating community guidelines.'
        });
      }

      // Mark related reports as resolved
      data.reports.forEach(r => {
        if (r.targetType === 'post' && r.targetId === targetId && (r.status === 'pending' || (r.status as string) === 'PENDING')) {
          r.status = 'resolved';
          r.actionTaken = 'Post removed by admin';
          r.resolvedAt = new Date().toISOString();
          r.resolvedBy = adminUser.id;
        }
      });

      db.saveData();

      RealtimeService.broadcast({
        type: 'POST_DELETED',
        postId: targetId
      });

      return true;
    } else if (targetType === 'reel') {
      const idx = data.reels.findIndex(r => r.id === targetId);
      if (idx === -1) {
        data.reports.forEach(r => {
          if (r.targetType === 'reel' && r.targetId === targetId && (r.status === 'pending' || (r.status as string) === 'PENDING')) {
            r.status = 'resolved';
            r.actionTaken = 'Reel removed by admin';
            r.resolvedAt = new Date().toISOString();
            r.resolvedBy = adminUser.id;
          }
        });
        db.saveData();
        return true;
      }

      const reel = data.reels[idx];
      const authorId = reel.userId;
      data.reels.splice(idx, 1);

      // Notify author
      if (authorId && authorId !== adminUser.id) {
        NotificationService.createNotification({
          userId: authorId,
          actorId: adminUser.id,
          type: 'WARNING',
          targetId,
          previewText: 'Your reel was removed by admin for violating community guidelines.'
        });
      }

      // Mark related reports as resolved
      data.reports.forEach(r => {
        if (r.targetType === 'reel' && r.targetId === targetId && (r.status === 'pending' || (r.status as string) === 'PENDING')) {
          r.status = 'resolved';
          r.actionTaken = 'Reel removed by admin';
          r.resolvedAt = new Date().toISOString();
          r.resolvedBy = adminUser.id;
        }
      });

      db.saveData();

      RealtimeService.broadcast({
        type: 'REEL_DELETED',
        reelId: targetId
      });

      return true;
    }

    throw new Error('Unsupported content type');
  }
}

export class AdService {
  public static getAds(placement?: 'feed' | 'reels' | 'stories' | string, includeInactive: boolean = false): AdItem[] {
    const data = db.getData();
    data.ads = data.ads || [];
    const normalizedPlacement = placement ? placement.toLowerCase().trim() : undefined;
    return data.ads.filter(a => {
      if (!includeInactive && !a.isActive) return false;
      if (!normalizedPlacement) return true;
      const p = (a.placement || 'reels').toLowerCase().trim();
      return p === normalizedPlacement || p === 'all' || !p || (normalizedPlacement === 'reels' && (p === 'feed' || p === 'stories'));
    });
  }

  public static createAd(input: {
    title: string;
    sponsorName: string;
    sponsorAvatarUrl?: string;
    sponsorAvatar?: string;
    mediaType?: 'image' | 'video';
    mediaUrl: string;
    targetUrl: string;
    ctaText?: string;
    placement?: 'feed' | 'reels' | 'stories';
    isActive?: boolean;
  }): AdItem {
    const data = db.getData();
    data.ads = data.ads || [];

    if (!input.title || !input.title.trim()) throw new Error('Ad title is required.');
    if (!input.sponsorName || !input.sponsorName.trim()) throw new Error('Sponsor name is required.');
    if (!input.mediaUrl || !input.mediaUrl.trim()) throw new Error('Media URL is required.');
    if (!input.targetUrl || !input.targetUrl.trim()) throw new Error('Target URL is required.');

    const placement = input.placement || 'reels';
    const mediaType = input.mediaType || (placement === 'reels' ? 'video' : 'image');
    const ctaText = input.ctaText && input.ctaText.trim() ? input.ctaText.trim() : 'Learn More';
    const sponsorAvatarUrl = input.sponsorAvatarUrl?.trim() || 
                             input.sponsorAvatar?.trim() || 
                             `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(input.sponsorName)}`;

    const newAd: AdItem = {
      id: `ad-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: input.title.trim(),
      sponsorName: input.sponsorName.trim(),
      sponsorAvatarUrl,
      mediaType,
      mediaUrl: input.mediaUrl.trim(),
      targetUrl: input.targetUrl.trim(),
      ctaText,
      placement,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : true,
      impressions: 0,
      clicks: 0,
      createdAt: new Date().toISOString()
    };

    data.ads.unshift(newAd);
    db.saveData();

    RealtimeService.broadcast({
      type: 'AD_CREATED',
      ad: newAd
    });

    return newAd;
  }

  public static toggleAdActive(adId: string): AdItem {
    const data = db.getData();
    data.ads = data.ads || [];
    const ad = data.ads.find(a => a.id === adId);
    if (!ad) throw new Error('Ad not found.');
    ad.isActive = !ad.isActive;
    db.saveData();

    RealtimeService.broadcast({
      type: 'AD_UPDATED',
      ad
    });

    return ad;
  }

  public static deleteAd(adId: string): boolean {
    const data = db.getData();
    data.ads = data.ads || [];
    const idx = data.ads.findIndex(a => a.id === adId);
    if (idx === -1) throw new Error('Ad not found.');
    data.ads.splice(idx, 1);
    db.saveData();

    RealtimeService.broadcast({
      type: 'AD_DELETED',
      adId
    });

    return true;
  }

  public static recordImpression(adId: string): void {
    const data = db.getData();
    data.ads = data.ads || [];
    const ad = data.ads.find(a => a.id === adId);
    if (ad) {
      ad.impressions = (ad.impressions || 0) + 1;
      db.saveData();
    }
  }

  public static recordClick(adId: string): void {
    const data = db.getData();
    data.ads = data.ads || [];
    const ad = data.ads.find(a => a.id === adId);
    if (ad) {
      ad.clicks = (ad.clicks || 0) + 1;
      db.saveData();
    }
  }
}
