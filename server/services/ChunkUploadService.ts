import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MediaStorageService } from './MediaStorageService';
import { probeVideoMetadata } from '../utils/videoProbe';
import { MediaRecord } from '../../src/types/index';

const DATA_DIR = path.join(process.cwd(), 'data');
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure chunk directory exists
if (!fs.existsSync(CHUNKS_DIR)) {
  try {
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
  } catch {}
}

export interface ChunkInitPayload {
  fileId: string;
  filename: string;
  fileSize: number;
  totalChunks: number;
  chunkSize: number;
  mimeType: string;
  ownerUid: string;
}

export interface ChunkInitResponse {
  uploadId: string;
  uploadedChunks: number[];
  chunkSize: number;
  totalChunks: number;
}

export class ChunkUploadService {
  /**
   * Generates a stable upload ID based on fileId or filename + size + owner
   */
  public static getUploadId(fileId: string, ownerUid: string): string {
    const raw = `${ownerUid}_${fileId}`;
    return crypto.createHash('md5').update(raw).digest('hex');
  }

  /**
   * Initializes a chunked upload session and checks for already uploaded chunks
   */
  public static initUpload(payload: ChunkInitPayload): ChunkInitResponse {
    const uploadId = this.getUploadId(payload.fileId, payload.ownerUid);
    const sessionDir = path.join(CHUNKS_DIR, uploadId);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save metadata
    const metaPath = path.join(sessionDir, 'metadata.json');
    fs.writeFileSync(metaPath, JSON.stringify({
      uploadId,
      filename: payload.filename,
      fileSize: payload.fileSize,
      totalChunks: payload.totalChunks,
      chunkSize: payload.chunkSize,
      mimeType: payload.mimeType,
      ownerUid: payload.ownerUid,
      createdAt: Date.now()
    }, null, 2), 'utf-8');

    // Discover existing uploaded chunks
    const uploadedChunks = this.getUploadedChunkIndices(sessionDir);

    return {
      uploadId,
      uploadedChunks,
      chunkSize: payload.chunkSize,
      totalChunks: payload.totalChunks
    };
  }

  /**
   * Saves a single chunk buffer to disk
   */
  public static async saveChunk(
    uploadId: string,
    chunkIndex: number,
    chunkBuffer: Buffer
  ): Promise<{ success: boolean; chunkIndex: number }> {
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const chunkFile = path.join(sessionDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkFile, chunkBuffer);

    return { success: true, chunkIndex };
  }

  /**
   * Checks status of an upload session
   */
  public static getStatus(uploadId: string): {
    uploadId: string;
    uploadedChunks: number[];
    totalChunks: number;
    filename?: string;
  } {
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      return { uploadId, uploadedChunks: [], totalChunks: 0 };
    }

    let totalChunks = 0;
    let filename: string | undefined = undefined;

    const metaPath = path.join(sessionDir, 'metadata.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        totalChunks = meta.totalChunks || 0;
        filename = meta.filename;
      } catch {}
    }

    const uploadedChunks = this.getUploadedChunkIndices(sessionDir);

    return {
      uploadId,
      uploadedChunks,
      totalChunks,
      filename
    };
  }

  /**
   * Stitches all chunks together sequentially, registers permanent media record, and cleans up
   */
  public static async completeUpload(
    uploadId: string,
    ownerUid: string,
    overrideFilename?: string
  ): Promise<MediaRecord> {
    const sessionDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      throw new Error('Upload session not found or expired.');
    }

    const metaPath = path.join(sessionDir, 'metadata.json');
    let meta: any = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {}
    }

    const filename = overrideFilename || meta.filename || `upload_${Date.now()}.mp4`;
    const totalChunks = meta.totalChunks;

    if (!totalChunks || totalChunks <= 0) {
      throw new Error('Missing chunk upload metadata.');
    }

    // Verify all chunks are present
    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = path.join(sessionDir, `chunk_${i}`);
      if (!fs.existsSync(chunkFile)) {
        throw new Error(`Missing chunk ${i} of ${totalChunks}. Please resume upload.`);
      }
    }

    // Determine target output path in data/uploads
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const ext = path.extname(filename) || (meta.mimeType?.startsWith('video/') ? '.mp4' : '.jpg');
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const assembledPath = path.join(UPLOADS_DIR, uniqueName);

    // Concatenate chunks using streams
    const writeStream = fs.createWriteStream(assembledPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = path.join(sessionDir, `chunk_${i}`);
      const chunkData = fs.readFileSync(chunkFile);
      writeStream.write(chunkData);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end();
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    const stat = fs.statSync(assembledPath);

    // Prepare simulated Multer File object to pass to MediaStorageService
    const multerFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: filename,
      encoding: '7bit',
      mimetype: meta.mimeType || 'video/mp4',
      size: stat.size,
      destination: UPLOADS_DIR,
      filename: uniqueName,
      path: assembledPath,
      buffer: Buffer.alloc(0),
      stream: null as any
    };

    // Save permanently in MediaStorageService (mirrors to data/permanent_storage & public/uploads)
    const record = await MediaStorageService.saveUploadedFile(
      multerFile,
      ownerUid || meta.ownerUid || 'system',
      meta.mimeType?.startsWith('video/') ? 'video' : 'image'
    );

    // Clean up chunk files in background
    try {
      const files = fs.readdirSync(sessionDir);
      for (const f of files) {
        fs.unlinkSync(path.join(sessionDir, f));
      }
      fs.rmdirSync(sessionDir);
    } catch (cleanupErr) {
      console.warn('[ChunkUploadService] Temp cleanup warning:', cleanupErr);
    }

    return record;
  }

  private static getUploadedChunkIndices(sessionDir: string): number[] {
    try {
      return fs.readdirSync(sessionDir)
        .filter(f => f.startsWith('chunk_'))
        .map(f => parseInt(f.replace('chunk_', ''), 10))
        .filter(idx => !isNaN(idx))
        .sort((a, b) => a - b);
    } catch {
      return [];
    }
  }
}
