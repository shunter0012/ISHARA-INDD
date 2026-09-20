export type UserRole = 'USER' | 'VERIFIED' | 'CREATOR' | 'ADMIN' | 'OWNER_ADMIN';

export type FollowButtonState = 'Follow' | 'Requested' | 'Following';

export interface BanRecord {
  isBanned: boolean;
  banType?: 'temporary' | 'permanent';
  reason?: string;
  bannedAt?: string;
  expiresAt?: string; // ISO string for temporary ban expiration
  bannedBy?: string; // Admin UID
  bannedByUsername?: string;
}

export interface BanHistoryEntry {
  id: string;
  userId: string;
  targetUsername: string;
  action: 'BAN' | 'UNBAN';
  banType?: 'temporary' | 'permanent';
  reason?: string;
  timestamp: string;
  durationHours?: number;
  expiresAt?: string;
  performedBy: string;
  performedByUsername: string;
}

export interface UserWarning {
  id: string;
  userId: string;
  reportId?: string;
  targetType?: 'post' | 'reel' | 'user' | 'comment';
  targetId?: string;
  reason: string;
  message: string;
  issuedAt: string;
  issuedBy: string;
  issuedByUsername: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  avatarBase64?: string;
  bio?: string;
  role: UserRole;
  verified?: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPrivate?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  createdAt?: string;
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string;
  banExpiresAt?: string;
  bannedBy?: string;
  banInfo?: BanRecord;
  warningsCount?: number;
  warnings?: UserWarning[];
}

export interface UserProfile extends User {
  isFollowing?: boolean;
  isRequested?: boolean;
  relationshipState?: FollowButtonState;
  website?: string;
  location?: string;
}

export interface UserPreview {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  avatarBase64?: string;
  role?: UserRole;
  verified?: boolean;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  isFollowing?: boolean;
  isRequested?: boolean;
  relationshipState?: FollowButtonState;
}

export interface MusicTrack {
  id: string;
  audioId?: string;
  providerId?: string;
  trackId?: string;
  ownerUid?: string;
  title: string;
  artist: string;
  album?: string;
  creatorName?: string;
  creatorUsername?: string;
  creatorAvatarUrl?: string;
  description?: string;
  coverUrl: string;
  artwork?: string;
  audioUrl: string;
  previewUrl?: string;
  storagePath?: string;
  duration: number; // in seconds
  mimeType?: string;
  fileSize?: number;
  genre?: string;
  licensing?: string;
  isOriginal?: boolean;
  visibility?: 'PUBLIC' | 'PRIVATE';
  status?: 'APPROVED' | 'ACTIVE' | 'FLAGGED' | 'REMOVED' | 'UNAVAILABLE';
  usageCount?: number;
  playCount?: number;
  saveCount?: number;
  trendingScore?: number;
  featured?: boolean;
  isSaved?: boolean;
  creatorId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AudioAttachmentConfig {
  audioId: string;
  trackId?: string;
  provider?: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  coverUrl?: string;
  audioUrl?: string;
  audioStartTime?: number; // e.g. 15.0
  audioEndTime?: number;   // e.g. 45.0
  duration?: number;       // clip length e.g. 15, 30
  audioVolume?: number;    // 0.0 to 1.0 (default 0.8)
  originalAudioVolume?: number; // 0.0 to 1.0 (default 1.0)
  originalAudioEnabled?: boolean;
  musicVolume?: number;
  originalVolume?: number;
  isOriginal?: boolean;
  license?: string;
  status?: 'APPROVED' | 'ACTIVE' | 'UNAVAILABLE';
  audio?: MusicTrack;
}

export interface AudioUsageRecord {
  id: string;
  audioId: string;
  contentId: string;
  contentType: 'post' | 'reel' | 'story';
  userId: string;
  createdAt: string;
}

export interface AudioReportRecord {
  id: string;
  audioId: string;
  reporterId: string;
  reporterUsername?: string;
  reason: 'copyright' | 'inappropriate' | 'spam' | 'misleading' | 'other' | string;
  description?: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface CarouselItem {
  id: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  mediaType: 'image' | 'video';
  duration?: number;
  originalName?: string;
}

export interface Post {
  id: string;
  contentId?: string;
  userId: string;
  ownerUid?: string;
  author: UserPreview;
  caption: string;
  mediaType: 'image' | 'video' | 'carousel';
  mediaUrl: string;
  thumbnailUrl?: string;
  storagePath?: string;
  permanentStoragePath?: string;
  thumbnailPath?: string;
  thumbnailStoragePath?: string;
  status?: 'published' | 'processing' | 'archived';
  visibility?: 'PUBLIC' | 'PRIVATE' | 'FOLLOWERS';
  carouselItems?: CarouselItem[];
  videoDuration?: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isLiked?: boolean;
  isSaved?: boolean;
  audio?: MusicTrack;
  audioId?: string;
  audioStartTime?: number;
  audioEndTime?: number;
  audioVolume?: number;
  originalAudioVolume?: number;
  createdAt: string;
  updatedAt?: string;
  location?: string;
  tags?: string[];
  width?: number;
  height?: number;
}

export interface Reel {
  id: string;
  contentId?: string;
  userId: string;
  ownerUid?: string;
  author: UserPreview;
  videoUrl: string;
  thumbnailUrl?: string;
  storagePath?: string;
  permanentStoragePath?: string;
  thumbnailPath?: string;
  thumbnailStoragePath?: string;
  status?: 'published' | 'processing' | 'archived';
  visibility?: 'PUBLIC' | 'PRIVATE' | 'FOLLOWERS';
  caption: string;
  duration?: number;
  videoDuration?: number;
  width?: number;
  height?: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isLiked?: boolean;
  isSaved?: boolean;
  audio?: MusicTrack;
  audioId?: string;
  audioStartTime?: number;
  audioEndTime?: number;
  audioVolume?: number;
  originalAudioVolume?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Story {
  id: string;
  userId: string;
  author: UserPreview;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  audio?: MusicTrack;
  audioId?: string;
  audioStartTime?: number;
  audioEndTime?: number;
  audioVolume?: number;
  originalAudioVolume?: number;
  duration?: number;
  segmentIndex?: number;
  totalSegments?: number;
  segmentGroupId?: string;
  caption?: string;
  createdAt: string;
  expiresAt: string;
  isViewed?: boolean;
  viewsCount?: number;
  viewers?: UserPreview[];
  likesCount?: number;
  isLiked?: boolean;
  likes?: string[];
}

export interface SavedAccount {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  verified?: boolean;
  token: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  author: UserPreview;
  text: string;
  likesCount: number;
  isLiked?: boolean;
  replies?: Comment[];
  createdAt: string;
}

export interface SharedContentReference {
  type: 'post' | 'reel' | 'POST' | 'REEL';
  id: string;
  authorUsername?: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  author?: UserPreview;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | 'carousel';
  isAvailable?: boolean; // false if post/reel was deleted or removed by admin
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender?: UserPreview;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'voice' | 'file';
  voiceDuration?: number;
  sharedContent?: SharedContentReference;
  isSystem?: boolean; // For group system messages e.g. "Alex added Sam to the group."
  systemEventType?: 'MEMBER_ADDED' | 'MEMBER_REMOVED' | 'MEMBER_LEFT' | 'ADMIN_PROMOTED' | 'ADMIN_DEMOTED' | 'GROUP_RENAMED' | 'GROUP_PHOTO_CHANGED' | 'GROUP_CREATED';
  createdAt: string;
  isRead?: boolean;
  seenAt?: string;
  deletedForEveryone?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedFor?: string[]; // User IDs who deleted this message for themselves
}

export interface MessageDeletionRecord {
  id: string; // `${messageId}_${userId}`
  messageId: string;
  userId: string;
  deletedAt: string;
}

export interface Conversation {
  id: string;
  name?: string;
  isGroup?: boolean;
  groupName?: string;
  groupAvatarUrl?: string;
  creatorId?: string;
  adminIds?: string[]; // IDs of members who are group admins
  participants: UserPreview[];
  lastMessage?: Message;
  unreadCount?: number;
  updatedAt: string;
}

export type CallStatus = 
  | 'calling' 
  | 'ringing' 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'active' 
  | 'ended' 
  | 'declined' 
  | 'missed' 
  | 'busy' 
  | 'offline' 
  | 'cancelled' 
  | 'failed';

export type CallType = 'audio' | 'video';

export interface CallSignalStore {
  offer?: any;
  answer?: any;
  callerCandidates?: any[];
  receiverCandidates?: any[];
}

export interface Call {
  id: string;
  callerId: string;
  caller: UserPreview;
  receiverId: string;
  receiver: UserPreview;
  type: CallType;
  status: CallStatus;
  startedAt?: string;
  connectedAt?: string;
  endedAt?: string;
  duration?: number;
  endReason?: string;
  signals?: CallSignalStore;
}

export interface CallSignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate' | 'media-state' | 'reconnect';
  sdp?: any;
  candidate?: any;
  mediaState?: {
    isMuted: boolean;
    isVideoEnabled: boolean;
  };
}

export interface CallHistoryItem {
  id: string;
  peer: UserPreview;
  type: CallType;
  direction: 'incoming' | 'outgoing';
  status: CallStatus;
  timestamp: string;
  duration?: number;
}

export type NotificationType = 
  | 'LIKE' 
  | 'COMMENT' 
  | 'FOLLOW' 
  | 'FOLLOW_REQUEST' 
  | 'REQUEST_ACCEPTED' 
  | 'CALL' 
  | 'MISSED_CALL' 
  | 'MENTION' 
  | 'STORY_LIKE'
  | 'REPORT'
  | 'WARNING';

export interface Notification {
  id: string;
  userId: string;
  actorId: string;
  actor: UserPreview;
  type: NotificationType;
  targetId?: string;
  previewText?: string;
  isRead: boolean;
  createdAt: string;
}

export type SearchTab = 'top' | 'posts' | 'reels' | 'accounts' | 'audio' | 'tags';

export interface Hashtag {
  name: string;
  postsCount: number;
}

export interface SearchWeights {
  accounts: number;
  tags: number;
  audio: number;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reporter: UserPreview;
  targetType: 'post' | 'reel' | 'user' | 'comment';
  targetId: string;
  targetAuthorId?: string;
  targetPreview?: {
    authorId?: string;
    username?: string;
    caption?: string;
    mediaUrl?: string;
    mediaType?: string;
    thumbnailUrl?: string;
  };
  reason: string;
  details?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  actionTaken?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface AdItem {
  id: string;
  title: string;
  sponsorName: string;
  sponsorAvatarUrl?: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string;
  targetUrl: string;
  ctaText: string;
  placement: 'feed' | 'reels' | 'stories';
  isActive: boolean;
  impressions: number;
  clicks: number;
  createdAt?: string;
}

export interface MediaRecord {
  id: string;
  contentId?: string;
  ownerUid: string;
  mediaType: 'image' | 'video' | 'audio';
  storagePath: string;
  permanentStoragePath?: string;
  thumbnailPath?: string;
  thumbnailStoragePath?: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  duration?: number;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
  status?: 'ready' | 'processing' | 'failed';
  visibility: 'PUBLIC' | 'PRIVATE' | 'FOLLOWERS';
  deleted: boolean;
  deletedAt?: string | null;
  dataBase64?: string;
}

export interface MediaDiagnosticIssue {
  id: string;
  type: 'broken_media' | 'missing_thumbnail' | 'legacy_schema' | 'missing_author' | 'unbound_storage';
  severity: 'high' | 'medium' | 'low';
  contentId?: string;
  contentType: 'post' | 'reel' | 'story' | 'avatar' | 'storage_object';
  title: string;
  description: string;
  path?: string;
  canAutoRepair: boolean;
}

export interface MediaDiagnosticReport {
  timestamp: string;
  appVersion: string;
  summary: {
    totalPosts: number;
    totalReels: number;
    totalStories: number;
    totalMediaRecords: number;
    vaultEntriesCount: number;
    diskFilesCount: number;
    healthyCount: number;
    issuesCount: number;
    legacySchemaCount: number;
  };
  issues: MediaDiagnosticIssue[];
  recommendations: string[];
}

export interface MediaRepairResult {
  success: boolean;
  timestamp: string;
  repairedCount: number;
  migratedSchemaCount: number;
  restoredFromVaultCount: number;
  details: string[];
}

export interface MediaPlaybackErrorLog {
  id?: string;
  contentId?: string;
  ownerUid?: string;
  mediaType: string;
  storagePath: string;
  httpStatus?: number;
  storageError?: string;
  playbackError?: string;
  timestamp: string;
  appVersion: string;
  userAgent?: string;
}

export interface UserNotificationPreferences {
  pauseAll: boolean;
  likes: boolean;
  comments: boolean;
  newFollowers: boolean;
  directMessages: boolean;
  mentions: boolean;
  calls: boolean;
}

export interface UserSettings {
  userId: string;
  // Privacy Settings
  isPrivateAccount: boolean;
  activityStatus: boolean;
  readReceipts: boolean;
  // Message & Calling Permissions
  messageRequests: 'everyone' | 'following' | 'nobody';
  callingPermissions: 'everyone' | 'following' | 'nobody';
  followRequestsAutoApprove: boolean;
  // Notification Preferences
  notifications: UserNotificationPreferences;
  // Content Preferences
  contentFilter: 'standard' | 'less';
  preferredLanguage: string;
  autoplayVideos: boolean;
  // Blocked Accounts
  blockedUserIds: string[];
  // Security & Verification
  twoFactorEnabled: boolean;
  phoneVerified: boolean;
  verifiedPhone?: string;
  lastPasswordChange?: string;
  sessionRevokedBefore?: number;
  updatedAt: string;
}

// ==========================================
// ISHARA AI CODING AGENT & APP BUILDER TYPES
// ==========================================

export interface AiCodeDiff {
  filePath: string;
  reason: string;
  changesSummary: string;
  originalContent: string;
  proposedContent: string;
  unifiedDiff: string;
  isHighRisk?: boolean;
}

export interface AiStructuredResponse {
  understanding: string;
  plan: string[];
  filesInvolved: string[];
  changes: string[];
  diffs: AiCodeDiff[];
  tests: string[];
  result: 'READY_FOR_PREVIEW' | 'REQUIRES_CONFIRMATION' | 'NEEDS_ATTENTION' | 'ERROR';
  version: string;
  deployment: 'PREVIEW_READY' | 'APPLIED' | 'DEPLOYED' | 'ROLLBACK_READY' | 'FAILED';
  isHighRisk?: boolean;
  riskWarning?: string;
}

export interface AiAgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  screenshotUrl?: string;
  structuredResponse?: AiStructuredResponse;
  status?: 'pending' | 'success' | 'failed' | 'needs_approval';
}

export interface AiVersionSnapshot {
  versionId: string;
  prompt: string;
  changedFiles: string[];
  timestamp: string;
  adminUid: string;
  diffs: AiCodeDiff[];
  buildStatus: 'SUCCESS' | 'FAILED' | 'PENDING';
  testStatus: 'SUCCESS' | 'FAILED' | 'PENDING';
  status: 'DRAFT' | 'APPLIED' | 'ROLLED_BACK' | 'DEPLOYED';
  rollbackAvailable: boolean;
}

export interface AiProjectArchitecture {
  frontend: {
    framework: string;
    bundler: string;
    styling: string;
    animation: string;
    mainEntry: string;
    componentsCount: number;
  };
  backend: {
    server: string;
    language: string;
    runtime: string;
    port: number;
    realtime: string;
  };
  database: {
    primary: string;
    projectId: string;
    databaseId: string;
    fallback: string;
    totalCollections: number;
  };
  auth: {
    mechanism: string;
    roles: string[];
    ownerAdminUid: string;
  };
  storage: {
    tier: string;
    vaultPath: string;
    totalItems: number;
  };
  security: {
    firestoreRules: string;
    rulesPath: string;
  };
  routes: {
    count: number;
    categories: Record<string, number>;
  };
  recentLogs?: string[];
}

