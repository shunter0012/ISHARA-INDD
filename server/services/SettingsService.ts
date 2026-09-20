import { db } from '../db';
import { UserSettings, UserPreview, User } from '../../src/types/index';
import { 
  hashPassword, 
  verifyPassword, 
  normalizeUsername 
} from '../utils/security';

export class SettingsService {
  /**
   * Initializes and retrieves settings for the authenticated user
   */
  public static getUserSettings(userId: string): UserSettings {
    const data = db.getData();
    const user = data.users.find(u => u.id === userId);
    if (!user) {
      throw new Error('User not found.');
    }

    if (!data.userSettings[userId]) {
      const defaultSettings: UserSettings = {
        userId,
        isPrivateAccount: Boolean(user.isPrivate),
        activityStatus: true,
        readReceipts: true,
        messageRequests: 'everyone',
        callingPermissions: 'everyone',
        followRequestsAutoApprove: false,
        notifications: {
          pauseAll: false,
          likes: true,
          comments: true,
          newFollowers: true,
          directMessages: true,
          mentions: true,
          calls: true
        },
        contentFilter: 'standard',
        preferredLanguage: 'English',
        autoplayVideos: true,
        blockedUserIds: data.blockedUsers[userId] || [],
        twoFactorEnabled: false,
        phoneVerified: Boolean(user.phone),
        verifiedPhone: user.phone || undefined,
        sessionRevokedBefore: 0,
        updatedAt: new Date().toISOString()
      };
      data.userSettings[userId] = defaultSettings;
      db.saveData();
    }

    // Ensure backwards-compatible fields
    const settings = data.userSettings[userId];
    if (!settings.notifications) {
      settings.notifications = {
        pauseAll: false,
        likes: true,
        comments: true,
        newFollowers: true,
        directMessages: true,
        mentions: true,
        calls: true
      };
    }
    if (!Array.isArray(settings.blockedUserIds)) {
      settings.blockedUserIds = data.blockedUsers[userId] || [];
    }
    if (user.phone && !settings.verifiedPhone) {
      settings.verifiedPhone = user.phone;
      settings.phoneVerified = true;
    }

    return settings;
  }

  /**
   * Updates settings for the authenticated user
   */
  public static updateUserSettings(userId: string, updates: Partial<UserSettings>): UserSettings {
    const data = db.getData();
    const current = this.getUserSettings(userId);
    const user = data.users.find(u => u.id === userId);
    if (!user) {
      throw new Error('User not found.');
    }

    // Deep merge notification preferences if provided
    const updatedNotifications = updates.notifications 
      ? { ...current.notifications, ...updates.notifications }
      : current.notifications;

    const newSettings: UserSettings = {
      ...current,
      ...updates,
      userId, // Security: UID can never be overridden
      notifications: updatedNotifications,
      updatedAt: new Date().toISOString()
    };

    // If privacy toggled, sync User object
    if (typeof updates.isPrivateAccount === 'boolean') {
      user.isPrivate = updates.isPrivateAccount;
      newSettings.isPrivateAccount = updates.isPrivateAccount;
    }

    // If blocked list updated, sync blockedUsers map
    if (Array.isArray(updates.blockedUserIds)) {
      data.blockedUsers[userId] = updates.blockedUserIds;
    }

    data.userSettings[userId] = newSettings;
    db.saveData();
    return newSettings;
  }

  /**
   * Securely changes password after verifying current password with PBKDF2
   */
  public static changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): { success: boolean; message: string } {
    const data = db.getData();
    if (!data.passwords || !data.passwords[userId]) {
      throw new Error('No password record found for this account.');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    const verification = verifyPassword(currentPassword, data.passwords[userId]);
    if (!verification.isValid) {
      throw new Error('Current password does not match.');
    }

    // Store salted PBKDF2 hash
    data.passwords[userId] = hashPassword(newPassword);

    // Update settings metadata
    const settings = this.getUserSettings(userId);
    settings.lastPasswordChange = new Date().toISOString();
    data.userSettings[userId] = settings;

    db.saveData();
    return { success: true, message: 'Password updated successfully.' };
  }

  /**
   * Revokes all active session tokens for the authenticated user
   */
  public static logoutAllSessions(userId: string): { success: boolean; revokedTimestamp: number } {
    const data = db.getData();
    const settings = this.getUserSettings(userId);
    const now = Date.now();

    settings.sessionRevokedBefore = now;
    settings.updatedAt = new Date().toISOString();
    data.userSettings[userId] = settings;

    db.saveData();
    return { success: true, revokedTimestamp: now };
  }

  /**
   * Gets list of users blocked by this user
   */
  public static getBlockedUsers(userId: string): UserPreview[] {
    const data = db.getData();
    const blockedIds = data.blockedUsers[userId] || data.userSettings[userId]?.blockedUserIds || [];
    
    return data.users
      .filter(u => blockedIds.includes(u.id))
      .map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName || u.username,
        avatarUrl: u.avatarUrl,
        role: u.role,
        verified: u.verified
      }));
  }

  /**
   * Blocks a user by username or userId
   */
  public static blockUser(userId: string, targetIdentifier: string): { success: boolean; blockedUser: UserPreview } {
    const data = db.getData();
    const clean = normalizeUsername(targetIdentifier);
    const target = data.users.find(u => 
      u.id === targetIdentifier || 
      normalizeUsername(u.username) === clean
    );

    if (!target) {
      throw new Error(`User "${targetIdentifier}" not found.`);
    }

    if (target.id === userId) {
      throw new Error('You cannot block your own account.');
    }

    if (target.role === 'OWNER_ADMIN' || target.id === 'user-shuv') {
      throw new Error('Administrative accounts cannot be blocked.');
    }

    if (!data.blockedUsers[userId]) {
      data.blockedUsers[userId] = [];
    }

    if (!data.blockedUsers[userId].includes(target.id)) {
      data.blockedUsers[userId].push(target.id);
    }

    // Sync in userSettings
    const settings = this.getUserSettings(userId);
    settings.blockedUserIds = data.blockedUsers[userId];
    data.userSettings[userId] = settings;

    // Mutually remove any existing follow relationships
    data.follows = data.follows.filter(f => 
      !(f.followerId === userId && f.followingId === target.id) &&
      !(f.followerId === target.id && f.followingId === userId)
    );

    // Update user follow counts
    const currentUser = data.users.find(u => u.id === userId);
    if (currentUser) {
      currentUser.followingCount = data.follows.filter(f => f.followerId === userId && f.status === 'ACCEPTED').length;
      currentUser.followersCount = data.follows.filter(f => f.followingId === userId && f.status === 'ACCEPTED').length;
    }
    target.followingCount = data.follows.filter(f => f.followerId === target.id && f.status === 'ACCEPTED').length;
    target.followersCount = data.follows.filter(f => f.followingId === target.id && f.status === 'ACCEPTED').length;

    db.saveData();

    return {
      success: true,
      blockedUser: {
        id: target.id,
        username: target.username,
        displayName: target.displayName || target.username,
        avatarUrl: target.avatarUrl,
        role: target.role,
        verified: target.verified
      }
    };
  }

  /**
   * Unblocks a user
   */
  public static unblockUser(userId: string, targetUserId: string): { success: boolean } {
    const data = db.getData();
    if (data.blockedUsers[userId]) {
      data.blockedUsers[userId] = data.blockedUsers[userId].filter(id => id !== targetUserId);
    }

    const settings = this.getUserSettings(userId);
    settings.blockedUserIds = data.blockedUsers[userId] || [];
    data.userSettings[userId] = settings;

    db.saveData();
    return { success: true };
  }

  /**
   * Checks if userA has blocked userB or vice versa
   */
  public static isBlocked(userAId: string, userBId: string): boolean {
    const data = db.getData();
    const aBlocked = (data.blockedUsers[userAId] || []).includes(userBId);
    const bBlocked = (data.blockedUsers[userBId] || []).includes(userAId);
    return aBlocked || bBlocked;
  }
}
