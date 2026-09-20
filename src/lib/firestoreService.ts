import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  Unsubscribe, 
  serverTimestamp,
  FirestoreError
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Post, Reel, User, Message, Notification } from '../types/index';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export type FirestoreDiagnosticCategory = 
  | 'FIRESTORE_INIT'
  | 'FIRESTORE_READ'
  | 'FIRESTORE_WRITE'
  | 'FIRESTORE_REALTIME'
  | 'FIRESTORE_AUTH'
  | 'FIRESTORE_PERMISSION';

export interface FirestoreDiagnosticRecord {
  timestamp: string;
  category: FirestoreDiagnosticCategory;
  operation: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO';
  safeMessage: string;
  code?: string;
}

// In-memory ring buffer for diagnostics inspection (retains last 50 events)
const diagnosticsBuffer: FirestoreDiagnosticRecord[] = [];
const diagnosticsListeners = new Set<(record: FirestoreDiagnosticRecord) => void>();

/**
 * Sanitizes messages to guarantee zero exposure of API keys, tokens, or sensitive credentials.
 */
function sanitizeMessage(msg: string): string {
  if (!msg) return '';
  return msg
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/"apiKey":\s*"[^"]+"/g, '"apiKey":"[REDACTED]"')
    .replace(/"password":\s*"[^"]+"/g, '"password":"[REDACTED]"');
}

/**
 * Centralized safe diagnostics logger conforming to Section 3 requirements.
 */
export function logFirestoreDiagnostic(
  category: FirestoreDiagnosticCategory,
  operation: string,
  status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO',
  message: string,
  err?: any
): void {
  const code = err?.code || (err instanceof FirestoreError ? err.code : undefined);
  const cleanMsg = sanitizeMessage(message + (err?.message ? ` (${err.message})` : ''));
  
  const record: FirestoreDiagnosticRecord = {
    timestamp: new Date().toISOString(),
    category,
    operation,
    status,
    safeMessage: cleanMsg,
    code
  };

  if (diagnosticsBuffer.length >= 50) {
    diagnosticsBuffer.shift();
  }
  diagnosticsBuffer.push(record);

  // Safe developer logging
  if (status === 'ERROR') {
    console.error(`[${category}] [${operation}] ❌ ${cleanMsg}`);
  } else if (status === 'WARNING') {
    console.warn(`[${category}] [${operation}] ⚠️ ${cleanMsg}`);
  } else {
    console.info(`[${category}] [${operation}] ℹ️ ${cleanMsg}`);
  }

  diagnosticsListeners.forEach(listener => {
    try { listener(record); } catch {}
  });
}

export function subscribeFirestoreDiagnostics(listener: (record: FirestoreDiagnosticRecord) => void): () => void {
  diagnosticsListeners.add(listener);
  return () => diagnosticsListeners.delete(listener);
}

export function getRecentDiagnostics(): FirestoreDiagnosticRecord[] {
  return [...diagnosticsBuffer];
}

/**
 * Validates current authentication context for Firestore operations
 */
export function getAuthenticatedUserUid(): string | null {
  const current = auth.currentUser;
  if (current && current.uid) {
    return current.uid;
  }
  return null;
}

// ==========================================
// POSTS OPERATIONS
// ==========================================

export async function fetchPostsFromFirestore(maxCount = 30): Promise<Post[]> {
  try {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, limit(maxCount));
    
    // 3.5-second fallback timeout prevents blocking app boot if Firestore is operating in offline mode
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Firestore read timed out')), 3500)
    );

    const snap = await Promise.race([
      getDocs(q),
      timeoutPromise
    ]);

    const posts: Post[] = [];
    snap.forEach(d => {
      const data = d.data();
      const authorId = data.authorId || data.userId || 'unknown';
      posts.push({
        id: d.id,
        userId: authorId,
        author: data.author || {
          id: authorId,
          username: data.authorUsername || 'creator',
          displayName: data.authorDisplayName || 'Creator',
          avatarUrl: data.authorAvatarUrl || ''
        },
        caption: data.caption || '',
        mediaUrl: data.mediaUrl || '',
        mediaType: data.mediaType || 'image',
        likesCount: data.likesCount || 0,
        commentsCount: data.commentsCount || 0,
        sharesCount: data.sharesCount || 0,
        createdAt: data.createdAt || new Date().toISOString(),
        ...data
      } as unknown as Post);
    });

    logFirestoreDiagnostic('FIRESTORE_READ', 'fetchPosts', 'SUCCESS', `Successfully read ${posts.length} posts from Firestore.`);
    return posts;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, 'posts');
    }
    logFirestoreDiagnostic('FIRESTORE_READ', 'fetchPosts', 'INFO', 'Operating in offline/cached mode for posts', err);
    return [];
  }
}

export async function savePostToFirestore(post: Post): Promise<boolean> {
  try {
    const uid = getAuthenticatedUserUid();
    const docRef = doc(db, 'posts', post.id);
    
    // Non-destructive merge
    const authorId = post.userId || post.author?.id || 'unknown';
    await setDoc(docRef, {
      ...post,
      authorId: uid || authorId,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    logFirestoreDiagnostic('FIRESTORE_WRITE', 'savePost', 'SUCCESS', `Post ${post.id} saved to Cloud Firestore.`);
    return true;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}`);
    }
    logFirestoreDiagnostic('FIRESTORE_WRITE', 'savePost', 'WARNING', `Could not write post ${post.id} to Firestore`, err);
    return false;
  }
}

// ==========================================
// REELS OPERATIONS
// ==========================================

export async function fetchReelsFromFirestore(maxCount = 30): Promise<Reel[]> {
  try {
    const reelsRef = collection(db, 'reels');
    const q = query(reelsRef, limit(maxCount));

    // 3.5-second fallback timeout prevents blocking app boot if Firestore is operating in offline mode
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Firestore read timed out')), 3500)
    );

    const snap = await Promise.race([
      getDocs(q),
      timeoutPromise
    ]);

    const reels: Reel[] = [];
    snap.forEach(d => {
      const data = d.data();
      const authorId = data.authorId || data.userId || 'unknown';
      reels.push({
        id: d.id,
        userId: authorId,
        author: data.author || {
          id: authorId,
          username: data.authorUsername || 'creator',
          displayName: data.authorDisplayName || 'Creator',
          avatarUrl: data.authorAvatarUrl || ''
        },
        caption: data.caption || '',
        videoUrl: data.videoUrl || '',
        thumbnailUrl: data.thumbnailUrl || '',
        likesCount: data.likesCount || 0,
        commentsCount: data.commentsCount || 0,
        sharesCount: data.sharesCount || 0,
        viewsCount: data.viewsCount || 0,
        createdAt: data.createdAt || new Date().toISOString(),
        ...data
      } as unknown as Reel);
    });

    logFirestoreDiagnostic('FIRESTORE_READ', 'fetchReels', 'SUCCESS', `Successfully read ${reels.length} reels from Firestore.`);
    return reels;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.LIST, 'reels');
    }
    logFirestoreDiagnostic('FIRESTORE_READ', 'fetchReels', 'INFO', 'Operating in offline/cached mode for reels', err);
    return [];
  }
}

export async function saveReelToFirestore(reel: Reel): Promise<boolean> {
  try {
    const uid = getAuthenticatedUserUid();
    const docRef = doc(db, 'reels', reel.id);
    const authorId = reel.userId || reel.author?.id || 'unknown';

    await setDoc(docRef, {
      ...reel,
      authorId: uid || authorId,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    logFirestoreDiagnostic('FIRESTORE_WRITE', 'saveReel', 'SUCCESS', `Reel ${reel.id} saved to Cloud Firestore.`);
    return true;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `reels/${reel.id}`);
    }
    logFirestoreDiagnostic('FIRESTORE_WRITE', 'saveReel', 'WARNING', `Could not write reel ${reel.id} to Firestore`, err);
    return false;
  }
}

// ==========================================
// USER PROFILE OPERATIONS
// ==========================================

export async function fetchUserProfileFromFirestore(userId: string): Promise<User | null> {
  if (!userId) return null;
  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);

    if (snap.exists()) {
      const data = snap.data();
      logFirestoreDiagnostic('FIRESTORE_READ', 'fetchUserProfile', 'SUCCESS', `User profile loaded for ${userId}`);
      return { id: snap.id, ...data } as User;
    }
    return null;
  } catch (err: any) {
    logFirestoreDiagnostic('FIRESTORE_READ', 'fetchUserProfile', 'WARNING', `Error reading profile for ${userId}`, err);
    return null;
  }
}

export async function updateUserProfileInFirestore(userId: string, data: Partial<User>): Promise<boolean> {
  if (!userId) return false;
  try {
    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      ...data,
      id: userId,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    logFirestoreDiagnostic('FIRESTORE_WRITE', 'updateUserProfile', 'SUCCESS', `User profile updated for ${userId}`);
    return true;
  } catch (err: any) {
    logFirestoreDiagnostic('FIRESTORE_WRITE', 'updateUserProfile', 'WARNING', `Error updating profile for ${userId}`, err);
    return false;
  }
}

// ==========================================
// REALTIME MESSAGES & CONVERSATIONS
// ==========================================

/**
 * Subscribes to realtime messages in a conversation using Firestore onSnapshot
 */
export function subscribeToRealtimeMessages(
  conversationId: string,
  onMessageReceived: (message: Message) => void,
  onError?: (err: any) => void
): Unsubscribe {
  // Only attach real-time Firestore listeners when user is authenticated to conform to rules & avoid unauthenticated drops
  if (!auth.currentUser) {
    return () => {};
  }

  logFirestoreDiagnostic('FIRESTORE_REALTIME', 'subscribeToMessages', 'INFO', `Attaching listener to conversation ${conversationId}`);

  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            const message: Message = {
              id: change.doc.id,
              conversationId,
              senderId: data.senderId,
              text: data.text || '',
              mediaUrl: data.mediaUrl,
              mediaType: data.mediaType,
              createdAt: data.createdAt || new Date().toISOString(),
              isRead: !!data.isRead,
              seenAt: data.seenAt,
              ...data
            } as Message;
            onMessageReceived(message);
          }
        });
      },
      (error) => {
        if (error?.code === 'permission-denied') {
          handleFirestoreError(error, OperationType.GET, `conversations/${conversationId}/messages`);
        }
        logFirestoreDiagnostic('FIRESTORE_REALTIME', 'messagesListener', 'WARNING', `Listener notice for ${conversationId}`, error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err) {
    logFirestoreDiagnostic('FIRESTORE_REALTIME', 'subscribeToMessages', 'ERROR', `Failed to attach listener`, err);
    return () => {};
  }
}

/**
 * Sends a message into Firestore
 */
export async function sendMessageToFirestore(
  conversationId: string, 
  message: Message
): Promise<boolean> {
  try {
    const msgRef = doc(db, 'conversations', conversationId, 'messages', message.id);
    await setDoc(msgRef, {
      ...message,
      conversationId,
      createdAt: message.createdAt || new Date().toISOString()
    }, { merge: true });

    // Also update parent conversation last message
    const convRef = doc(db, 'conversations', conversationId);
    await setDoc(convRef, {
      id: conversationId,
      lastMessage: message,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    logFirestoreDiagnostic('FIRESTORE_WRITE', 'sendMessage', 'SUCCESS', `Message ${message.id} written to Firestore.`);
    return true;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `conversations/${conversationId}/messages/${message.id}`);
    }
    logFirestoreDiagnostic('FIRESTORE_WRITE', 'sendMessage', 'WARNING', `Could not write message ${message.id} to Firestore`, err);
    return false;
  }
}

/**
 * Updates message read receipt in Firestore
 */
export async function markMessageReadInFirestore(
  conversationId: string, 
  messageId: string, 
  userId: string
): Promise<boolean> {
  try {
    const msgRef = doc(db, 'conversations', conversationId, 'messages', messageId);
    await updateDoc(msgRef, {
      isRead: true,
      seenAt: new Date().toISOString(),
      readBy: userId
    });
    logFirestoreDiagnostic('FIRESTORE_WRITE', 'markMessageRead', 'SUCCESS', `Message ${messageId} marked read in Firestore.`);
    return true;
  } catch (err: any) {
    logFirestoreDiagnostic('FIRESTORE_WRITE', 'markMessageRead', 'WARNING', `Could not mark message read in Firestore`, err);
    return false;
  }
}

// ==========================================
// NOTIFICATIONS
// ==========================================

export function subscribeToRealtimeNotifications(
  userId: string,
  onNotificationReceived: (notification: Notification) => void,
  onError?: (err: any) => void
): Unsubscribe {
  if (!userId || !auth.currentUser) return () => {};

  try {
    const notifRef = collection(db, 'notifications');
    const q = query(notifRef, where('userId', '==', userId), limit(30));

    return onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            onNotificationReceived({
              id: change.doc.id,
              ...data
            } as Notification);
          }
        });
      },
      (error) => {
        logFirestoreDiagnostic('FIRESTORE_REALTIME', 'notificationsListener', 'WARNING', `Notifications listener error`, error);
        if (onError) onError(error);
      }
    );
  } catch (err) {
    logFirestoreDiagnostic('FIRESTORE_REALTIME', 'subscribeToNotifications', 'ERROR', `Failed to attach notifications listener`, err);
    return () => {};
  }
}
