import { User, SavedAccount } from '../types/index';
import { apiRequest, ApiError } from './api';

export type AuthState = 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';
export type AuthObserver = (user: User | null, state: AuthState) => void;

const TOKEN_KEY = 'ishara_token';
const USER_KEY = 'ishara_user';
const SAVED_ACCOUNTS_KEY = 'ishara_saved_accounts';

/**
 * IsharaAuth - Shared Singleton Auth Instance
 * Guarantees persistent session retention across deployments, browser restarts, and refreshes.
 * Implements observer pattern (onAuthStateChanged) and prevents unintentional auto-logout.
 */
class IsharaAuthService {
  private static instance: IsharaAuthService;
  private currentUser: User | null = null;
  private currentToken: string | null = null;
  private authState: AuthState = 'INITIALIZING';
  private observers: Set<AuthObserver> = new Set();
  private isInitialized = false;
  private retryTimer: any = null;

  private constructor() {
    this.hydrateFromStorage();
    this.setupNetworkListeners();
    // Start background verification without blocking UI
    this.initializeSession();
  }

  public static getInstance(): IsharaAuthService {
    if (!IsharaAuthService.instance) {
      IsharaAuthService.instance = new IsharaAuthService();
    }
    return IsharaAuthService.instance;
  }

  /**
   * Synchronously rehydrate user & token from browserLocalPersistence (localStorage)
   */
  private hydrateFromStorage(): void {
    try {
      this.currentToken = localStorage.getItem(TOKEN_KEY);
      const cachedUser = localStorage.getItem(USER_KEY);
      if (cachedUser) {
        this.currentUser = JSON.parse(cachedUser);
      }
      if (this.currentToken && this.currentUser) {
        // Optimistically set to AUTHENTICATED to avoid blank screens or redirects
        this.authState = 'AUTHENTICATED';
      } else if (!this.currentToken) {
        this.authState = 'UNAUTHENTICATED';
      } else {
        this.authState = 'INITIALIZING';
      }
    } catch (e) {
      console.warn('[IsharaAuth] Hydration warning:', e);
    }
  }

  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[IsharaAuth] Network online detected - re-verifying session');
        this.verifyWithServer(1);
      });
    }
  }

  /**
   * Asynchronous session initialization with graceful retry mechanism
   */
  public async initializeSession(): Promise<void> {
    if (!this.currentToken) {
      this.authState = 'UNAUTHENTICATED';
      this.isInitialized = true;
      this.notifyObservers();
      return;
    }

    await this.verifyWithServer(3);
    this.isInitialized = true;
    this.notifyObservers();
  }

  /**
   * Verifies the token with the server.
   * If server is offline, starting up (502/503), or network fails, the user remains LOGGED IN.
   */
  public async verifyWithServer(retriesLeft = 2): Promise<User | null> {
    if (!this.currentToken) {
      this.authState = 'UNAUTHENTICATED';
      this.currentUser = null;
      this.notifyObservers();
      return null;
    }

    try {
      const res = await apiRequest<{ user: User; token?: string }>('/auth/me');
      if (res && res.user) {
        this.currentUser = res.user;
        if (res.token) {
          this.currentToken = res.token;
          localStorage.setItem(TOKEN_KEY, res.token);
        }
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        this.saveToSavedAccounts(res.user, this.currentToken);
        this.authState = 'AUTHENTICATED';
        this.notifyObservers();
        return res.user;
      }
    } catch (err: any) {
      const status = err?.status;
      const code = err?.data?.code;

      console.warn(`[IsharaAuth] Session verification attempt notice (status: ${status}, retriesLeft: ${retriesLeft}):`, err?.message);

      // Definite ban: user account permanently banned by administration
      if (code === 'ACCOUNT_BANNED') {
        console.warn('[IsharaAuth] User account has been flagged as banned.');
        // Do not auto wipe token; let user see the ban screen or take explicit action
      }

      // If retryable (network error, cold start, 502/503/504 gateway timeout, or temporary server glitch)
      if (retriesLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return this.verifyWithServer(retriesLeft - 1);
      }

      // Permanent session persistence: ALWAYS retain the authenticated session across deployments & restarts.
      // Database/storage/network errors must NEVER automatically sign the user out.
      if (this.currentUser) {
        this.authState = 'AUTHENTICATED';
        this.notifyObservers();
        this.scheduleBackgroundRetry();
        return this.currentUser;
      }
    }

    return this.currentUser;
  }

  private scheduleBackgroundRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.verifyWithServer(1);
    }, 10000);
  }

  /**
   * Observer Registration (like Firebase onAuthStateChanged)
   */
  public onAuthStateChanged(observer: AuthObserver): () => void {
    this.observers.add(observer);
    // Immediately fire with current state
    try {
      observer(this.currentUser, this.authState);
    } catch (e) {
      console.error('[IsharaAuth] Error in auth observer callback:', e);
    }

    return () => {
      this.observers.delete(observer);
    };
  }

  private notifyObservers(): void {
    this.observers.forEach(observer => {
      try {
        observer(this.currentUser, this.authState);
      } catch (e) {
        console.error('[IsharaAuth] Error notifying observer:', e);
      }
    });
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public getToken(): string | null {
    return this.currentToken;
  }

  public getAuthState(): AuthState {
    return this.authState;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Updates state after successful login/registration
   */
  public handleAuthSuccess(user: User, token: string): void {
    this.currentUser = user;
    this.currentToken = token;
    this.authState = 'AUTHENTICATED';
    this.isInitialized = true;

    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      this.saveToSavedAccounts(user, token);
    } catch (e) {
      console.warn('[IsharaAuth] LocalStorage save warning:', e);
    }

    this.notifyObservers();
  }

  /**
   * Explicit User Sign Out ONLY.
   * Never called automatically or accidentally during deployment, refresh, or startup.
   */
  public signOut(): void {
    console.info('[IsharaAuth] Explicit user sign out initiated.');
    this.currentUser = null;
    this.currentToken = null;
    this.authState = 'UNAUTHENTICATED';

    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.warn('[IsharaAuth] Error clearing storage:', e);
    }

    this.notifyObservers();
  }

  /**
   * Saves authenticated account to multi-account storage
   */
  public saveToSavedAccounts(user: User, token: string): void {
    try {
      const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
      const list: SavedAccount[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(a => a.id !== user.id && a.username.toLowerCase() !== user.username.toLowerCase());
      filtered.unshift({
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl,
        role: user.role,
        token: token
      });
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered.slice(0, 10)));
    } catch (e) {
      console.warn('[IsharaAuth] Error saving account:', e);
    }
  }

  public getSavedAccounts(): SavedAccount[] {
    try {
      const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public removeSavedAccount(userId: string): void {
    try {
      const current = this.getSavedAccounts();
      const updated = current.filter(a => a.id !== userId);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[IsharaAuth] Error removing saved account:', e);
    }
  }
}

export const isharaAuth = IsharaAuthService.getInstance();
