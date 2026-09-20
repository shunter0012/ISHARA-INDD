import crypto from 'crypto';

/**
 * Hash a password using PBKDF2 with a cryptographic salt.
 * Output format: pbkdf2$<salt>$<hash>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

/**
 * Verify a password against a stored hash or legacy plaintext string.
 * Returns whether password matches, and whether the stored record needs re-hashing.
 */
export function verifyPassword(password: string, storedHashOrPlain: string): { isValid: boolean; needsRehash: boolean } {
  if (!password || !storedHashOrPlain) {
    return { isValid: false, needsRehash: false };
  }

  // Check if stored format is PBKDF2 hash
  if (storedHashOrPlain.startsWith('pbkdf2$')) {
    const parts = storedHashOrPlain.split('$');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = parts[2];
      const actualHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
      try {
        const expectedBuf = Buffer.from(expectedHash, 'hex');
        const actualBuf = Buffer.from(actualHash, 'hex');
        if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
          return { isValid: true, needsRehash: false };
        }
      } catch {
        return { isValid: false, needsRehash: false };
      }
    }
  }

  // Backward compatibility: compare legacy plaintext (constant-time buffer compare)
  const passwordBuf = Buffer.from(password, 'utf-8');
  const storedBuf = Buffer.from(storedHashOrPlain, 'utf-8');
  if (passwordBuf.length === storedBuf.length && crypto.timingSafeEqual(passwordBuf, storedBuf)) {
    // Valid plaintext match -> signal that it needs to be securely re-hashed
    return { isValid: true, needsRehash: true };
  }

  return { isValid: false, needsRehash: false };
}

export const OWNER_ADMIN_UID = 'user-shuv';
export const OWNER_ADMIN_USERNAME = 'shuv';

export const RESERVED_USERNAMES = [
  'shuv',
  'admin',
  'administrator',
  'owner',
  'ishara',
  'root',
  'system',
  'support',
  'mod',
  'moderator'
];

/**
 * Universally normalizes a username:
 * - Trims whitespace
 * - Converts to lower-case
 * - Strips leading '@' characters
 */
export function normalizeUsername(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.trim().toLowerCase().replace(/^@+/, '');
}

/**
 * Checks if a username is reserved by the system or platform owner
 */
export function isReservedUsername(username: string): boolean {
  const norm = normalizeUsername(username);
  return RESERVED_USERNAMES.includes(norm);
}

/**
 * Validates username syntax and reserved list
 */
export function validateUsernameFormat(username: string): { isValid: boolean; error?: string } {
  const norm = normalizeUsername(username);
  if (!norm || norm.length < 2) {
    return { isValid: false, error: 'Username must be at least 2 characters long.' };
  }
  if (norm.length > 30) {
    return { isValid: false, error: 'Username cannot exceed 30 characters.' };
  }
  if (!/^[a-z0-9_.]+$/.test(norm)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, underscores, and periods.' };
  }
  if (isReservedUsername(norm)) {
    return { isValid: false, error: `The username '${username}' is reserved and cannot be registered.` };
  }
  return { isValid: true };
}
