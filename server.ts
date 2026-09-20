import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Global error handlers to prevent unhandled rejections from crashing Cloud Run
process.on('unhandledRejection', (reason, promise) => {
  console.warn('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});

const currentFilename = typeof __filename !== 'undefined' ? __filename : '';
const currentDirname = typeof __dirname !== 'undefined' 
  ? __dirname 
  : (currentFilename ? path.dirname(currentFilename) : process.cwd());

const isProduction = process.env.NODE_ENV === 'production' || 
  (typeof currentFilename === 'string' && currentFilename.endsWith('.cjs'));

// Port configuration:
// In the AI Studio dev container, Nginx runs on NGINX_PORT (8080) and proxies traffic to DEFAULT_APP_PORT (3000).
// In published Cloud Run containers, there is no Nginx proxy; Cloud Run sets PORT (typically 8080) and expects listening on PORT.
const isDevNginxProxy = Boolean(process.env.NGINX_PORT && process.env.NGINX_PORT === '8080');
const PORT = isDevNginxProxy
  ? Number(process.env.DEFAULT_APP_PORT || 3000)
  : Number(process.env.PORT || process.env.DEFAULT_APP_PORT || 8080);
import { AuthService } from './server/services/AuthService';
import { PostService } from './server/services/PostService';
import { ReelService } from './server/services/ReelService';
import { StoryService } from './server/services/StoryService';
import { MusicService } from './server/services/MusicService';
import { MessageService } from './server/services/MessageService';
import { CallService } from './server/services/CallService';
import { FollowService } from './server/services/FollowService';
import { NotificationService } from './server/services/NotificationService';
import { ProfileService } from './server/services/ProfileService';
import { SearchService } from './server/services/SearchService';
import { PresenceService } from './server/services/PresenceService';
import { AdminService, ModerationService, AdService } from './server/services/AdminService';
import { RealtimeService } from './server/services/RealtimeService';
import { MediaStorageService } from './server/services/MediaStorageService';
import { ChunkUploadService } from './server/services/ChunkUploadService';
import { WhatsAppService } from './server/services/WhatsAppService';
import { SettingsService } from './server/services/SettingsService';
import { VerificationCodeService } from './server/services/VerificationCodeService';
import { AiCodingAgentService } from './server/services/AiCodingAgentService';
import { db } from './server/db';
import { OWNER_ADMIN_UID } from './server/utils/security';

const app = express();

// Health check endpoints for Cloud Run deployment probes (supports GET, HEAD, etc.)
app.all(['/api/health', '/health', '/_ah/health', '/_ah/start', '/healthz', '/ping', '/api/ping'], (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure upload directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Media streaming with full HTTP 206 Partial Content / Range support and vault rehydration
app.get(['/uploads/:filename', '/api/uploads/:filename'], (req: Request, res: Response) => {
  MediaStorageService.streamMedia(req, res, req.params.filename);
});

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/api/uploads', express.static(UPLOADS_DIR));

// Intercept legacy external sample video URLs if requested relatively
app.get(['/gtv-videos-bucket/sample/:filename', '/sample/:filename'], (req: Request, res: Response) => {
  const filename = req.params.filename || '';
  if (filename.includes('Escapes')) return res.redirect('/uploads/sample-escapes.mp4');
  if (filename.includes('Fun')) return res.redirect('/uploads/sample-fun.mp4');
  if (filename.includes('BigBuck') || filename.includes('nature') || filename.includes('flower')) return res.redirect('/uploads/sample-nature.mp4');
  return res.redirect('/uploads/sample-ocean.mp4');
});

// Configure Multer with safe extension detection and size limits
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const originalExt = path.extname(file.originalname);
    const fallbackExt = file.mimetype.startsWith('video/') 
      ? '.mp4' 
      : file.mimetype.startsWith('audio/') 
        ? '.mp3' 
        : '.jpg';
    const ext = originalExt || fallbackExt;
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit for up to 60-minute videos
});
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit per chunk
});

// Auth Middleware
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  const token = authHeader.split(' ')[1];
  const payload = AuthService.verifyToken(token);
  if (!payload || !payload.id) {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'TOKEN_INVALID' });
  }

  const user = AuthService.getUserById(payload.id, payload.username);
  if (!user) {
    return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
  }

  // Server-side ban verification and expiration check
  const isBanned = AuthService.checkAndRefreshBan(user);
  if (isBanned) {
    const banType = user.banInfo?.banType === 'temporary' ? 'temporarily' : 'permanently';
    const reason = user.banInfo?.reason ? ` Reason: ${user.banInfo.reason}` : '';
    const exp = user.banInfo?.expiresAt ? ` (Expires: ${new Date(user.banInfo.expiresAt).toLocaleString()})` : '';
    return res.status(403).json({
      error: `Your account has been ${banType} banned by administration.${reason}${exp}`,
      code: 'ACCOUNT_BANNED',
      banInfo: user.banInfo
    });
  }

  (req as any).user = user;
  PresenceService.heartbeat(user.id);
  next();
};

const requireOwnerAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Strictly enforce that the user is the authorized OWNER_ADMIN or ADMIN
  const isOwnerAdmin = 
    user.role === 'OWNER_ADMIN' || 
    user.role === 'ADMIN' ||
    user.username?.toLowerCase() === 'shuv' || 
    user.id === OWNER_ADMIN_UID;
  if (!isOwnerAdmin) {
    return res.status(403).json({
      error: 'Access denied. Only authorized administrators can access this resource.'
    });
  }

  next();
};

const requireStrictOwnerAdminRole = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Strictly enforce server-side that user has role === 'OWNER_ADMIN' and user.id === OWNER_ADMIN_UID.
  // Do NOT authorize merely by checking the username "SHUV".
  const isStrictOwnerAdmin = user.role === 'OWNER_ADMIN' && user.id === OWNER_ADMIN_UID;
  if (!isStrictOwnerAdmin) {
    return res.status(403).json({
      error: 'Access denied. Only the authenticated ISHARA OWNER_ADMIN UID with OWNER_ADMIN role may access the AI Coding Agent.'
    });
  }

  next();
};

const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = AuthService.verifyToken(token);
    if (payload && payload.id) {
      const user = AuthService.getUserById(payload.id, payload.username);
      if (user) {
        (req as any).user = user;
        PresenceService.heartbeat(user.id);
      }
    }
  }
  next();
};

/* ------------------- AUTH ROUTES ------------------- */
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { username, email, identifier, phone, password } = req.body;
    const targetIdentifier = identifier || username || email || phone;
    if (!targetIdentifier) {
      return res.status(400).json({ error: 'Username, email, or phone number is required.' });
    }

    const result = AuthService.login(targetIdentifier, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Randomized on-page verification code generator
app.get('/api/auth/verification-code', (_req: Request, res: Response) => {
  try {
    const codeData = VerificationCodeService.generateCode();
    return res.json(codeData);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to generate verification code' });
  }
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { 
      username, 
      displayName, 
      email, 
      password, 
      isPrivate, 
      phone, 
      verificationCodeId, 
      verificationCode, 
      verificationToken 
    } = req.body;
    
    if (!username) return res.status(400).json({ error: 'Username is required.' });

    const result = AuthService.register({ 
      username, 
      displayName, 
      email, 
      password, 
      isPrivate, 
      phone, 
      verificationCodeId, 
      verificationCode, 
      verificationToken 
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  try {
    const { username, newPassword, verificationCodeId, verificationCode } = req.body;
    if (!username || !newPassword) {
      return res.status(400).json({ error: 'Username and new password are required.' });
    }
    const result = AuthService.resetPasswordWithVerificationCode(
      username,
      newPassword,
      verificationCodeId,
      verificationCode
    );
    return res.json({ success: true, message: 'Password reset successfully!', ...result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  // Always return a fresh renewed token so session remains active indefinitely across deployments
  const token = AuthService.generateToken(user);
  return res.json({ user, token });
});

// Resilient session refresh endpoint
app.post('/api/auth/refresh', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
  if (!token && req.body && req.body.token) {
    token = req.body.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Token required for refresh', code: 'TOKEN_REQUIRED' });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload || !payload.id) {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'TOKEN_INVALID' });
  }

  const user = AuthService.getUserById(payload.id, payload.username);
  if (!user) {
    return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
  }

  const freshToken = AuthService.generateToken(user);
  return res.json({ user, token: freshToken });
});

/* ------------------- WHATSAPP VERIFICATION & RECOVERY ROUTES ------------------- */
app.post('/api/auth/whatsapp/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone, purpose } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    const targetPurpose = (purpose || 'REGISTER').toUpperCase() as 'REGISTER' | 'LOGIN' | 'RECOVERY';
    const result = await WhatsAppService.sendOtp(phone, targetPurpose);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/whatsapp/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, otp, purpose } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and verification code are required.' });
    }
    const targetPurpose = (purpose || 'REGISTER').toUpperCase() as 'REGISTER' | 'LOGIN' | 'RECOVERY';
    const result = await WhatsAppService.verifyOtp(phone, otp, targetPurpose);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/whatsapp/reset-password', (req: Request, res: Response) => {
  try {
    const { verificationToken, newPassword } = req.body;
    if (!verificationToken || !newPassword) {
      return res.status(400).json({ error: 'Verification token and new password are required.' });
    }
    const result = AuthService.resetPasswordWithWhatsApp(verificationToken, newPassword);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/whatsapp/link-phone', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { verificationToken } = req.body;
    if (!verificationToken) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }
    const updated = AuthService.linkPhoneNumber(user.id, verificationToken);
    return res.json({ user: updated, success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Account switching requires either a verified session token for that account or valid credentials
app.post('/api/auth/switch-account', (req: Request, res: Response) => {
  try {
    const { userId, token, password, username } = req.body;
    
    // If a saved session token is provided, verify it
    if (token) {
      const payload = AuthService.verifyToken(token);
      if (payload) {
        const targetId = userId || payload.id;
        const user = AuthService.getUserById(targetId, payload.username || username);
        if (user) {
          const freshToken = AuthService.generateToken(user);
          return res.json({ user, token: freshToken });
        }
      }
    }

    // If credentials are provided, authenticate with username/password
    const identifier = username || userId;
    if (identifier && password) {
      const result = AuthService.login(identifier, password);
      return res.json(result);
    }

    return res.status(401).json({ 
      error: 'Authentication credentials required to switch to this account.' 
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* ------------------- USER SETTINGS ROUTES ------------------- */
// 1. Get authenticated user settings
app.get('/api/settings', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const settings = SettingsService.getUserSettings(user.id);
    return res.json({ settings });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 2. Update authenticated user settings
app.put('/api/settings', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updates = req.body;
    const updatedSettings = SettingsService.updateUserSettings(user.id, updates);
    return res.json({ settings: updatedSettings, message: 'Settings saved successfully.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 3. Change password securely
app.post('/api/settings/change-password', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    const result = SettingsService.changePassword(user.id, currentPassword, newPassword);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 4. Logout from all sessions
app.post('/api/settings/logout-all-sessions', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = SettingsService.logoutAllSessions(user.id);
    return res.json({ ...result, message: 'All active sessions have been revoked.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 5. Get blocked users list
app.get('/api/settings/blocked-users', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const blockedUsers = SettingsService.getBlockedUsers(user.id);
    return res.json({ blockedUsers });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 6. Block a user
app.post('/api/settings/block', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { targetIdentifier } = req.body;
    if (!targetIdentifier) {
      return res.status(400).json({ error: 'Username or user ID to block is required.' });
    }
    const result = SettingsService.blockUser(user.id, targetIdentifier);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 7. Unblock a user
app.post('/api/settings/unblock', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required.' });
    }
    const result = SettingsService.unblockUser(user.id, targetUserId);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* ------------------- PERMANENT MEDIA VAULT & UPLOADS ------------------- */
app.post('/api/upload', optionalAuth, (req: Request, res: Response) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds maximum upload size (500MB).' });
      }
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const user = (req as any).user;
      const ownerUid = user?.id || 'system';

      // Store in permanent media vault
      const record = await MediaStorageService.saveUploadedFile(req.file, ownerUid);

      return res.json({ 
        url: record.storagePath, 
        filename: record.originalName || record.storagePath.split('/').pop(),
        size: record.fileSize,
        mimetype: record.mimeType,
        duration: record.duration,
        width: record.width,
        height: record.height,
        mediaRecord: record,
        success: true
      });
    } catch (saveErr: any) {
      console.error('[Upload Error]', saveErr);
      return res.status(500).json({ error: saveErr.message || 'Media storage failed.' });
    }
  });
});

/* ------------------- CHUNKED & RESUMABLE UPLOADS ------------------- */
// 1. Initialize chunked upload session
app.post('/api/upload/chunk/init', optionalAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { fileId, filename, fileSize, totalChunks, chunkSize, mimeType } = req.body;
    if (!filename || !fileSize || !totalChunks) {
      return res.status(400).json({ error: 'Missing required upload parameters.' });
    }
    const initRes = ChunkUploadService.initUpload({
      fileId: fileId || `${filename}-${fileSize}`,
      filename,
      fileSize: Number(fileSize),
      totalChunks: Number(totalChunks),
      chunkSize: Number(chunkSize || 2.5 * 1024 * 1024),
      mimeType: mimeType || 'video/mp4',
      ownerUid: user?.id || 'system'
    });
    return res.json(initRes);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// 2. Upload individual chunk
app.post('/api/upload/chunk', optionalAuth, (req: Request, res: Response) => {
  chunkUpload.single('chunk')(req as any, res as any, async (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Chunk upload failed' });
    }
    try {
      const { uploadId, chunkIndex } = req.body;
      if (!uploadId || chunkIndex === undefined || !req.file) {
        return res.status(400).json({ error: 'Missing uploadId, chunkIndex, or chunk file.' });
      }
      const result = await ChunkUploadService.saveChunk(
        uploadId,
        Number(chunkIndex),
        req.file.buffer
      );
      return res.json(result);
    } catch (saveErr: any) {
      return res.status(500).json({ error: saveErr.message });
    }
  });
});

// 3. Complete chunked upload and assemble file into permanent storage
app.post('/api/upload/chunk/complete', optionalAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { uploadId, filename } = req.body;
    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }
    const record = await ChunkUploadService.completeUpload(
      uploadId,
      user?.id || 'system',
      filename
    );
    return res.json({
      url: record.storagePath,
      filename: record.originalName || record.storagePath.split('/').pop(),
      size: record.fileSize,
      mimetype: record.mimeType,
      duration: record.duration,
      width: record.width,
      height: record.height,
      mediaRecord: record,
      success: true
    });
  } catch (err: any) {
    console.error('[Chunk Complete Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to complete chunk upload.' });
  }
});

// 4. Query status of chunked upload
app.get('/api/upload/chunk/status/:uploadId', (req: Request, res: Response) => {
  try {
    const status = ChunkUploadService.getStatus(req.params.uploadId);
    return res.json(status);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Media verification endpoint
app.get('/api/media/verify/:storagePath(*)', (req: Request, res: Response) => {
  const targetPath = '/' + req.params.storagePath.replace(/^\//, '');
  const verification = MediaStorageService.verifyObject(targetPath);
  return res.json(verification);
});

// Upload base64 media directly into permanent storage
app.post('/api/upload-base64', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { dataUrl, prefix } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }
    const record = await MediaStorageService.saveBase64Media(dataUrl, user.id, prefix || 'media');
    return res.json({
      url: record.storagePath,
      size: record.fileSize,
      mimetype: record.mimeType,
      mediaRecord: record,
      success: true
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Delete media under strict owner/admin policy
app.delete('/api/media/:storagePath(*)', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const targetPath = '/' + req.params.storagePath.replace(/^\//, '');
  const isAdmin = user.role === 'OWNER_ADMIN' || user.role === 'ADMIN';
  const result = MediaStorageService.deleteMedia(targetPath, user.id, isAdmin);
  if (!result.success) {
    return res.status(403).json({ error: result.error });
  }
  return res.json({ success: true });
});

// High-performance Range-supported media streaming (GET and HEAD)
app.all(['/uploads/:filename', '/api/uploads/:filename'], (req: Request, res: Response) => {
  MediaStorageService.streamMedia(req, res, req.params.filename);
});

app.get('/api/realtime/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let userId: string | undefined = undefined;
  const token = (req.query.token as string) || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : undefined);
  if (token) {
    const payload = AuthService.verifyToken(token);
    if (payload?.id) {
      userId = payload.id;
    }
  }

  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  RealtimeService.addClient(clientId, res, userId);

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, userId })}\n\n`);

  req.on('close', () => {
    RealtimeService.removeClient(clientId);
  });
});

/* ------------------- FEED & POSTS ------------------- */
app.get('/api/posts', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const posts = PostService.getFeedPosts(user?.id);
  return res.json({ posts });
});

app.get('/api/posts/:id', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const post = PostService.getPostById(req.params.id, user?.id);
  if (!post) return res.status(404).json({ error: 'Post not found or unavailable' });
  return res.json({ post });
});

app.delete('/api/posts/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    PostService.deletePost(req.params.id, user.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/posts', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const post = await PostService.createPost({
      userId: user.id,
      ...req.body
    });
    return res.json({ post });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/posts/:id/like', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = PostService.toggleLike(req.params.id, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/posts/:id/save', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = PostService.toggleSave(req.params.id, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get(['/api/posts/:id/comments', '/api/reels/:id/comments'], optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const comments = PostService.getComments(req.params.id, user?.id);
  return res.json({ comments });
});

app.post(['/api/posts/:id/comments/:commentId/like', '/api/reels/:id/comments/:commentId/like'], authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = PostService.toggleCommentLike(req.params.commentId, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post(['/api/posts/:id/comments', '/api/reels/:id/comments'], authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const comment = PostService.addComment(req.params.id, user.id, req.body.text);
    return res.json({ comment });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete(['/api/posts/:id/comments/:commentId', '/api/reels/:id/comments/:commentId'], authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = PostService.deleteComment(req.params.commentId, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* ------------------- REELS ------------------- */
app.get('/api/reels', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const reels = ReelService.getReels(user?.id);
  return res.json({ reels });
});

app.get('/api/reels/:id', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const reel = ReelService.getReelById(req.params.id, user?.id);
  if (!reel) return res.status(404).json({ error: 'Reel not found or unavailable' });
  return res.json({ reel });
});

app.delete('/api/reels/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    ReelService.deleteReel(req.params.id, user.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/reels', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const reel = await ReelService.createReel({
      userId: user.id,
      ...req.body
    });
    return res.json({ reel });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/reels/:id/like', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = ReelService.toggleLike(req.params.id, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* ------------------- STORIES ------------------- */
app.get('/api/stories', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const stories = StoryService.getStories(user?.id);
  return res.json({ stories });
});

app.post('/api/stories', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const story = await StoryService.createStory({
      userId: user.id,
      ...req.body
    });
    return res.json({ story });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/stories/split-video', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { 
      videoUrl, 
      caption,
      audioId,
      audioStartTime,
      audioEndTime,
      audioVolume,
      originalAudioVolume
    } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required.' });
    }
    let stories: any[] = [];
    try {
      stories = await StoryService.splitAndCreateStoryVideo({
        userId: user.id,
        videoUrl,
        caption,
        audioId,
        audioStartTime,
        audioEndTime,
        audioVolume,
        originalAudioVolume
      });
    } catch (splitErr: any) {
      console.warn('[Story Split Warning] Falling back to single story creation:', splitErr);
      const singleStory = await StoryService.createStory({
        userId: user.id,
        mediaType: 'video',
        mediaUrl: videoUrl,
        caption,
        audioId,
        audioStartTime,
        audioEndTime,
        audioVolume,
        originalAudioVolume,
        segmentIndex: 1,
        totalSegments: 1
      });
      stories = [singleStory];
    }
    return res.json({
      stories,
      count: stories.length,
      success: true
    });
  } catch (err: any) {
    console.error('[Story Split Error]', err);
    return res.status(400).json({ error: err.message || 'Failed to split and create stories.' });
  }
});

app.post('/api/stories/:id/like', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = StoryService.toggleLikeStory(req.params.id, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/stories/:id/view', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = StoryService.recordStoryView(req.params.id, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/stories/:id/viewers', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const viewers = StoryService.getStoryViewers(req.params.id, user.id);
    return res.json({ viewers });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/stories/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    StoryService.deleteStory(req.params.id, user.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* ------------------- MUSIC & AUDIO ------------------- */
app.get(['/api/tracks', '/api/music'], optionalAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const tab = (req.query.tab as any) || 'all';
    const query = (req.query.q || req.query.query || '') as string;
    const genre = (req.query.genre || 'All') as string;
    const creatorId = req.query.creatorId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;

    const isOwnerAdmin = user && (
      user.role === 'OWNER_ADMIN' ||
      user.role === 'admin' ||
      user.username?.toLowerCase() === 'shuv' ||
      user.id === OWNER_ADMIN_UID
    );

    const result = MusicService.getTracks({
      tab,
      query,
      genre,
      creatorId,
      userId: user?.id,
      page,
      limit,
      isAdmin: Boolean(isOwnerAdmin)
    });

    return res.json({
      tracks: result.tracks,
      total: result.total,
      page,
      limit
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve audio tracks' });
  }
});

app.get('/api/tracks/meta/genres', (_req: Request, res: Response) => {
  try {
    const genres = MusicService.getGenres();
    return res.json({ genres });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/tracks/meta/recent', optionalAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.json({ tracks: [] });
    const tracks = MusicService.getRecentlyUsed(user.id);
    return res.json({ tracks });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/tracks/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const track = MusicService.getTrackById(req.params.id, user?.id);
    if (!track) {
      return res.status(404).json({ error: 'Audio track not found' });
    }
    return res.json({ track });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/tracks', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      title,
      artist,
      description,
      audioUrl,
      coverUrl,
      duration,
      mimeType,
      fileSize,
      genre,
      isOriginal,
      visibility
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Track title is required.' });
    }
    if (!audioUrl || !audioUrl.trim()) {
      return res.status(400).json({ error: 'Audio file is required.' });
    }

    const track = MusicService.createTrack(
      {
        title,
        artist,
        description,
        audioUrl,
        coverUrl,
        duration: duration || 30,
        mimeType,
        fileSize,
        genre,
        isOriginal: isOriginal !== false,
        visibility: visibility || 'PUBLIC'
      },
      user.id,
      user.displayName || user.username || 'Creator',
      user.username,
      user.avatarUrl
    );

    return res.status(201).json({ track });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.all(['/api/tracks/:id/update', '/api/tracks/:id'], (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'PUT' && req.method !== 'PATCH') return next();
  return authenticate(req, res, () => {
    try {
      const user = (req as any).user;
      const isOwnerAdmin = user && (
        user.role === 'OWNER_ADMIN' ||
        user.role === 'admin' ||
        user.username?.toLowerCase() === 'shuv' ||
        user.id === OWNER_ADMIN_UID
      );

      const updated = MusicService.updateTrack(
        req.params.id,
        req.body,
        user.id,
        Boolean(isOwnerAdmin)
      );

      return res.json({ track: updated });
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  });
});

app.delete('/api/tracks/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isOwnerAdmin = user && (
      user.role === 'OWNER_ADMIN' ||
      user.role === 'admin' ||
      user.username?.toLowerCase() === 'shuv' ||
      user.id === OWNER_ADMIN_UID
    );

    const result = MusicService.deleteTrack(req.params.id, user.id, Boolean(isOwnerAdmin));
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/tracks/:id/save', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = MusicService.toggleSaveTrack(req.params.id, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/tracks/:id/play', optionalAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = MusicService.recordPlay(req.params.id, user?.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/tracks/:id/report', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { reason, description } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Please provide a reason for the report.' });
    }
    const result = MusicService.reportTrack(
      req.params.id,
      user.id,
      user.username || 'user',
      reason,
      description
    );
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/tracks/:id/content', (req: Request, res: Response) => {
  try {
    const content = MusicService.getAudioContent(req.params.id);
    return res.json(content);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Admin management routes for audio
app.get('/api/admin/tracks', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const query = req.query.q as string | undefined;
    const status = req.query.status as string | undefined;
    const tracks = MusicService.getAllTracksAdmin(query, status);
    return res.json({ tracks });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/tracks/:id/status', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { status } = req.body;
    const updated = MusicService.updateTrackStatusAdmin(req.params.id, status, user.id);
    return res.json({ track: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/tracks/:id/featured', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { featured } = req.body;
    const updated = MusicService.toggleFeaturedAdmin(req.params.id, Boolean(featured), user.id);
    return res.json({ track: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/audio-reports', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const reports = MusicService.getAudioReportsAdmin();
    return res.json({ reports });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/audio-reports/:id/resolve', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { action } = req.body;
    MusicService.resolveAudioReportAdmin(req.params.id, action, user.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* ------------------- PROFILE & FOLLOW ------------------- */
app.get('/api/profile/:username', optionalAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const data = ProfileService.getProfile(req.params.username, user?.id);
    return res.json({
      user: data.profile,
      profile: data.profile,
      posts: data.posts,
      reels: data.reels,
      savedPosts: data.savedPosts
    });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

app.post('/api/profile/update', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updated = await ProfileService.updateProfile(user.id, req.body);
    return res.json({ profile: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/follow/status/:id', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const rel = FollowService.getRelationshipState(user.id, req.params.id);
  return res.json(rel);
});

app.post('/api/follow/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = FollowService.toggleFollow(user.id, req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/follow/accept/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = FollowService.acceptRequest(user.id, req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/follow/decline/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = FollowService.declineRequest(user.id, req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/follow/followers/:id', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const users = FollowService.getFollowers(req.params.id, user?.id);
  return res.json({ users });
});

app.get('/api/follow/following/:id', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const users = FollowService.getFollowing(req.params.id, user?.id);
  return res.json({ users });
});

/* ------------------- NOTIFICATIONS ------------------- */
app.get('/api/notifications', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const notifications = NotificationService.getNotifications(user.id);
  return res.json({ notifications });
});

app.get('/api/notifications/unread-count', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const unreadCount = NotificationService.getNotifications(user.id).filter(n => !n.isRead).length;
  const pendingRequestsCount = FollowService.getPendingRequests(user.id).length;
  return res.json({
    unreadCount,
    pendingRequestsCount,
    totalBadgeCount: Math.max(unreadCount, pendingRequestsCount)
  });
});

app.post('/api/notifications/read', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  NotificationService.markAsRead(user.id, req.body.notificationId);
  return res.json({ success: true });
});

app.post('/api/notifications/read-all', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  NotificationService.markAsRead(user.id);
  return res.json({ success: true });
});

app.delete('/api/notifications/:id', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  NotificationService.deleteNotification(user.id, req.params.id);
  return res.json({ success: true });
});

app.delete('/api/notifications', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  NotificationService.deleteAllNotifications(user.id);
  return res.json({ success: true });
});

/* ------------------- USER DISCOVERY & DIRECT CHAT ------------------- */
app.get('/api/users/all', optionalAuth, (_req: Request, res: Response) => {
  const data = db.getData();
  const safeUsers = (data.users || [])
    .filter(u => !u.isBanned)
    .map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      verified: u.verified,
      isPrivate: u.isPrivate,
      role: u.role
    }));
  return res.json({ users: safeUsers });
});

app.get('/api/users/following', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const following = FollowService.getFollowing(user.id);
  return res.json({ following });
});

app.get('/api/users/eligible-for-group', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const following = FollowService.getFollowing(user.id) || [];
  const data = db.getData();
  const otherUsers = (data.users || [])
    .filter(u => u.id !== user.id && !u.isBanned)
    .map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      verified: u.verified,
      isPrivate: u.isPrivate,
      role: u.role
    }));

  const seen = new Set<string>();
  const combined: any[] = [];
  for (const u of following) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      combined.push(u);
    }
  }
  for (const u of otherUsers) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      combined.push(u);
    }
  }
  return res.json({ users: combined });
});

/* ------------------- MESSAGING & CALLS ------------------- */
app.get('/api/conversations', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const conversations = MessageService.getConversations(user.id);
  return res.json({ conversations });
});

app.post('/api/conversations/start', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const conv = MessageService.getOrCreateConversation(user.id, req.body.targetUserId);
    return res.json({ conversation: conv });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/conversations/:id/messages', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const messages = MessageService.getMessages(req.params.id, user.id);
    return res.json({ messages });
  } catch (err: any) {
    return res.status(403).json({ error: err.message });
  }
});

app.post('/api/conversations/:id/seen', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = MessageService.markConversationAsSeen(req.params.id, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/messages/send', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const msg = MessageService.sendMessage({
      conversationId: req.body.conversationId,
      senderId: user.id,
      text: req.body.text,
      mediaUrl: req.body.mediaUrl,
      mediaType: req.body.mediaType,
      voiceDuration: req.body.voiceDuration !== undefined ? Number(req.body.voiceDuration) : undefined,
      sharedContent: req.body.sharedContent
    });
    return res.json({ message: msg });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Production Message Deletion Endpoints
app.post('/api/messages/:id/delete-for-me', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = MessageService.deleteMessageForMe(user.id, req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/messages/:id/delete-for-everyone', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = MessageService.deleteMessageForEveryone(user.id, req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/messages/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const mode = req.query.mode === 'everyone' ? 'everyone' : 'me';
    if (mode === 'everyone') {
      const result = MessageService.deleteMessageForEveryone(user.id, req.params.id);
      return res.json(result);
    } else {
      const result = MessageService.deleteMessageForMe(user.id, req.params.id);
      return res.json(result);
    }
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/messages/share', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const msg = MessageService.shareContentInDM({
      senderId: user.id,
      targetConversationId: req.body.conversationId,
      recipientId: req.body.recipientId || req.body.targetUserId,
      contentType: req.body.contentType || (req.body.sharedContent?.type?.toLowerCase()),
      contentId: req.body.contentId || req.body.sharedContent?.id,
      messageText: req.body.messageText || req.body.text
    });
    return res.json({ message: msg });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Group Creation (handles both /api/messages/groups and /api/conversations/group)
const handleCreateGroup = (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const groupName = req.body.groupName || req.body.name;
    const memberIds = req.body.memberIds || req.body.participantIds || [];
    const groupAvatarUrl = req.body.groupAvatarUrl;
    const group = MessageService.createGroup(user.id, groupName, memberIds, groupAvatarUrl);
    return res.json({ conversation: group });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
app.post('/api/messages/groups', authenticate, handleCreateGroup);
app.post('/api/conversations/group', authenticate, handleCreateGroup);

// Rename Group
const handleRenameGroup = (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const groupName = req.body.groupName || req.body.name;
    const updated = MessageService.renameGroup(user.id, req.params.id, groupName);
    return res.json({ conversation: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
app.patch('/api/messages/groups/:id/rename', authenticate, handleRenameGroup);
app.put('/api/messages/groups/:id/rename', authenticate, handleRenameGroup);
app.put('/api/conversations/:id/rename', authenticate, handleRenameGroup);

// Change Group Photo
app.patch('/api/messages/groups/:id/photo', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updated = MessageService.updateGroupPhoto(user.id, req.params.id, req.body.photoUrl);
    return res.json({ conversation: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Add Members to Group
const handleAddMembers = (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const memberIds = req.body.memberIds || (req.body.userId ? [req.body.userId] : []);
    const updated = MessageService.addGroupMembers(user.id, req.params.id, memberIds);
    return res.json({ conversation: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
app.post('/api/messages/groups/:id/members', authenticate, handleAddMembers);
app.post('/api/conversations/:id/members', authenticate, handleAddMembers);

// Remove Member or Leave Group
const handleRemoveMember = (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updated = MessageService.removeGroupMember(user.id, req.params.id, req.params.userId);
    return res.json({ conversation: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
};
app.delete('/api/messages/groups/:id/members/:userId', authenticate, handleRemoveMember);
app.delete('/api/conversations/:id/members/:userId', authenticate, handleRemoveMember);

// Promote/Demote Group Admin
app.patch('/api/messages/groups/:id/admins', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updated = MessageService.setGroupAdminStatus(
      user.id,
      req.params.id,
      req.body.targetUserId,
      Boolean(req.body.makeAdmin)
    );
    return res.json({ conversation: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Delete Group
app.delete('/api/messages/groups/:id', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    MessageService.deleteGroup(user.id, req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Get Group Shared Media
app.get('/api/messages/groups/:id/media', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const media = MessageService.getGroupSharedMedia(user.id, req.params.id);
    return res.json({ media });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/calls/ice-servers', authenticate, (_req: Request, res: Response) => {
  const iceServers = CallService.getIceServers();
  return res.json({ iceServers });
});

app.post('/api/calls/initiate', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const call = CallService.initiateCall(user.id, req.body.receiverId, req.body.type || 'audio', req.body.offer, req.body.candidates);
    return res.json({ call });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/calls/active', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const call = CallService.getActiveCallForUser(user.id);
  return res.json({ call });
});

app.post('/api/calls/:id/ring', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const call = CallService.markRinging(req.params.id, user.id);
    return res.json({ call });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/calls/:id/answer', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const call = CallService.answerCall(req.params.id, user.id);
    return res.json({ call });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/calls/:id/connected', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const call = CallService.markConnected(req.params.id, user.id);
    return res.json({ call });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/calls/:id/reconnecting', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const call = CallService.markReconnecting(req.params.id, user.id);
    return res.json({ call });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/calls/:id/signal', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    CallService.handleSignal(req.params.id, user.id, req.body.signal);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/calls/:id/signals', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const signals = CallService.getSignals(req.params.id, user.id);
    return res.json(signals);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/calls/:id/media-state', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    CallService.updateMediaState(req.params.id, user.id, req.body.mediaState || {});
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/calls/:id/end', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const call = CallService.endCall(req.params.id, user.id, req.body.status, req.body.reason);
    return res.json({ call });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/calls/history', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const history = CallService.getCallHistory(user.id);
  return res.json({ history });
});

/* ------------------- SEARCH & ADMIN ------------------- */
app.get('/api/search', optionalAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const query = (req.query.q as string) || '';
  const result = SearchService.search(query, user?.id);
  return res.json(result);
});

app.get('/api/presence/online', (req: Request, res: Response) => {
  const onlineUserIds = PresenceService.getOnlineUserIds();
  return res.json({ onlineUserIds });
});

/* ------------------- ADMIN & MODERATION ------------------- */
app.get('/api/admin/stats', authenticate, requireOwnerAdmin, (_req: Request, res: Response) => {
  const stats = AdminService.getStats();
  return res.json({ stats });
});

app.post('/api/admin/role', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const updated = AdminService.updateUserRole(req.body.userId, req.body.role);
    return res.json({ user: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post(['/api/admin/verify', '/api/admin/users/:userId/verify'], authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId || req.body.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }
    const verified = req.body.verified !== undefined ? Boolean(req.body.verified) : undefined;
    const updated = AdminService.toggleVerified(targetUserId, verified);
    return res.json({ user: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/users/:userId/ban', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const isPermanent = req.body.isPermanent !== undefined ? Boolean(req.body.isPermanent) : (req.body.banType === 'permanent');
    const banType = isPermanent ? 'permanent' : 'temporary';
    const reason = (req.body.reason && req.body.reason.trim()) ? req.body.reason.trim() : 'Account suspended by moderation';
    const result = AdminService.banUser(adminUser, req.params.userId, {
      banType,
      durationHours: req.body.durationHours,
      reason
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/users/:userId/unban', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const result = AdminService.unbanUser(adminUser, req.params.userId, req.body.reason);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/users/:userId/ban-history', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  const history = AdminService.getBanHistory(req.params.userId);
  return res.json({ history });
});

app.get('/api/admin/ban-history', authenticate, requireOwnerAdmin, (_req: Request, res: Response) => {
  const history = AdminService.getBanHistory();
  return res.json({ history });
});

app.get('/api/admin/reports', authenticate, requireOwnerAdmin, (_req: Request, res: Response) => {
  const reports = ModerationService.getReports();
  return res.json({ reports });
});

app.patch('/api/admin/reports/:id/status', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const report = ModerationService.updateReportStatus(
      req.params.id,
      req.body.status,
      req.body.actionTaken,
      adminUser.id
    );
    return res.json({ report });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/reports/:id/resolve', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { action, notes, warningMessage } = req.body;

    if (action === 'DELETE_CONTENT') {
      const reports = ModerationService.getReports();
      const report = reports.find(r => r.id === req.params.id);
      if (report && (report.targetType === 'post' || report.targetType === 'reel')) {
        ModerationService.deleteContent(adminUser, report.targetType, report.targetId);
      }
      const updated = ModerationService.updateReportStatus(
        req.params.id,
        'resolved',
        notes || 'Content permanently deleted by admin',
        adminUser.id
      );
      return res.json({ report: updated, success: true });
    }

    if (action === 'WARN_USER') {
      const updated = ModerationService.warnUser(
        adminUser, 
        req.params.id, 
        warningMessage || notes || 'Violation of community standards'
      );
      return res.json({ report: updated, success: true });
    }

    const status = action === 'DISMISS' ? 'dismissed' : 'resolved';
    const report = ModerationService.updateReportStatus(
      req.params.id,
      status,
      notes || action || 'Report resolved',
      adminUser.id
    );
    return res.json({ report, success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/reports/:id/warn', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { warningMessage } = req.body;
    const report = ModerationService.warnUser(adminUser, req.params.id, warningMessage);
    return res.json({ report, success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/content/:targetType/:targetId', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    ModerationService.deleteContent(adminUser, req.params.targetType as any, req.params.targetId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/reports', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const report = ModerationService.reportContent({
      reporterId: user.id,
      ...req.body
    });
    return res.json({ report });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get(['/api/ads', '/api/ads/active'], (req: Request, res: Response) => {
  const placement = req.query.placement as any;
  const includeInactive = req.query.all === 'true';
  const ads = AdService.getAds(placement, includeInactive);
  return res.json({ ads });
});

app.post('/api/ads', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const payload = {
      ...req.body,
      sponsorName: req.body.sponsorName || user.displayName || user.username,
      sponsorAvatarUrl: req.body.sponsorAvatarUrl || req.body.sponsorAvatar || user.avatarUrl,
    };
    const newAd = AdService.createAd(payload);
    return res.json({ ad: newAd });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.patch('/api/ads/:id/toggle', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    const updated = AdService.toggleAdActive(req.params.id);
    return res.json({ ad: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/ads/:id', authenticate, requireOwnerAdmin, (req: Request, res: Response) => {
  try {
    AdService.deleteAd(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/ads/:id/impression', (req: Request, res: Response) => {
  try {
    AdService.recordImpression(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/ads/:id/click', (req: Request, res: Response) => {
  try {
    AdService.recordClick(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* ------------------- MEDIA INTEGRITY & MIGRATION DIAGNOSTICS ------------------- */
app.get('/api/admin/media/diagnostic', authenticate, requireOwnerAdmin, (_req: Request, res: Response) => {
  try {
    const report = MediaStorageService.getDiagnosticReport();
    return res.json({ report });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/media/repair', authenticate, requireOwnerAdmin, (_req: Request, res: Response) => {
  try {
    const result = MediaStorageService.repairMediaReferences();
    return res.json({ result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/media/playback-error', optionalAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    MediaStorageService.logProductionPlaybackError({
      ...req.body,
      ownerUid: user?.id || req.body.ownerUid || 'anonymous'
    });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(200).json({ success: false }); // Always return non-blocking 200 for error beacon
  }
});

// =========================================================================
// ISHARA AI CODING AGENT & APP BUILDER (OWNER_ADMIN ACCESS ONLY)
// =========================================================================

app.post('/api/admin/ai-agent/prompt', authenticate, requireStrictOwnerAdminRole, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { prompt, screenshotBase64 } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const response = await AiCodingAgentService.processPrompt(prompt, user.id, screenshotBase64);
    return res.json({ response });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'AI Agent processing failed' });
  }
});

app.get('/api/admin/ai-agent/architecture', authenticate, requireStrictOwnerAdminRole, (_req: Request, res: Response) => {
  try {
    const architecture = AiCodingAgentService.getArchitecture();
    return res.json({ architecture });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/ai-agent/versions', authenticate, requireStrictOwnerAdminRole, (_req: Request, res: Response) => {
  try {
    const versions = AiCodingAgentService.getVersions();
    return res.json({ versions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ai-agent/apply', authenticate, requireStrictOwnerAdminRole, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { versionId, prompt, diffs } = req.body;
    if (!versionId || !diffs) {
      return res.status(400).json({ error: 'versionId and diffs are required' });
    }
    const result = await AiCodingAgentService.applyVersion(versionId, prompt, diffs, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ai-agent/rollback', authenticate, requireStrictOwnerAdminRole, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { versionId } = req.body;
    if (!versionId) {
      return res.status(400).json({ error: 'versionId is required' });
    }
    const result = await AiCodingAgentService.rollbackVersion(versionId, user.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ai-agent/run-lint', authenticate, requireStrictOwnerAdminRole, async (_req: Request, res: Response) => {
  try {
    const result = await AiCodingAgentService.runLint();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ai-agent/run-build', authenticate, requireStrictOwnerAdminRole, async (_req: Request, res: Response) => {
  try {
    const result = await AiCodingAgentService.runBuild();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/ai-agent/diagnostics', authenticate, requireStrictOwnerAdminRole, async (_req: Request, res: Response) => {
  try {
    const result = await AiCodingAgentService.runDiagnostics();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/ai-agent/file', authenticate, requireStrictOwnerAdminRole, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    const content = AiCodingAgentService.readFileSanitized(filePath, user.id);
    return res.json({ content, filePath });
  } catch (err: any) {
    return res.status(403).json({ error: err.message });
  }
});

app.get('/api/admin/ai-agent/logs', authenticate, requireStrictOwnerAdminRole, (_req: Request, res: Response) => {
  try {
    const logs = AiCodingAgentService.getRecentLogs();
    return res.json({ logs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  // Vite middleware for development vs static production serving
  const isProd = process.env.NODE_ENV === 'production' || 
    (typeof currentFilename === 'string' && currentFilename.endsWith('.cjs'));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production bundled CJS, server.cjs resides in dist/ alongside index.html
    const distPath = fs.existsSync(path.join(currentDirname, 'index.html'))
      ? currentDirname
      : path.join(process.cwd(), 'dist');

    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      if (_req.path && _req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application index.html not found');
      }
    });
  }

  const server = http.createServer(app);

  // Set up WebSocket server for real-time signaling, duplex messaging & presence
  const wss = new WebSocketServer({ noServer: true });

  const handleUpgrade = (request: http.IncomingMessage, socket: any, head: Buffer) => {
    try {
      const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (parsedUrl.pathname === '/ws/call' || parsedUrl.pathname === '/ws/realtime') {
        const token = parsedUrl.searchParams.get('token');
        let userId: string | undefined;
        if (token) {
          const payload = AuthService.verifyToken(token);
          if (payload?.id) {
            userId = payload.id;
          }
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, userId);
        });
      }
    } catch {
      // Ignore or close on malformed upgrade
    }
  };

  server.on('upgrade', handleUpgrade);

  wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, userId?: string) => {
    const clientId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    RealtimeService.addWsClient(clientId, ws, userId);

    if (userId) {
      PresenceService.heartbeat(userId);
    }

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'heartbeat' && userId) {
          PresenceService.heartbeat(userId);
        } else if (data.type === 'signal' && userId && data.callId) {
          CallService.handleSignal(data.callId, userId, data.signal);
        } else if (data.type === 'media-state' && userId && data.callId) {
          CallService.updateMediaState(data.callId, userId, data.mediaState);
        }
      } catch {
        // Ignore invalid frames
      }
    });

    ws.on('close', () => {
      RealtimeService.removeWsClient(clientId);
    });

    ws.on('error', () => {
      RealtimeService.removeWsClient(clientId);
    });
  });

  const host = '0.0.0.0';
  server.listen(PORT, host, () => {
    console.log(`[Server] Application server active on http://${host}:${PORT} (production=${isProd})`);

    // Defer all non-essential background tasks until after server is actively listening on PORT
    setTimeout(() => {
      try {
        AiCodingAgentService.init();
      } catch (e) {
        console.error('Failed to initialize AiCodingAgentService:', e);
      }
      try {
        MediaStorageService.initializeVaultAndAudit();
      } catch (err) {
        console.error('Failed to initialize and audit permanent media:', err);
      }
      try {
        db.initCloudSync().catch((err) => {
          console.warn('[Database] Deferred cloud sync notice:', err);
        });
      } catch (err) {
        console.warn('[Database] Cloud sync error:', err);
      }
    }, 50);
  });

  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      const fallbackPort = PORT === 8080 ? 3000 : 8080;
      console.warn(`[Server] Port ${PORT} already in use, attempting fallback to port ${fallbackPort}...`);
      server.listen(fallbackPort, host, () => {
        console.log(`[Server] Fallback server active on http://${host}:${fallbackPort} (production=${isProd})`);
      });
      return;
    }
    console.error('[Server] Critical server listen error:', err);
    process.exit(1);
  });

  // Graceful shutdown handling for Cloud Run container lifecycle
  const handleShutdown = (signal: string) => {
    console.log(`[CloudRun] Received ${signal}, draining connections gracefully...`);
    server.close(() => {
      console.log('[CloudRun] HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.warn('[CloudRun] Forcing container termination after timeout.');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

