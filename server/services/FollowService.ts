import { db } from '../db';
import { FollowButtonState, User } from '../../src/types/index';
import { NotificationService } from './NotificationService';
import { OWNER_ADMIN_UID } from '../utils/security';

export class FollowService {
  public static getRelationshipState(currentUserId: string, targetUserId: string): {
    state: FollowButtonState;
    isFollowing: boolean;
    isRequested: boolean;
  } {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
      return { state: 'Follow', isFollowing: false, isRequested: false };
    }

    const data = db.getData();
    const relation = data.follows.find(
      f => f.followerId === currentUserId && f.followingId === targetUserId
    );

    if (!relation) {
      return { state: 'Follow', isFollowing: false, isRequested: false };
    }

    if (relation.status === 'ACCEPTED') {
      return { state: 'Following', isFollowing: true, isRequested: false };
    }

    return { state: 'Requested', isFollowing: false, isRequested: true };
  }

  public static getFollowers(userId: string, viewerId?: string): User[] {
    const data = db.getData();
    const followerIds = data.follows
      .filter(f => f.followingId === userId && f.status === 'ACCEPTED')
      .map(f => f.followerId);

    return data.users.filter(u => {
      if (!followerIds.includes(u.id)) return false;
      if (u.role === 'OWNER_ADMIN' || u.id === OWNER_ADMIN_UID) {
        return viewerId === OWNER_ADMIN_UID;
      }
      return true;
    });
  }

  public static getFollowing(userId: string, viewerId?: string): User[] {
    const data = db.getData();
    const followingIds = data.follows
      .filter(f => f.followerId === userId && f.status === 'ACCEPTED')
      .map(f => f.followingId);

    return data.users.filter(u => {
      if (!followingIds.includes(u.id)) return false;
      if (u.role === 'OWNER_ADMIN' || u.id === OWNER_ADMIN_UID) {
        return viewerId === OWNER_ADMIN_UID;
      }
      return true;
    });
  }

  public static getPendingRequests(userId: string): User[] {
    const data = db.getData();
    const requesterIds = data.follows
      .filter(f => f.followingId === userId && f.status === 'PENDING')
      .map(f => f.followerId);

    return data.users.filter(u => requesterIds.includes(u.id));
  }

  public static recalculateCounts(userId: string): { followersCount: number; followingCount: number } {
    const data = db.getData();
    const followersCount = data.follows.filter(
      f => f.followingId === userId && f.status === 'ACCEPTED'
    ).length;

    const followingCount = data.follows.filter(
      f => f.followerId === userId && f.status === 'ACCEPTED'
    ).length;

    const user = data.users.find(u => u.id === userId);
    if (user) {
      user.followersCount = followersCount;
      user.followingCount = followingCount;
    }

    db.saveData();
    return { followersCount, followingCount };
  }

  public static toggleFollow(
    currentUserId: string,
    targetUserId: string
  ): { status: FollowButtonState; followersCount: number; followingCount: number } {
    if (currentUserId === targetUserId) {
      throw new Error('You cannot follow yourself.');
    }

    const data = db.getData();
    const targetUser = data.users.find(u => u.id === targetUserId);
    const currentUser = data.users.find(u => u.id === currentUserId);

    if (!targetUser || !currentUser) {
      throw new Error('User not found.');
    }

    // Normal users cannot follow the private OWNER_ADMIN
    if ((targetUser.role === 'OWNER_ADMIN' || targetUserId === OWNER_ADMIN_UID) && currentUserId !== OWNER_ADMIN_UID) {
      throw new Error('User not found.');
    }

    const existingIndex = data.follows.findIndex(
      f => f.followerId === currentUserId && f.followingId === targetUserId
    );

    let nextState: FollowButtonState = 'Follow';

    if (existingIndex > -1) {
      // Unfollow or Cancel Request
      data.follows.splice(existingIndex, 1);
      nextState = 'Follow';
    } else {
      const isTargetPrivate = Boolean(targetUser.isPrivate);
      const newStatus = isTargetPrivate ? 'PENDING' : 'ACCEPTED';

      data.follows.push({
        id: `f-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        followerId: currentUserId,
        followingId: targetUserId,
        status: newStatus,
        createdAt: new Date().toISOString()
      });
      nextState = isTargetPrivate ? 'Requested' : 'Following';

      // Send Follow or Follow Request Notification
      NotificationService.createNotification({
        userId: targetUserId,
        actorId: currentUserId,
        type: isTargetPrivate ? 'FOLLOW_REQUEST' : 'FOLLOW',
        previewText: isTargetPrivate ? 'requested to follow you.' : 'started following you.'
      });
    }

    db.saveData();

    this.recalculateCounts(targetUserId);
    this.recalculateCounts(currentUserId);

    const updatedTarget = data.users.find(u => u.id === targetUserId);

    return {
      status: nextState,
      followersCount: updatedTarget?.followersCount ?? 0,
      followingCount: updatedTarget?.followingCount ?? 0
    };
  }

  public static acceptRequest(
    currentUserId: string,
    requesterId: string
  ): { success: boolean; followersCount: number; followingCount: number; requesterFollowingCount: number } {
    const data = db.getData();
    const rel = data.follows.find(
      f => f.followerId === requesterId && f.followingId === currentUserId && f.status === 'PENDING'
    );

    if (!rel) {
      throw new Error('No pending follow request found.');
    }

    rel.status = 'ACCEPTED';
    db.saveData();

    const currentCounts = this.recalculateCounts(currentUserId);
    const requesterCounts = this.recalculateCounts(requesterId);

    // Remove old follow request notification
    data.notifications = data.notifications.filter(
      n => !(n.userId === currentUserId && n.actorId === requesterId && n.type === 'FOLLOW_REQUEST')
    );

    // Notify requester that their request was accepted
    NotificationService.createNotification({
      userId: requesterId,
      actorId: currentUserId,
      type: 'REQUEST_ACCEPTED',
      previewText: 'accepted your follow request.'
    });

    db.saveData();

    return {
      success: true,
      followersCount: currentCounts.followersCount,
      followingCount: currentCounts.followingCount,
      requesterFollowingCount: requesterCounts.followingCount
    };
  }

  public static declineRequest(
    currentUserId: string,
    requesterId: string
  ): { success: boolean; followersCount: number; followingCount: number } {
    const data = db.getData();
    data.follows = data.follows.filter(
      f => !(f.followerId === requesterId && f.followingId === currentUserId && f.status === 'PENDING')
    );

    // Remove old follow request notification
    data.notifications = data.notifications.filter(
      n => !(n.userId === currentUserId && n.actorId === requesterId && n.type === 'FOLLOW_REQUEST')
    );

    db.saveData();

    const counts = this.recalculateCounts(currentUserId);
    return {
      success: true,
      followersCount: counts.followersCount,
      followingCount: counts.followingCount
    };
  }
}
