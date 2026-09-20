import fs from 'fs';
import path from 'path';
import { 
  User, 
  UserPreview,
  Post, 
  Reel, 
  Story, 
  MusicTrack, 
  Comment, 
  Message, 
  MessageDeletionRecord,
  Conversation, 
  Call, 
  CallHistoryItem, 
  Notification, 
  ReportItem, 
  AdItem,
  BanHistoryEntry,
  MediaRecord,
  UserSettings
} from '../src/types/index';
import { 
  hashPassword, 
  normalizeUsername, 
  OWNER_ADMIN_UID, 
  OWNER_ADMIN_USERNAME 
} from './utils/security';
import { FirebaseSyncService } from './services/FirebaseSyncService';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORAGE_DIR = path.join(process.cwd(), 'storage');
const STORAGE_DB_DIR = path.join(STORAGE_DIR, 'db');
const STORAGE_BACKUPS_DIR = path.join(STORAGE_DIR, 'backups');
const PUBLIC_STORAGE_DIR = path.join(process.cwd(), 'public', 'storage');
const DIST_STORAGE_DIR = path.join(process.cwd(), 'dist', 'storage');

const DB_FILE = path.join(DATA_DIR, 'ishara_db.json');
const STORAGE_DB_FILE = path.join(STORAGE_DB_DIR, 'ishara_db.json');
const PUBLIC_DB_FILE = path.join(PUBLIC_STORAGE_DIR, 'ishara_db.json');
const DIST_DB_FILE = path.join(DIST_STORAGE_DIR, 'ishara_db.json');
const BACKUP_FILE = path.join(DATA_DIR, 'ishara_db.backup.json');
const GOLDEN_FILE = path.join(DATA_DIR, 'ishara_db.golden.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Ensure all persistent and mirrored storage directories exist immediately
[DATA_DIR, STORAGE_DIR, STORAGE_DB_DIR, STORAGE_BACKUPS_DIR, PUBLIC_STORAGE_DIR, BACKUPS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
});

export interface FollowRelation {
  id: string;
  followerId: string;
  followingId: string;
  status: 'PENDING' | 'ACCEPTED';
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  usernames: Record<string, string>; // normalizedUsername -> userId
  passwords: Record<string, string>; // userId -> password (salted PBKDF2 hash or legacy plaintext)
  follows: FollowRelation[];
  posts: Post[];
  reels: Reel[];
  stories: Story[];
  musicTracks: MusicTrack[];
  comments: Comment[];
  conversations: Conversation[];
  messages: Message[];
  messageDeletions?: Record<string, MessageDeletionRecord>; // key: `${messageId}_${userId}`
  calls: Call[];
  callHistory: Record<string, CallHistoryItem[]>; // userId -> history
  notifications: Notification[];
  savedPostIds: Record<string, string[]>; // userId -> postId[]
  likedPostIds: Record<string, string[]>; // userId -> postId[]
  likedReelIds: Record<string, string[]>; // userId -> reelId[]
  likedCommentIds: Record<string, string[]>; // userId -> commentId[]
  reports: ReportItem[];
  ads: AdItem[];
  banHistory: BanHistoryEntry[];
  mediaRecords: MediaRecord[];
  userSettings: Record<string, UserSettings>; // userId -> UserSettings
  blockedUsers: Record<string, string[]>; // userId -> targetUserId[]
  audioSaves: Record<string, string[]>; // userId -> audioId[]
  audioPlays: Array<{ id: string; audioId: string; userId?: string; createdAt: string }>;
  audioUsage: Array<{ id: string; audioId: string; contentId: string; contentType: 'post' | 'reel' | 'story'; userId: string; createdAt: string }>;
  audioReports: Array<{ id: string; audioId: string; reporterId: string; reporterUsername?: string; reason: string; description?: string; status: 'PENDING' | 'RESOLVED' | 'DISMISSED'; createdAt: string; resolvedAt?: string; resolvedBy?: string }>;
}

const initialTracks: MusicTrack[] = [
  {
    id: 'track-1',
    audioId: 'track-1',
    providerId: 'ishara-records',
    trackId: 'ishara-track-1',
    ownerUid: 'user-shuv',
    title: 'Midnight Resonance',
    artist: 'Ishara Originals',
    album: 'Night Textures EP',
    creatorName: 'Shuv',
    creatorUsername: 'shuv',
    description: 'Deep soothing lo-fi ambiance with calm textures for evening stories.',
    audioUrl: '/uploads/audio-midnight-resonance.mp3',
    previewUrl: '/uploads/audio-midnight-resonance.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
    duration: 182,
    usageCount: 1420,
    playCount: 4200,
    saveCount: 310,
    genre: 'Ambient Lo-Fi',
    licensing: 'Creative Commons Attribution 4.0 International',
    isOriginal: true,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    featured: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'track-2',
    audioId: 'track-2',
    providerId: 'ishara-records',
    trackId: 'ishara-track-2',
    ownerUid: 'user-shuv',
    title: 'Neon Horizon',
    artist: 'Kroma Sound Lab',
    album: 'Synth Odyssey',
    creatorName: 'Kroma',
    creatorUsername: 'kroma',
    description: 'Fast tempo 80s synthwave lead with energetic momentum for reels and stories.',
    audioUrl: '/uploads/audio-neon-horizon.mp3',
    previewUrl: '/uploads/audio-neon-horizon.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
    duration: 140,
    usageCount: 890,
    playCount: 2900,
    saveCount: 180,
    genre: 'Synthwave',
    licensing: 'Creative Commons Attribution 4.0 International',
    isOriginal: false,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'track-3',
    audioId: 'track-3',
    providerId: 'ishara-records',
    trackId: 'ishara-track-3',
    ownerUid: 'user-shuv',
    title: 'Golden Sunset Acoustic',
    artist: 'Elena Rossi',
    album: 'Coastal Strings',
    creatorName: 'Elena Rossi',
    creatorUsername: 'elena',
    description: 'Organic nylon-string guitar picking recorded warm on the seaside.',
    audioUrl: '/uploads/audio-golden-sunset.mp3',
    previewUrl: '/uploads/audio-golden-sunset.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
    duration: 180,
    usageCount: 3240,
    playCount: 6800,
    saveCount: 520,
    genre: 'Acoustic',
    licensing: 'Creative Commons Attribution 4.0 International',
    isOriginal: true,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    featured: true,
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z'
  },
  {
    id: 'track-4',
    audioId: 'track-4',
    providerId: 'ishara-records',
    trackId: 'ishara-track-4',
    title: 'Tokyo Rain Beats',
    artist: 'Studio Kai',
    album: 'Shibuya Dreams',
    description: 'Mellow chillhop study beat with vinyl crackle and soothing chord progressions.',
    audioUrl: '/uploads/audio-tokyo-rain.mp3',
    previewUrl: '/uploads/audio-tokyo-rain.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
    duration: 135,
    usageCount: 2150,
    playCount: 5400,
    saveCount: 410,
    genre: 'Lo-Fi',
    licensing: 'Creative Commons Attribution 4.0 International',
    isOriginal: false,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    featured: true,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z'
  },
  {
    id: 'track-5',
    audioId: 'track-5',
    providerId: 'ishara-records',
    trackId: 'ishara-track-5',
    title: 'Cyberpunk Stride',
    artist: 'Aura Collective',
    album: 'Grid Runner',
    description: 'Dark energetic electronic arpeggiator beat with heavy driving bassline.',
    audioUrl: '/uploads/audio-cyberpunk-stride.mp3',
    previewUrl: '/uploads/audio-cyberpunk-stride.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    duration: 150,
    usageCount: 1680,
    playCount: 3950,
    saveCount: 290,
    genre: 'Electronic',
    licensing: 'Creative Commons Attribution 4.0 International',
    isOriginal: false,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    createdAt: '2026-01-20T00:00:00.000Z',
    updatedAt: '2026-01-20T00:00:00.000Z'
  },
  {
    id: 'track-6',
    audioId: 'track-6',
    providerId: 'ishara-records',
    trackId: 'ishara-track-6',
    title: 'Velvet Twilight',
    artist: 'Aether Project',
    album: 'Deep Echoes',
    description: 'Dreamy ambient pads with lush spatial reverb and ethereal vocal texture.',
    audioUrl: '/uploads/audio-velvet-twilight.mp3',
    previewUrl: '/uploads/audio-velvet-twilight.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
    duration: 210,
    usageCount: 940,
    playCount: 2200,
    saveCount: 175,
    genre: 'Ambient',
    licensing: 'Creative Commons Attribution 4.0 International',
    isOriginal: true,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    createdAt: '2026-01-25T00:00:00.000Z',
    updatedAt: '2026-01-25T00:00:00.000Z'
  },
  {
    id: 'track-7',
    audioId: 'track-7',
    providerId: 'ishara-records',
    trackId: 'ishara-track-7',
    title: 'Blazes Energy Rhythm',
    artist: 'Ishara Beats',
    album: 'Energy Vol. 1',
    description: 'Dynamic upbeat dance tempo perfect for fast-paced video edits and transitions.',
    audioUrl: '/uploads/audio-blazes-theme.mp3',
    previewUrl: '/uploads/audio-blazes-theme.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=500&auto=format&fit=crop&q=80',
    duration: 14,
    usageCount: 2890,
    playCount: 7100,
    saveCount: 460,
    genre: 'Pop',
    licensing: 'Creative Commons Public Domain (CC0)',
    isOriginal: false,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    featured: true,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z'
  },
  {
    id: 'track-8',
    audioId: 'track-8',
    providerId: 'ishara-records',
    trackId: 'ishara-track-8',
    title: 'Ocean Surf Chill',
    artist: 'VibeCraft',
    album: 'Nature Soundscapes',
    description: 'Authentic ocean breeze combined with soft acoustic guitar harmonics.',
    audioUrl: '/uploads/audio-ocean-surf.mp3',
    previewUrl: '/uploads/audio-ocean-surf.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80',
    duration: 14,
    usageCount: 1780,
    playCount: 4100,
    saveCount: 320,
    genre: 'Cinematic',
    licensing: 'Creative Commons Public Domain (CC0)',
    isOriginal: true,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    createdAt: '2026-02-05T00:00:00.000Z',
    updatedAt: '2026-02-05T00:00:00.000Z'
  },
  {
    id: 'track-9',
    audioId: 'track-9',
    providerId: 'ishara-records',
    trackId: 'ishara-track-9',
    title: 'Escapes Journey',
    artist: 'Wanderlust Trio',
    album: 'Road Less Traveled',
    description: 'Uplifting travel acoustic strumming capturing freedom and road trips.',
    audioUrl: '/uploads/audio-escapes-journey.mp3',
    previewUrl: '/uploads/audio-escapes-journey.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&auto=format&fit=crop&q=80',
    duration: 12,
    usageCount: 1340,
    playCount: 3250,
    saveCount: 210,
    genre: 'Acoustic',
    licensing: 'Creative Commons Public Domain (CC0)',
    isOriginal: false,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z'
  },
  {
    id: 'track-10',
    audioId: 'track-10',
    providerId: 'ishara-records',
    trackId: 'ishara-track-10',
    title: 'Morning Forest Mist',
    artist: 'Serenity Audio',
    album: 'Dawn Reflections',
    description: 'Gentle morning birds and woodland acoustic resonance for peaceful stories.',
    audioUrl: '/uploads/audio-morning-mist.mp3',
    previewUrl: '/uploads/audio-morning-mist.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=500&auto=format&fit=crop&q=80',
    artwork: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=500&auto=format&fit=crop&q=80',
    duration: 5,
    usageCount: 920,
    playCount: 1980,
    saveCount: 140,
    genre: 'Ambient',
    licensing: 'Creative Commons Public Domain (CC0)',
    isOriginal: false,
    visibility: 'PUBLIC',
    status: 'APPROVED',
    createdAt: '2026-02-15T00:00:00.000Z',
    updatedAt: '2026-02-15T00:00:00.000Z'
  }
];

const initialUsers: User[] = [
  {
    id: 'user-shuv',
    username: 'shuv',
    displayName: 'Shuv',
    email: 'shuv@ishara.social',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
    bio: 'Owner & Admin at ISHARA. Building next-generation social experiences 🚀',
    role: 'OWNER_ADMIN',
    verified: true,
    followersCount: 0,
    followingCount: 0,
    postsCount: 1,
    isPrivate: false,
    createdAt: '2026-01-01T00:00:00.000Z'
  }
];

const initialPosts: Post[] = [
  {
    id: 'post-1',
    userId: 'user-shuv',
    author: {
      id: 'user-shuv',
      username: 'shuv',
      displayName: 'Shuv',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
      role: 'OWNER_ADMIN',
      verified: true
    },
    caption: 'Welcome to ISHARA! A space for effortless connection, music, and authentic stories. 🚀✨',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=80',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    audio: initialTracks[0],
    createdAt: '2026-02-28T10:00:00.000Z'
  }
];

const initialReels: Reel[] = [
  {
    id: 'reel-1',
    userId: 'user-shuv',
    author: {
      id: 'user-shuv',
      username: 'shuv',
      displayName: 'Shuv',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
      role: 'OWNER_ADMIN',
      verified: true
    },
    videoUrl: '/uploads/sample-blazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
    caption: 'Welcome to ISHARA Reels! 🔥🎵',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    audio: initialTracks[0],
    createdAt: '2026-03-01T12:00:00.000Z'
  }
];

const initialStories: Story[] = [
  {
    id: 'story-1',
    userId: 'user-shuv',
    author: {
      id: 'user-shuv',
      username: 'shuv',
      displayName: 'Shuv',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
      role: 'OWNER_ADMIN',
      verified: true
    },
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=80',
    caption: 'Welcome to ISHARA! 👋',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
];

class Database {
  private data: DatabaseSchema;
  private lastSnapshotTime = 0;

  constructor() {
    this.data = this.loadData();
  }

  private tryParseDbFile(filePath: string): DatabaseSchema | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size < 10) return null;

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.users)) {
        return parsed as DatabaseSchema;
      }
    } catch (err) {
      console.warn(`[Database] Could not read/parse database candidate ${filePath}:`, err);
    }
    return null;
  }

  private loadData(): DatabaseSchema {
    try {
      [DATA_DIR, STORAGE_DIR, STORAGE_DB_DIR, STORAGE_BACKUPS_DIR, PUBLIC_STORAGE_DIR, BACKUPS_DIR].forEach(d => {
        if (!fs.existsSync(d)) {
          try { fs.mkdirSync(d, { recursive: true }); } catch {}
        }
      });

      // Collect all candidate database files across all storage tiers in order of recovery priority
      const candidateFiles: string[] = [
        STORAGE_DB_FILE,
        PUBLIC_DB_FILE,
        DB_FILE,
        BACKUP_FILE,
        GOLDEN_FILE,
        DIST_DB_FILE
      ];

      // Also gather historical backups from all tiers sorted by newest modified time
      [STORAGE_BACKUPS_DIR, BACKUPS_DIR].forEach(bDir => {
        try {
          if (fs.existsSync(bDir)) {
            const files = fs.readdirSync(bDir)
              .filter(f => f.endsWith('.json'))
              .map(f => path.join(bDir, f))
              .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
            candidateFiles.push(...files);
          }
        } catch (backupScanErr) {
          console.warn('[Database] Backup directory scan warning:', backupScanErr);
        }
      });

      let parsed: DatabaseSchema | null = null;
      let loadedFromCandidate = '';

      for (const candidate of candidateFiles) {
        const candidateData = this.tryParseDbFile(candidate);
        if (candidateData && candidateData.users && candidateData.users.length > 0) {
          parsed = candidateData;
          loadedFromCandidate = candidate;
          break;
        }
      }

      if (parsed) {
        console.log(`[Database] 🚀 Loaded persistent database state from ${loadedFromCandidate}`);

        // Cross-backup recovery check: ensure no posts, reels, or users are lost across redeployments
        const allPostsMap = new Map<string, Post>();
        const allReelsMap = new Map<string, Reel>();
        const allUsersMap = new Map<string, User>();

        // Seed with primary parsed data
        (parsed.posts || []).forEach(p => { if (p && p.id) allPostsMap.set(p.id, p); });
        (parsed.reels || []).forEach(r => { if (r && r.id) allReelsMap.set(r.id, r); });
        (parsed.users || []).forEach(u => { if (u && u.id) allUsersMap.set(u.id, u); });

        // Merge any posts/reels/users from other candidate backups that might be missing
        for (const candidate of candidateFiles) {
          if (candidate === loadedFromCandidate) continue;
          const otherData = this.tryParseDbFile(candidate);
          if (otherData) {
            (otherData.posts || []).forEach(p => {
              if (p && p.id && !allPostsMap.has(p.id)) {
                console.log(`[Database] Restored previously existing post ${p.id} from backup ${candidate}`);
                allPostsMap.set(p.id, p);
              }
            });
            (otherData.reels || []).forEach(r => {
              if (r && r.id && !allReelsMap.has(r.id)) {
                console.log(`[Database] Restored previously existing reel ${r.id} from backup ${candidate}`);
                allReelsMap.set(r.id, r);
              }
            });
            (otherData.users || []).forEach(u => {
              if (u && u.id && !allUsersMap.has(u.id)) {
                allUsersMap.set(u.id, u);
              }
            });
          }
        }

        // Preserve all registered users without accidental deletion
        const sanitizedUsers: User[] = Array.from(allUsersMap.values());

        // Ensure Shuv admin exists
        const hasShuv = sanitizedUsers.some((u: User) => u.username.toLowerCase() === 'shuv' || u.id === 'user-shuv');
        if (!hasShuv) {
          sanitizedUsers.unshift(initialUsers[0]);
        } else {
          // Ensure Shuv has OWNER_ADMIN role and canonical properties
          const shuvUser = sanitizedUsers.find((u: User) => u.username.toLowerCase() === OWNER_ADMIN_USERNAME || u.id === OWNER_ADMIN_UID);
          if (shuvUser) {
            shuvUser.id = OWNER_ADMIN_UID;
            shuvUser.username = OWNER_ADMIN_USERNAME;
            shuvUser.role = 'OWNER_ADMIN';
            shuvUser.verified = true;
          }
        }

        // Reconstitute missing user accounts from post/reel author data so published content never disappears
        const existingUserIds = new Set(sanitizedUsers.map(u => u.id));
        const existingUsernames = new Set(sanitizedUsers.map(u => normalizeUsername(u.username)));

        const checkAndReconstituteUser = (userId: string, author?: UserPreview, createdAt?: string) => {
          if (!userId && (!author || !author.id)) return;
          const targetId = userId || author?.id;
          const targetUsername = author?.username ? normalizeUsername(author.username) : '';

          if (!existingUserIds.has(targetId) && (!targetUsername || !existingUsernames.has(targetUsername))) {
            const newUser: User = {
              id: targetId,
              username: author?.username || `user_${targetId.replace(/[^a-zA-Z0-9]/g, '')}`,
              displayName: author?.displayName || author?.username || 'Creator',
              email: `${author?.username || targetId}@ishara.user`,
              avatarUrl: author?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${author?.username || targetId}`,
              role: author?.role || 'USER',
              verified: Boolean(author?.verified),
              followersCount: author?.followersCount || 0,
              followingCount: author?.followingCount || 0,
              postsCount: 1,
              isPrivate: false,
              createdAt: createdAt || new Date().toISOString()
            };
            sanitizedUsers.push(newUser);
            existingUserIds.add(newUser.id);
            existingUsernames.add(normalizeUsername(newUser.username));
            console.log(`[Database] Preserved author account for user ${newUser.username} (${newUser.id}) to safeguard published content.`);
          }
        };

        allPostsMap.forEach(p => checkAndReconstituteUser(p.userId, p.author, p.createdAt));
        allReelsMap.forEach(r => checkAndReconstituteUser(r.userId, r.author, r.createdAt));

        const rawAdminPass = process.env.ADMIN_PASSWORD || process.env.OWNER_ADMIN_PASSWORD || (parsed.passwords && parsed.passwords[OWNER_ADMIN_UID]) || '2257';

        const mergedPasswords: Record<string, string> = {
          ...(parsed.passwords || {})
        };

        // If environment variable configured a specific admin password, use it
        if (process.env.ADMIN_PASSWORD || process.env.OWNER_ADMIN_PASSWORD) {
          mergedPasswords[OWNER_ADMIN_UID] = hashPassword(rawAdminPass);
        } else if (!mergedPasswords[OWNER_ADMIN_UID]) {
          mergedPasswords[OWNER_ADMIN_UID] = hashPassword(rawAdminPass);
        }

        // Migrate all plaintext passwords to PBKDF2 salt hashes automatically
        for (const [uid, pass] of Object.entries(mergedPasswords)) {
          if (typeof pass === 'string' && !pass.startsWith('pbkdf2$')) {
            mergedPasswords[uid] = hashPassword(pass);
          }
        }

        // Build atomic normalized username mapping
        const usernames: Record<string, string> = { ...(parsed.usernames || {}) };
        for (const u of sanitizedUsers) {
          if (u.username) {
            const norm = normalizeUsername(u.username);
            usernames[norm] = u.id;
          }
          if (u.email) {
            const normEmail = u.email.trim().toLowerCase();
            usernames[normEmail] = u.id;
          }
        }
        usernames[OWNER_ADMIN_USERNAME] = OWNER_ADMIN_UID;

        // Migrations: Backward compatibility and permanent reference stamping for all existing Posts & Reels
        const migratedPosts: Post[] = Array.from(allPostsMap.values()).map(p => {
          const permPath = p.storagePath || p.permanentStoragePath || p.mediaUrl;
          const thumbPath = p.thumbnailPath || p.thumbnailStoragePath || p.thumbnailUrl;
          return {
            ...p,
            contentId: p.contentId || p.id,
            ownerUid: p.ownerUid || p.userId,
            storagePath: permPath,
            permanentStoragePath: permPath,
            thumbnailPath: thumbPath,
            thumbnailStoragePath: thumbPath,
            status: p.status || 'published',
            visibility: p.visibility || 'PUBLIC',
            likesCount: typeof p.likesCount === 'number' ? p.likesCount : 0,
            commentsCount: typeof p.commentsCount === 'number' ? p.commentsCount : 0,
            sharesCount: typeof p.sharesCount === 'number' ? p.sharesCount : 0,
            updatedAt: p.updatedAt || p.createdAt || new Date().toISOString()
          };
        });

        const migratedReels: Reel[] = Array.from(allReelsMap.values()).map(r => {
          const permPath = r.storagePath || r.permanentStoragePath || r.videoUrl;
          const thumbPath = r.thumbnailPath || r.thumbnailStoragePath || r.thumbnailUrl;
          return {
            ...r,
            contentId: r.contentId || r.id,
            ownerUid: r.ownerUid || r.userId,
            storagePath: permPath,
            permanentStoragePath: permPath,
            thumbnailPath: thumbPath,
            thumbnailStoragePath: thumbPath,
            status: r.status || 'published',
            visibility: r.visibility || 'PUBLIC',
            likesCount: typeof r.likesCount === 'number' ? r.likesCount : 0,
            commentsCount: typeof r.commentsCount === 'number' ? r.commentsCount : 0,
            sharesCount: typeof r.sharesCount === 'number' ? r.sharesCount : 0,
            updatedAt: r.updatedAt || r.createdAt || new Date().toISOString()
          };
        });

        const rawStories: Story[] = parsed.stories || [];
        const mediaRecords: MediaRecord[] = (parsed.mediaRecords || []).map(m => ({
          ...m,
          permanentStoragePath: m.permanentStoragePath || m.storagePath,
          thumbnailStoragePath: m.thumbnailStoragePath || m.thumbnailPath,
          status: m.status || 'ready',
          visibility: m.visibility || 'PUBLIC',
          updatedAt: m.updatedAt || m.createdAt || new Date().toISOString()
        }));

        const result: DatabaseSchema = {
          ...this.getDefaultData(),
          ...parsed,
          users: sanitizedUsers,
          usernames,
          passwords: mergedPasswords,
          mediaRecords,
          reels: migratedReels,
          posts: migratedPosts,
          stories: rawStories,
          follows: parsed.follows || [],
          notifications: parsed.notifications || []
        };

        // Save immediately to ensure DB_FILE, storage/db, public/storage, and backups are synchronized
        this.saveData(result);
        return result;
      }
    } catch (err) {
      console.error('[Database] Critical error in loadData:', err);
    }

    console.warn('[Database] No existing database found. Initializing persistent storage with baseline dataset.');
    const defaultData = this.getDefaultData();
    this.saveData(defaultData);
    return defaultData;
  }

  private getDefaultData(): DatabaseSchema {
    const rawAdminPass = process.env.ADMIN_PASSWORD || process.env.OWNER_ADMIN_PASSWORD || '2257';
    const passwords: Record<string, string> = {
      [OWNER_ADMIN_UID]: hashPassword(rawAdminPass)
    };

    const usernames: Record<string, string> = {
      [OWNER_ADMIN_USERNAME]: OWNER_ADMIN_UID
    };

    const follows: FollowRelation[] = [];
    const notifications: Notification[] = [];

    return {
      users: initialUsers,
      usernames,
      passwords,
      follows,
      posts: initialPosts,
      reels: initialReels,
      stories: initialStories,
      musicTracks: initialTracks,
      comments: [],
      conversations: [],
      messages: [],
      messageDeletions: {},
      calls: [],
      callHistory: {},
      notifications,
      savedPostIds: {},
      likedPostIds: {},
      likedReelIds: {},
      likedCommentIds: {},
      reports: [],
      ads: [],
      banHistory: [],
      mediaRecords: [],
      userSettings: {},
      blockedUsers: {},
      audioSaves: {},
      audioPlays: [],
      audioUsage: [],
      audioReports: []
    };
  }

  public getData(): DatabaseSchema {
    if (!this.data) {
      this.data = this.getDefaultData();
    }
    // Ensure music tracks are populated and any legacy broken URLs are upgraded
    if (!this.data.musicTracks || this.data.musicTracks.length === 0) {
      this.data.musicTracks = [...initialTracks];
    } else {
      // Upgrade existing track URLs if pointing to dead external endpoints
      this.data.musicTracks = this.data.musicTracks.map(t => {
        if (t.audioUrl && t.audioUrl.includes('actions.google.com')) {
          const match = initialTracks.find(it => it.id === t.id);
          if (match) {
            return {
              ...t,
              audioUrl: match.audioUrl,
              previewUrl: match.previewUrl,
              providerId: match.providerId,
              licensing: match.licensing,
              duration: match.duration
            };
          }
        }
        return t;
      });

      // Merge any new catalog tracks that aren't yet in the database
      initialTracks.forEach(initTrack => {
        if (!this.data!.musicTracks.some(t => t.id === initTrack.id)) {
          this.data!.musicTracks.push(initTrack);
        }
      });
    }
    this.data.audioSaves = this.data.audioSaves || {};
    this.data.audioPlays = this.data.audioPlays || [];
    this.data.audioUsage = this.data.audioUsage || [];
    this.data.audioReports = this.data.audioReports || [];
    this.data.userSettings = this.data.userSettings || {};
    this.data.blockedUsers = this.data.blockedUsers || {};
    this.data.messageDeletions = this.data.messageDeletions || {};
    this.data.mediaRecords = this.data.mediaRecords || [];
    this.data.likedPostIds = this.data.likedPostIds || {};
    this.data.savedPostIds = this.data.savedPostIds || {};
    this.data.likedReelIds = this.data.likedReelIds || {};
    this.data.likedCommentIds = this.data.likedCommentIds || {};
    this.data.callHistory = this.data.callHistory || {};
    this.data.comments = this.data.comments || [];
    this.data.notifications = this.data.notifications || [];
    this.data.reports = this.data.reports || [];
    this.data.banHistory = this.data.banHistory || [];
    this.data.ads = this.data.ads || [];
    if (this.data.ads.length === 0) {
      this.data.ads = [
        {
          id: 'ad-sample-1',
          title: 'Discover Next-Gen Filmmaking Gear & Tools',
          sponsorName: 'Kroma CineGear',
          sponsorAvatarUrl: 'https://images.unsplash.com/photo-1572044162444-ad60f128bdea?w=100&auto=format&fit=crop&q=80',
          mediaType: 'video',
          mediaUrl: '/uploads/sample-blazes.mp4',
          targetUrl: 'https://ishara.social',
          ctaText: 'Explore Gear',
          placement: 'reels',
          isActive: true,
          impressions: 48,
          clicks: 12,
          createdAt: new Date().toISOString()
        }
      ];
    }
    return this.data;
  }

  public saveData(customData?: DatabaseSchema): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }

      const dataToSave = customData || this.data;

      // CRITICAL PRESERVATION SHIELD:
      // Never allow an empty users, posts, or reels array to overwrite existing valid data
      if (this.data && this.data.users && this.data.users.length > 0) {
        if (!dataToSave.users || dataToSave.users.length === 0) {
          console.error('[Database] CRITICAL: Attempted to save empty users list over existing users! Save aborted to protect user data.');
          return;
        }
      }
      if (this.data && this.data.posts && this.data.posts.length > 0) {
        if (!dataToSave.posts || dataToSave.posts.length === 0) {
          console.error('[Database] CRITICAL: Attempted to save empty posts list over existing posts! Save aborted to protect user posts.');
          return;
        }
      }
      if (this.data && this.data.reels && this.data.reels.length > 0) {
        if (!dataToSave.reels || dataToSave.reels.length === 0) {
          console.error('[Database] CRITICAL: Attempted to save empty reels list over existing reels! Save aborted to protect user reels.');
          return;
        }
      }

      const serialized = JSON.stringify(dataToSave, null, 2);

      // 1. Atomic write using temporary file to prevent partial write corruption
      const tmpFile = path.join(DATA_DIR, `ishara_db.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.json`);
      fs.writeFileSync(tmpFile, serialized, 'utf-8');

      // Verify the tmp file wrote completely and parses back cleanly
      const verifyRaw = fs.readFileSync(tmpFile, 'utf-8');
      JSON.parse(verifyRaw);

      // 2. Mirror existing live DB to BACKUP_FILE before renaming
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, BACKUP_FILE);
        } catch {}
      }

      // 3. Atomically replace DB_FILE
      fs.renameSync(tmpFile, DB_FILE);

      // 4. Mirror immediately across all persistent storage tiers
      try {
        if (!fs.existsSync(STORAGE_DB_DIR)) fs.mkdirSync(STORAGE_DB_DIR, { recursive: true });
        fs.copyFileSync(DB_FILE, STORAGE_DB_FILE);
      } catch (mirrorErr) {
        console.warn('[Database] Storage DB mirror warning:', mirrorErr);
      }

      try {
        if (!fs.existsSync(PUBLIC_STORAGE_DIR)) fs.mkdirSync(PUBLIC_STORAGE_DIR, { recursive: true });
        fs.copyFileSync(DB_FILE, PUBLIC_DB_FILE);
      } catch (publicErr) {
        console.warn('[Database] Public storage DB mirror warning:', publicErr);
      }

      try {
        if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
          if (!fs.existsSync(DIST_STORAGE_DIR)) fs.mkdirSync(DIST_STORAGE_DIR, { recursive: true });
          fs.copyFileSync(DB_FILE, DIST_DB_FILE);
        }
      } catch {}

      // 5. Update golden copy if healthy
      if (dataToSave.users && dataToSave.users.length > 0) {
        try {
          fs.copyFileSync(DB_FILE, GOLDEN_FILE);
        } catch {}
      }

      // 6. Periodic rotating backup snapshot across data/backups and storage/backups
      const now = Date.now();
      if (now - this.lastSnapshotTime > 10 * 60 * 1000) {
        this.lastSnapshotTime = now;
        const snapshotName = `ishara_db_auto_backup_${now}.json`;
        
        [BACKUPS_DIR, STORAGE_BACKUPS_DIR].forEach(bDir => {
          try {
            if (!fs.existsSync(bDir)) fs.mkdirSync(bDir, { recursive: true });
            const snapFile = path.join(bDir, snapshotName);
            fs.copyFileSync(DB_FILE, snapFile);

            const bFiles = fs.readdirSync(bDir)
              .filter(f => f.startsWith('ishara_db_auto_backup_') && f.endsWith('.json'))
              .map(f => path.join(bDir, f))
              .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

            if (bFiles.length > 10) {
              for (const oldFile of bFiles.slice(10)) {
                try { fs.unlinkSync(oldFile); } catch {}
              }
            }
          } catch (snapErr) {
            console.warn('[Database] Snapshot backup error:', snapErr);
          }
        });

        // 7. Synchronize periodic snapshot to Cloud Firestore if write quota is available
        if (!FirebaseSyncService.isWriteQuotaExhausted()) {
          FirebaseSyncService.syncDatabaseToCloud(dataToSave).catch(cloudErr => {
            console.warn('[Database] Cloud Firestore sync warning:', cloudErr);
          });
        }
      }
    } catch (err) {
      console.error('[Database] Failed to save DB file safely:', err);
    }
  }

  public async initCloudSync(): Promise<void> {
    try {
      const cloudData = await FirebaseSyncService.restoreDatabaseFromCloud();
      if (cloudData && Array.isArray(cloudData.users) && cloudData.users.length > 0) {
        let updated = false;

        // 1. Restore & merge users
        const currentUsersMap = new Map((this.data.users || []).map(u => [u.id, u]));
        cloudData.users.forEach((u: any) => {
          if (u && u.id) {
            u.isPrivate = false;
            if (!currentUsersMap.has(u.id)) {
              this.data.users.push(u);
              updated = true;
            } else {
              // Update existing user with cloud values while keeping public visibility
              const existing = currentUsersMap.get(u.id)!;
              Object.assign(existing, u);
              existing.isPrivate = false;
              updated = true;
            }
          }
        });

        // 2. Restore & merge posts
        const currentPostsMap = new Map((this.data.posts || []).map(p => [p.id, p]));
        (cloudData.posts || []).forEach((p: any) => {
          if (p && p.id) {
            if (!currentPostsMap.has(p.id)) {
              this.data.posts.push(p);
              updated = true;
            } else {
              const existing = currentPostsMap.get(p.id)!;
              if (p.likesCount !== undefined) existing.likesCount = p.likesCount;
              if (p.commentsCount !== undefined) existing.commentsCount = p.commentsCount;
              if (p.sharesCount !== undefined) existing.sharesCount = p.sharesCount;
            }
          }
        });

        // 3. Restore & merge reels
        const currentReelsMap = new Map((this.data.reels || []).map(r => [r.id, r]));
        (cloudData.reels || []).forEach((r: any) => {
          if (r && r.id) {
            if (!currentReelsMap.has(r.id)) {
              this.data.reels.push(r);
              updated = true;
            } else {
              const existing = currentReelsMap.get(r.id)!;
              if (r.likesCount !== undefined) existing.likesCount = r.likesCount;
              if (r.commentsCount !== undefined) existing.commentsCount = r.commentsCount;
              if (r.sharesCount !== undefined) existing.sharesCount = r.sharesCount;
            }
          }
        });

        // 4. Restore & merge stories
        if (Array.isArray(cloudData.stories)) {
          const currentStoriesMap = new Map((this.data.stories || []).map(s => [s.id, s]));
          cloudData.stories.forEach((s: any) => {
            if (s && s.id && !currentStoriesMap.has(s.id)) {
              this.data.stories.push(s);
              updated = true;
            }
          });
        }

        // 5. Restore & merge mediaRecords
        if (Array.isArray(cloudData.mediaRecords)) {
          if (!this.data.mediaRecords) this.data.mediaRecords = [];
          const currentMediaMap = new Map(this.data.mediaRecords.map(m => [m.storagePath || m.id, m]));
          cloudData.mediaRecords.forEach((m: any) => {
            const key = m.storagePath || m.id;
            if (key && !currentMediaMap.has(key)) {
              this.data.mediaRecords.push(m);
              updated = true;
            }
          });
        }

        // 6. Restore comments
        if (Array.isArray(cloudData.comments)) {
          if (!this.data.comments) this.data.comments = [];
          const existingCommentIds = new Set(this.data.comments.map((c: any) => c.id));
          cloudData.comments.forEach((c: any) => {
            if (c && c.id && !existingCommentIds.has(c.id)) {
              this.data.comments.push(c);
              updated = true;
            }
          });
        }

        // 7. Restore interaction states (likes, saves, follows, blocks)
        if (cloudData.likedPostIds) {
          this.data.likedPostIds = { ...(this.data.likedPostIds || {}), ...cloudData.likedPostIds };
          updated = true;
        }
        if (cloudData.likedReelIds) {
          this.data.likedReelIds = { ...(this.data.likedReelIds || {}), ...cloudData.likedReelIds };
          updated = true;
        }
        if (cloudData.likedCommentIds) {
          this.data.likedCommentIds = { ...(this.data.likedCommentIds || {}), ...cloudData.likedCommentIds };
          updated = true;
        }
        if (cloudData.savedPostIds) {
          this.data.savedPostIds = { ...(this.data.savedPostIds || {}), ...cloudData.savedPostIds };
          updated = true;
        }
        if (Array.isArray(cloudData.follows)) {
          if (!this.data.follows) this.data.follows = [];
          const existingFollows = new Set(this.data.follows.map((f: any) => f.id || `${f.followerId}_${f.followingId}`));
          cloudData.follows.forEach((f: any) => {
            const key = f.id || `${f.followerId}_${f.followingId}`;
            if (key && !existingFollows.has(key)) {
              this.data.follows.push(f);
              updated = true;
            }
          });
        }
        if (cloudData.blockedUsers) {
          this.data.blockedUsers = { ...(this.data.blockedUsers || {}), ...cloudData.blockedUsers };
          updated = true;
        }

        // 8. Restore conversations, messages, notifications
        if (Array.isArray(cloudData.conversations)) {
          const existingConvs = new Set((this.data.conversations || []).map(c => c.id));
          (cloudData.conversations || []).forEach((c: any) => {
            if (c && c.id && !existingConvs.has(c.id)) {
              this.data.conversations.push(c);
              updated = true;
            }
          });
        }
        if (Array.isArray(cloudData.messages)) {
          const existingMsgs = new Set((this.data.messages || []).map(m => m.id));
          (cloudData.messages || []).forEach((m: any) => {
            if (m && m.id && !existingMsgs.has(m.id)) {
              this.data.messages.push(m);
              updated = true;
            }
          });
        }
        if (Array.isArray(cloudData.notifications)) {
          const existingNotifs = new Set((this.data.notifications || []).map(n => n.id));
          (cloudData.notifications || []).forEach((n: any) => {
            if (n && n.id && !existingNotifs.has(n.id)) {
              this.data.notifications.push(n);
              updated = true;
            }
          });
        }

        // 9. Restore user credentials & settings
        if (cloudData.passwords) {
          this.data.passwords = { ...(this.data.passwords || {}), ...cloudData.passwords };
        }
        if (cloudData.usernames) {
          this.data.usernames = { ...(this.data.usernames || {}), ...cloudData.usernames };
        }
        if (cloudData.userSettings) {
          this.data.userSettings = { ...(this.data.userSettings || {}), ...cloudData.userSettings };
        }

        if (updated) {
          console.log('[Database] ☁️ Restored user records, posts, reels, stories, comments, and media references from Cloud Firestore.');
          this.saveData(this.data);
        }
      } else {
        // Push initial baseline state to Cloud Firestore if write quota is available
        if (!FirebaseSyncService.isWriteQuotaExhausted()) {
          FirebaseSyncService.syncDatabaseToCloud(this.data).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[Database] Cloud sync initialization error:', err);
    }
  }
}

export const db = new Database();
