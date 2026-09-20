import { db } from '../db';
import { Notification, NotificationType, UserPreview } from '../../src/types/index';

export class NotificationService {
  public static getNotifications(userId: string): Notification[] {
    const data = db.getData();
    return data.notifications
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static createNotification(params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetId?: string;
    previewText?: string;
  }): Notification | null {
    if (params.userId === params.actorId) {
      return null; // Don't notify self
    }

    const data = db.getData();
    const actorUser = data.users.find(u => u.id === params.actorId);
    if (!actorUser) return null;

    const actorPreview: UserPreview = {
      id: actorUser.id,
      username: actorUser.username,
      displayName: actorUser.displayName,
      avatarUrl: actorUser.avatarUrl,
      role: actorUser.role,
      verified: actorUser.verified
    };

    const newNotification: Notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: params.userId,
      actorId: params.actorId,
      actor: actorPreview,
      type: params.type,
      targetId: params.targetId,
      previewText: params.previewText || 'interacted with your profile.',
      isRead: false,
      createdAt: new Date().toISOString()
    };

    data.notifications.unshift(newNotification);
    db.saveData();
    return newNotification;
  }

  public static markAsRead(userId: string, notificationId?: string): void {
    const data = db.getData();
    if (notificationId) {
      const notif = data.notifications.find(n => n.id === notificationId && n.userId === userId);
      if (notif) notif.isRead = true;
    } else {
      data.notifications.forEach(n => {
        if (n.userId === userId) n.isRead = true;
      });
    }
    db.saveData();
  }

  public static deleteNotification(userId: string, notificationId: string): void {
    const data = db.getData();
    data.notifications = data.notifications.filter(n => !(n.id === notificationId && n.userId === userId));
    db.saveData();
  }

  public static deleteAllNotifications(userId: string): void {
    const data = db.getData();
    data.notifications = data.notifications.filter(n => n.userId !== userId);
    db.saveData();
  }
}
