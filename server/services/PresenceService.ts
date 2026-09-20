export class PresenceService {
  private static onlineUsers: Map<string, number> = new Map(); // userId -> lastSeenTimestamp

  public static heartbeat(userId: string): void {
    this.onlineUsers.set(userId, Date.now());
  }

  public static isOnline(userId: string): boolean {
    const lastSeen = this.onlineUsers.get(userId);
    if (!lastSeen) return false;
    // Consider online if heartbeat was within last 30 seconds
    return Date.now() - lastSeen < 30000;
  }

  public static getOnlineUserIds(): string[] {
    const now = Date.now();
    const result: string[] = [];
    this.onlineUsers.forEach((lastSeen, userId) => {
      if (now - lastSeen < 30000) {
        result.push(userId);
      }
    });
    return result;
  }
}
