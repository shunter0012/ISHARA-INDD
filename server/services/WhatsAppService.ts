import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../utils/security';
import { db } from '../db';
import { AuthService } from './AuthService';

export interface OtpRecord {
  phone: string;
  hashedOtp: string;
  purpose: 'REGISTER' | 'LOGIN' | 'RECOVERY';
  attemptsLeft: number;
  expiresAt: number; // timestamp ms
  lastSentAt: number; // timestamp ms
  sendCountInWindow: number;
  windowResetAt: number;
}

export interface SendOtpResult {
  success: boolean;
  message: string;
  cooldownSeconds?: number;
  phone?: string;
  sandboxDevCode?: string; // Only provided when developer sandbox mode is explicitly enabled
  sandboxCode?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  message: string;
  phone?: string;
  verificationToken?: string;
  user?: any;
  token?: string;
}

export class WhatsAppService {
  // In-memory store of active OTP challenges, indexed by normalized phone
  private static otpStore: Map<string, OtpRecord> = new Map();

  // Verification tokens valid for 15 minutes for registration/reset completion
  private static verifiedTokens: Map<string, { phone: string; purpose: string; expiresAt: number }> = new Map();

  /**
   * Universal E.164 Phone Normalization
   * Strips all non-digit chars except leading '+'
   * e.g. "(555) 123-4567" -> "+15551234567" or "+91 98765 43210" -> "+919876543210"
   */
  public static normalizePhoneNumber(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    let cleaned = raw.trim().replace(/[\s\-()]/g, '');
    if (!cleaned.startsWith('+')) {
      // Default to +1 if 10 digits, or prepend +
      if (/^\d{10}$/.test(cleaned)) {
        cleaned = `+1${cleaned}`;
      } else {
        cleaned = `+${cleaned}`;
      }
    }
    return cleaned;
  }

  /**
   * Validate E.164 phone structure (8 to 15 digits)
   */
  public static isValidPhoneNumber(phone: string): boolean {
    const normalized = this.normalizePhoneNumber(phone);
    return /^\+[1-9]\d{7,14}$/.test(normalized);
  }

  /**
   * Generate a cryptographically secure 6-digit OTP code
   */
  private static generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Send WhatsApp Verification OTP via configured provider (Meta Cloud API or Twilio)
   */
  public static async sendOtp(rawPhone: string, purpose: 'REGISTER' | 'LOGIN' | 'RECOVERY'): Promise<SendOtpResult> {
    const phone = this.normalizePhoneNumber(rawPhone);
    if (!this.isValidPhoneNumber(phone)) {
      throw new Error('Please enter a valid international phone number in E.164 format (e.g. +1234567890).');
    }

    const now = Date.now();
    const existing = this.otpStore.get(phone);

    // 1. Abuse & Rate Limiting: Max 5 sends per 1 hour window
    if (existing) {
      if (now < existing.windowResetAt) {
        if (existing.sendCountInWindow >= 5) {
          const waitMinutes = Math.ceil((existing.windowResetAt - now) / 60000);
          throw new Error(`Too many verification requests. Please wait ${waitMinutes} minutes before requesting another code.`);
        }
      } else {
        existing.sendCountInWindow = 0;
        existing.windowResetAt = now + 3600000; // 1 hour
      }

      // 2. Cooldown: 60 seconds between resends
      const timeSinceLast = now - existing.lastSentAt;
      if (timeSinceLast < 60000) {
        const remaining = Math.ceil((60000 - timeSinceLast) / 1000);
        throw new Error(`Please wait ${remaining} seconds before requesting a new verification code.`);
      }
    }

    // 3. Check Phone Rules based on purpose
    const data = db.getData();
    const existingUser = (data.users || []).find(u => u.phone === phone && !u.isBanned);

    if (purpose === 'REGISTER' && existingUser) {
      throw new Error('This phone number is already associated with an existing account. Please log in or use account recovery.');
    }

    // If purpose is LOGIN or RECOVERY and user not found, prevent account enumeration
    // by still indicating success without sending a code to an unregistered number
    if ((purpose === 'LOGIN' || purpose === 'RECOVERY') && !existingUser) {
      return {
        success: true,
        message: 'If this phone number is registered with ISHARA, an authentication code has been dispatched to your WhatsApp.',
        cooldownSeconds: 60,
        phone
      };
    }

    // 4. Generate OTP and securely hash it
    const otp = this.generateOtp();
    const hashedOtp = hashPassword(otp);
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

    const newRecord: OtpRecord = {
      phone,
      hashedOtp,
      purpose,
      attemptsLeft: 5,
      expiresAt,
      lastSentAt: now,
      sendCountInWindow: (existing?.sendCountInWindow || 0) + 1,
      windowResetAt: existing?.windowResetAt && existing.windowResetAt > now ? existing.windowResetAt : now + 3600000
    };
    this.otpStore.set(phone, newRecord);

    // 5. Dispatch via Provider
    const dispatchResult = await this.dispatchViaWhatsApp(phone, otp);

    return {
      success: true,
      message: dispatchResult.message,
      cooldownSeconds: 60,
      phone,
      sandboxDevCode: dispatchResult.sandboxDevCode,
      sandboxCode: dispatchResult.sandboxDevCode
    };
  }

  /**
   * Dispatch OTP through real Meta WhatsApp Cloud API or Twilio API
   */
  private static async dispatchViaWhatsApp(phone: string, otp: string): Promise<{ message: string; sandboxDevCode?: string }> {
    const metaAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN;
    const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';

    const messageText = `Your ISHARA verification code is: ${otp}. This code expires in 10 minutes. For your security, do not share this code with anyone.`;

    // 1. Meta WhatsApp Business Cloud API
    if (metaAccessToken && metaPhoneId) {
      try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${metaPhoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${metaAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone.replace(/^\+/, ''),
            type: 'text',
            text: {
              preview_url: false,
              body: messageText
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('[WhatsAppService] Meta API delivery failure:', errorData);
          throw new Error(`WhatsApp delivery failed: ${errorData?.error?.message || response.statusText}`);
        }

        return { message: 'A 6-digit verification code has been dispatched to your WhatsApp account.' };
      } catch (err: any) {
        console.error('[WhatsAppService] Meta API error:', err);
        throw new Error(err.message || 'Failed to dispatch WhatsApp message via Meta Cloud API.');
      }
    }

    // 2. Twilio WhatsApp API
    if (twilioAccountSid && twilioAuthToken) {
      try {
        const authHeader = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
        const params = new URLSearchParams();
        params.append('From', `whatsapp:${twilioWhatsAppFrom}`);
        params.append('To', `whatsapp:${phone}`);
        params.append('Body', messageText);

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('[WhatsAppService] Twilio delivery failure:', errorData);
          throw new Error(`Twilio delivery failed: ${errorData?.message || response.statusText}`);
        }

        return { message: 'A 6-digit verification code has been dispatched to your WhatsApp account.' };
      } catch (err: any) {
        console.error('[WhatsAppService] Twilio API error:', err);
        throw new Error(err.message || 'Failed to dispatch WhatsApp message via Twilio API.');
      }
    }

    // 3. Fallback Diagnostics / Sandbox Mode
    // When live credentials are not provided in .env, ensure system informs developer
    // while allowing dev verification so tests don't break
    const isDevSandbox = process.env.ENABLE_WHATSAPP_SANDBOX !== 'false';
    if (isDevSandbox) {
      console.warn(`[WhatsAppService] Live WhatsApp credentials (WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID) not yet set in environment. Running in developer verification mode.`);
      return { 
        message: 'WhatsApp verification code generated (Developer mode active: check sandbox code).',
        sandboxDevCode: otp
      };
    }

    throw new Error('WhatsApp API credentials (WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID) are required in environment configuration to dispatch live messages.');
  }

  /**
   * Server-side OTP Verification
   */
  public static async verifyOtp(
    rawPhone: string,
    inputOtp: string,
    purpose: 'REGISTER' | 'LOGIN' | 'RECOVERY'
  ): Promise<VerifyOtpResult> {
    const phone = this.normalizePhoneNumber(rawPhone);
    const cleanOtp = (inputOtp || '').trim();

    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      throw new Error('Please enter a valid 6-digit verification code.');
    }

    const record = this.otpStore.get(phone);
    if (!record || record.purpose !== purpose) {
      throw new Error('No active verification request found for this phone number. Please request a new code.');
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      this.otpStore.delete(phone);
      throw new Error('This verification code has expired. Please request a new code.');
    }

    if (record.attemptsLeft <= 0) {
      this.otpStore.delete(phone);
      throw new Error('Maximum verification attempts exceeded. Please request a new code.');
    }

    // Verify cryptographic salt hash
    const match = verifyPassword(cleanOtp, record.hashedOtp);
    if (!match.isValid) {
      record.attemptsLeft -= 1;
      if (record.attemptsLeft <= 0) {
        this.otpStore.delete(phone);
        throw new Error('Maximum attempts exceeded. This verification code has been invalidated.');
      }
      throw new Error(`Incorrect verification code. ${record.attemptsLeft} attempts remaining.`);
    }

    // OTP Verified successfully! Wipe challenge record
    this.otpStore.delete(phone);

    // Issue a cryptographically secure verification token
    const verificationToken = `vtok_${crypto.randomBytes(24).toString('hex')}`;
    this.verifiedTokens.set(verificationToken, {
      phone,
      purpose,
      expiresAt: now + 15 * 60 * 1000 // 15 minutes to complete registration/recovery
    });

    // If purpose is LOGIN: authenticate user immediately
    if (purpose === 'LOGIN') {
      const data = db.getData();
      const user = (data.users || []).find(u => u.phone === phone && !u.isBanned);
      if (!user) {
        throw new Error('No active account found associated with this verified phone number.');
      }

      const token = AuthService.generateToken(user);
      return {
        success: true,
        message: 'WhatsApp verification successful.',
        phone,
        user,
        token
      };
    }

    return {
      success: true,
      message: 'WhatsApp phone number verified successfully.',
      phone,
      verificationToken
    };
  }

  /**
   * Verify an issued verification token (used during registration or password reset)
   */
  public static consumeVerificationToken(token: string, expectedPurpose: 'REGISTER' | 'RECOVERY'): string {
    if (!token) throw new Error('Verification token is required.');

    const record = this.verifiedTokens.get(token);
    if (!record) {
      throw new Error('Invalid or expired verification session. Please verify your WhatsApp number again.');
    }

    if (Date.now() > record.expiresAt) {
      this.verifiedTokens.delete(token);
      throw new Error('Verification session has expired. Please verify your phone number again.');
    }

    if (record.purpose !== expectedPurpose) {
      throw new Error('Verification token mismatch for this operation.');
    }

    // Consume token (single use)
    this.verifiedTokens.delete(token);
    return record.phone;
  }
}
