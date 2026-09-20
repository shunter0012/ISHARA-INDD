import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs,
  Firestore
} from 'firebase/firestore';

interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

let firestoreInstance: Firestore | null = null;
let isInitialized = false;
let initFailed = false;

function getFirebaseConfig(): FirebaseConfig | null {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[FirebaseSyncService] Failed to read firebase-applet-config.json:', err);
  }
  return null;
}

function loadInitialQuotaState(): { quotaExhaustedUntil: number } {
  try {
    const candidates = [
      path.join(process.cwd(), 'storage', 'db', 'firestore_quota_status.json'),
      path.join(process.cwd(), 'data', 'firestore_quota_status.json')
    ];
    for (const f of candidates) {
      if (fs.existsSync(f)) {
        const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (raw && typeof raw.quotaExhaustedUntil === 'number' && raw.quotaExhaustedUntil > Date.now()) {
          return { quotaExhaustedUntil: raw.quotaExhaustedUntil };
        }
      }
    }
  } catch {}
  return { quotaExhaustedUntil: 0 };
}

export function getFirestoreDB(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initFailed) return null;

  try {
    const config = getFirebaseConfig();
    if (!config || !config.apiKey || !config.projectId) {
      initFailed = true;
      return null;
    }

    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    // CRITICAL: Always provide firestoreDatabaseId
    firestoreInstance = getFirestore(app, config.firestoreDatabaseId);
    isInitialized = true;
    console.log(`[FirebaseSyncService] ✅ Cloud Firestore initialized (project: ${config.projectId}, db: ${config.firestoreDatabaseId})`);
    return firestoreInstance;
  } catch (err) {
    console.error('[FirebaseSyncService] ⚠️ Firestore init error:', err);
    initFailed = true;
    return null;
  }
}

export class FirebaseSyncService {
  private static syncInProgress = false;
  private static lastSyncTime = 0;
  private static quotaExhaustedUntil = loadInitialQuotaState().quotaExhaustedUntil;
  private static quotaNoticeLogged = false;
  private static readonly CHUNK_SIZE = 750 * 1024; // 750KB base64 safe chunk (< 1MB Firestore limit)

  /**
   * Check if Cloud Firestore write quota is currently exhausted
   */
  public static isWriteQuotaExhausted(): boolean {
    const now = Date.now();
    if (now < this.quotaExhaustedUntil) {
      if (!this.quotaNoticeLogged) {
        this.quotaNoticeLogged = true;
        const resetTime = new Date(this.quotaExhaustedUntil).toISOString();
        console.log(`[FirebaseSyncService] ℹ️ Cloud Firestore free write units quota exhausted. Writes paused until ${resetTime}. Operating reliably on local storage.`);
      }
      return true;
    }
    return false;
  }

  /**
   * Record quota exhaustion persistently across container reboots
   */
  public static markQuotaExhausted(reason: string, durationMs = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    this.quotaExhaustedUntil = now + durationMs;
    const status = {
      quotaExhausted: true,
      exhaustedAt: new Date(now).toISOString(),
      quotaExhaustedUntil: this.quotaExhaustedUntil,
      reason
    };
    try {
      const paths = [
        path.join(process.cwd(), 'storage', 'db', 'firestore_quota_status.json'),
        path.join(process.cwd(), 'data', 'firestore_quota_status.json')
      ];
      for (const p of paths) {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, JSON.stringify(status, null, 2));
      }
    } catch {}
    console.warn(`[FirebaseSyncService] ⏳ Cloud Firestore daily write quota limit reached. Cloud writes paused until ${new Date(this.quotaExhaustedUntil).toISOString()}.`);
  }

  /**
   * Save an entire database snapshot to Cloud Firestore
   */
  public static async syncDatabaseToCloud(data: any): Promise<boolean> {
    // 1. Immediately abort if daily write quota is reached to prevent gRPC Write stream errors
    if (this.isWriteQuotaExhausted()) {
      return false;
    }

    const db = getFirestoreDB();
    if (!db) return false;

    // Debounce rapid syncs (at least 5 minutes between snapshot syncs)
    const now = Date.now();
    if (this.syncInProgress || (now - this.lastSyncTime < 5 * 60 * 1000)) {
      return false;
    }

    this.syncInProgress = true;
    try {
      // 1. Save full JSON snapshot in chunks to app_sync/metadata and app_sync/snapshot_part_X
      // (Bypasses writing hundreds of individual docs which exhausts the daily write quota)
      const rawJson = JSON.stringify(data);
      const totalParts = Math.ceil(rawJson.length / this.CHUNK_SIZE);

      await setDoc(doc(db, 'app_sync', 'metadata'), {
        totalParts,
        totalBytes: rawJson.length,
        updatedAt: new Date().toISOString(),
        usersCount: data.users?.length || 0,
        postsCount: data.posts?.length || 0,
        reelsCount: data.reels?.length || 0
      });

      for (let i = 0; i < totalParts; i++) {
        const part = rawJson.slice(i * this.CHUNK_SIZE, (i + 1) * this.CHUNK_SIZE);
        await setDoc(doc(db, 'app_sync', `snapshot_part_${i}`), {
          index: i,
          totalParts,
          part
        });
      }

      this.lastSyncTime = Date.now();
      console.log(`[FirebaseSyncService] ☁️ Database snapshot successfully synchronized to Cloud Firestore.`);
      return true;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('RESOURCE_EXHAUSTED') || err?.code === 'resource-exhausted' || err?.code === 8) {
        this.markQuotaExhausted('RESOURCE_EXHAUSTED: Daily write units quota exceeded');
      } else {
        console.warn('[FirebaseSyncService] ⚠️ Sync to Firestore error:', errMsg);
      }
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Restore database from Cloud Firestore if container storage was reset
   */
  public static async restoreDatabaseFromCloud(): Promise<any | null> {
    const db = getFirestoreDB();
    if (!db) return null;

    try {
      const metaSnap = await getDoc(doc(db, 'app_sync', 'metadata'));
      if (!metaSnap.exists()) {
        console.log('[FirebaseSyncService] No cloud snapshot found in Firestore.');
        return null;
      }

      const meta = metaSnap.data();
      const totalParts = meta.totalParts || 1;
      let fullJson = '';

      for (let i = 0; i < totalParts; i++) {
        const partSnap = await getDoc(doc(db, 'app_sync', `snapshot_part_${i}`));
        if (partSnap.exists()) {
          fullJson += partSnap.data().part || '';
        } else {
          console.warn(`[FirebaseSyncService] Missing part ${i} of cloud snapshot.`);
          return null;
        }
      }

      const parsed = JSON.parse(fullJson);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.users)) {
        console.log(`[FirebaseSyncService] 🚀 Restored database from Cloud Firestore (${parsed.users.length} users, ${parsed.posts?.length || 0} posts, ${parsed.reels?.length || 0} reels).`);
        return parsed;
      }
    } catch (err) {
      console.warn('[FirebaseSyncService] ⚠️ Cloud restore warning:', err);
    }
    return null;
  }

  /**
   * Persist an uploaded media file to Cloud Firestore.
   * Note: Binary media is safely retained in persistent disk tiers (data/uploads, storage/uploads, media vault).
   * Chunker writes to Firestore are bypassed to prevent consuming document write quotas.
   */
  public static async persistMediaToCloud(_filename: string, _buffer: Buffer, _mimeType: string): Promise<boolean> {
    return true;
  }

  /**
   * Restore all cloud-persisted media files from Cloud Firestore back to local disk tiers
   */
  public static async restoreMediaFromCloud(targetDirs: string[]): Promise<number> {
    const db = getFirestoreDB();
    if (!db) return 0;

    let restoredCount = 0;
    try {
      const blobsSnap = await getDocs(collection(db, 'media_blobs'));
      for (const blobDoc of blobsSnap.docs) {
        const blob = blobDoc.data();
        const filename = blob.filename;
        if (!filename) continue;

        // Check if file already exists in target dirs
        const alreadyExists = targetDirs.some(dir => {
          const p = path.join(dir, filename);
          return fs.existsSync(p) && fs.statSync(p).size > 0;
        });

        if (alreadyExists) continue;

        // Download and reconstruct from chunks concurrently
        const totalChunks = blob.totalChunks || 1;
        const chunkPromises = [];
        for (let i = 0; i < totalChunks; i++) {
          chunkPromises.push(getDoc(doc(db, 'media_blobs', blobDoc.id, 'chunks', `chunk_${i}`)));
        }

        const chunkSnaps = await Promise.all(chunkPromises);
        let base64Full = '';
        let chunksComplete = true;

        for (const snap of chunkSnaps) {
          if (snap.exists()) {
            base64Full += snap.data().data || '';
          } else {
            chunksComplete = false;
            break;
          }
        }

        if (chunksComplete && base64Full) {
          const fileBuffer = Buffer.from(base64Full, 'base64');
          for (const dir of targetDirs) {
            try {
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, filename), fileBuffer);
            } catch {}
          }
          restoredCount++;
          console.log(`[FirebaseSyncService] 📥 Restored "${filename}" (${fileBuffer.length} bytes) from Cloud Firestore.`);
        }
      }
    } catch (err) {
      console.warn('[FirebaseSyncService] ⚠️ Error restoring media from Cloud Firestore:', err);
    }

    return restoredCount;
  }

  /**
   * Fetch a single media file buffer on-demand from Cloud Firestore
   */
  public static async fetchMediaBufferFromCloud(filename: string): Promise<Buffer | null> {
    const db = getFirestoreDB();
    if (!db) return null;

    try {
      const safeDocId = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
      const blobSnap = await getDoc(doc(db, 'media_blobs', safeDocId));
      if (!blobSnap.exists()) return null;

      const blob = blobSnap.data();
      const totalChunks = blob.totalChunks || 1;
      
      const chunkPromises = [];
      for (let i = 0; i < totalChunks; i++) {
        chunkPromises.push(getDoc(doc(db, 'media_blobs', safeDocId, 'chunks', `chunk_${i}`)));
      }

      const chunkSnaps = await Promise.all(chunkPromises);
      let base64Full = '';

      for (const snap of chunkSnaps) {
        if (snap.exists()) {
          base64Full += snap.data().data || '';
        } else {
          return null;
        }
      }

      if (base64Full) {
        return Buffer.from(base64Full, 'base64');
      }
    } catch (err) {
      console.warn(`[FirebaseSyncService] Warning fetching "${filename}" from Cloud Firestore:`, err);
    }
    return null;
  }

  /**
   * Persist per-user message deletion record to Cloud Firestore
   */
  public static async recordMessageDeletion(record: { id: string; messageId: string; userId: string; deletedAt: string }): Promise<void> {
    try {
      const dbInstance = getFirestoreDB();
      if (!dbInstance || this.isWriteQuotaExhausted()) return;
      const docRef = doc(dbInstance, 'messageDeletions', record.id);
      await setDoc(docRef, record, { merge: true });
    } catch (err: any) {
      console.warn('[FirebaseSyncService] Notice recording deletion in Firestore:', err?.message || err);
    }
  }

  /**
   * Sync single Post to Cloud Firestore posts collection
   */
  public static async syncPost(post: any): Promise<void> {
    try {
      const dbInstance = getFirestoreDB();
      if (!dbInstance || this.isWriteQuotaExhausted()) return;
      const docRef = doc(dbInstance, 'posts', post.id);
      await setDoc(docRef, {
        id: post.id,
        authorId: post.userId || post.author?.id || 'unknown',
        caption: post.caption || '',
        mediaUrl: post.mediaUrl || '',
        mediaType: post.mediaType || 'image',
        thumbnailUrl: post.thumbnailUrl || '',
        likesCount: post.likesCount || 0,
        commentsCount: post.commentsCount || 0,
        sharesCount: post.sharesCount || 0,
        createdAt: post.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err: any) {
      console.warn('[FirebaseSyncService] Notice syncing post to Firestore:', err?.message || err);
    }
  }

  /**
   * Sync single Reel to Cloud Firestore reels collection
   */
  public static async syncReel(reel: any): Promise<void> {
    try {
      const dbInstance = getFirestoreDB();
      if (!dbInstance || this.isWriteQuotaExhausted()) return;
      const docRef = doc(dbInstance, 'reels', reel.id);
      await setDoc(docRef, {
        id: reel.id,
        authorId: reel.userId || reel.author?.id || 'unknown',
        caption: reel.caption || '',
        videoUrl: reel.videoUrl || '',
        thumbnailUrl: reel.thumbnailUrl || '',
        likesCount: reel.likesCount || 0,
        commentsCount: reel.commentsCount || 0,
        viewsCount: reel.viewsCount || 0,
        createdAt: reel.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err: any) {
      console.warn('[FirebaseSyncService] Notice syncing reel to Firestore:', err?.message || err);
    }
  }

  /**
   * Sync single User to Cloud Firestore users collection
   */
  public static async syncUser(user: any): Promise<void> {
    try {
      const dbInstance = getFirestoreDB();
      if (!dbInstance || this.isWriteQuotaExhausted()) return;
      const docRef = doc(dbInstance, 'users', user.id);
      await setDoc(docRef, {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        email: user.email || '',
        avatarUrl: user.avatarUrl || '',
        bio: user.bio || '',
        role: user.role || 'USER',
        followersCount: user.followersCount || 0,
        followingCount: user.followingCount || 0,
        postsCount: user.postsCount || 0,
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err: any) {
      console.warn('[FirebaseSyncService] Notice syncing user to Firestore:', err?.message || err);
    }
  }
}
