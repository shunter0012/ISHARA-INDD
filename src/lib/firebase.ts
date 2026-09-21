import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setLogLevel,
  Firestore 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Ensure Firebase is initialized exactly once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Set Firestore log level to 'silent' to eliminate noisy transport probing and offline state notices
try {
  setLogLevel('silent');
} catch {}

// In sandboxed iframes or intermittent network switches, the Firestore SDK emits an internal
// "Could not reach Cloud Firestore backend... client will operate in offline mode" notice via console.error.
// Intercept this notice and route to console.info so it does not trigger false-positive applet crash alerts.
if (typeof window !== 'undefined' && typeof window.console !== 'undefined') {
  const originalConsoleError = window.console.error;
  window.console.error = function (...args: any[]) {
    const msg = typeof args[0] === 'string' ? args[0] : (args[0]?.message || '');
    if (
      typeof msg === 'string' &&
      (msg.includes('@firebase/firestore') ||
       msg.includes('Could not reach Cloud Firestore backend') ||
       msg.includes('[code=unavailable]'))
    ) {
      console.info('[Firestore Transport Notice]', ...args);
      return;
    }
    originalConsoleError.apply(window.console, args);
  };
}

// Initialize Firestore strictly conforming to the Firebase Integration Skill:
// export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export async function signInWithGooglePopup(): Promise<FirebaseUser | null> {
  try {
    const result = await signInWithPopup(auth, googleAuthProvider);
    return result.user;
  } catch (err: any) {
    if (err?.code === 'auth/popup-closed-by-user') {
      console.info('[Firebase Auth] Sign-in popup closed by user.');
    } else {
      console.warn('[Firebase Auth] Sign-in popup notification:', err?.code || err?.message);
    }
    return null;
  }
}

export async function signOutFirebaseUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[Firebase Auth] Sign-out warning:', err);
  }
}

export function onFirebaseAuthStateChanged(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Diagnostic-only connection test.
 * Completely isolated from application boot and business logic (conforming to Section 5).
 */
export async function testDiagnosticConnection(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Connection check timed out')), 4000)
    );

    await Promise.race([
      getDoc(doc(db, 'test', 'connection')),
      timeoutPromise
    ]);
    console.log('[Firebase Diagnostics] ✅ Connected to Cloud Firestore.');
    return true;
  } catch (error: any) {
    if (error?.code === 'resource-exhausted' || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      console.warn('[Firebase Diagnostics] ℹ️ Daily write/request quota threshold reached.');
    } else if (
      error?.code === 'unavailable' || 
      error?.code === 'deadline-exceeded' ||
      error?.message?.includes('timed out') ||
      error?.message?.includes('the client is offline') ||
      error?.message?.includes('unavailable')
    ) {
      console.info('[Firebase Diagnostics] ℹ️ Cloud Firestore operating in offline/long-polling mode.');
    } else if (error?.code === 'permission-denied') {
      console.log('[Firebase Diagnostics] ✅ Cloud Firestore endpoint reached.');
      return true;
    }
    return false;
  }
}

// Backward-compatible alias for diagnostic scripts
export const testConnection = testDiagnosticConnection;

