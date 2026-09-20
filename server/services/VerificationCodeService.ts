/**
 * VerificationCodeService
 * Manages randomized on-page visual verification codes (CAPTCHA)
 * to verify human users during account registration and password recovery.
 */

interface VerificationCodeEntry {
  id: string;
  code: string;
  createdAt: number;
  expiresAt: number;
}

// Allowed character set (excluding visually ambiguous glyphs like 0, O, 1, I)
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export class VerificationCodeService {
  private static codes = new Map<string, VerificationCodeEntry>();

  /**
   * Generates a fresh randomized verification code
   */
  public static generateCode(): { id: string; code: string } {
    this.cleanExpired();

    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      const idx = Math.floor(Math.random() * CODE_CHARS.length);
      code += CODE_CHARS[idx];
    }

    const id = `vc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();

    this.codes.set(id, {
      id,
      code,
      createdAt: now,
      expiresAt: now + EXPIRY_MS
    });

    return { id, code };
  }

  /**
   * Verifies the entered code against the stored randomized code.
   * Single-use: consumes the code on successful verification.
   */
  public static verifyCode(id?: string, enteredCode?: string): boolean {
    if (!id || !enteredCode) return false;
    this.cleanExpired();

    const entry = this.codes.get(id);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.codes.delete(id);
      return false;
    }

    const normalizedEntered = enteredCode.trim().toUpperCase();
    const normalizedExpected = entry.code.trim().toUpperCase();

    const isMatch = normalizedEntered === normalizedExpected;
    if (isMatch) {
      // Consume to prevent replay attacks
      this.codes.delete(id);
    }

    return isMatch;
  }

  /**
   * Cleanup expired codes to prevent memory leak
   */
  private static cleanExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.codes.entries()) {
      if (now > entry.expiresAt) {
        this.codes.delete(id);
      }
    }
  }
}
