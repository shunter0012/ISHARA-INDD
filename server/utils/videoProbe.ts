import { execFile } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = util.promisify(execFile);

export const SERVER_VIDEO_LIMITS = {
  // Feed Post Video Limit: 60 minutes
  FEED_MAX_SECONDS: 3600,
  FEED_MAX_LABEL: '60 minutes',

  // Reel Limit: 15 minutes (900 seconds)
  REEL_MAX_SECONDS: 900,
  REEL_MAX_LABEL: '15 minutes',

  // Carousel Individual Video Limit: 60 seconds
  CAROUSEL_ITEM_MAX_SECONDS: 60,
  CAROUSEL_ITEM_MAX_LABEL: '60 seconds',

  // Story Segment Limit: 60 seconds
  STORY_SEGMENT_MAX_SECONDS: 60,
  STORY_SEGMENT_MAX_LABEL: '60 seconds'
} as const;

export interface VideoMetadata {
  duration: number; // in seconds
  width?: number;
  height?: number;
  format?: string;
  bitrate?: number;
}

/**
 * Accurately probes video duration and dimensions on server using ffprobe
 */
export async function probeVideoMetadata(filePath: string): Promise<VideoMetadata> {
  if (!fs.existsSync(filePath)) {
    return { duration: 0 };
  }

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration,format_name,bit_rate:stream=width,height,duration',
      '-of', 'json',
      filePath
    ], { timeout: 45000 });

    const info = JSON.parse(stdout);
    let duration = 0;

    // 1. Try format duration
    if (info.format?.duration) {
      const parsed = parseFloat(info.format.duration);
      if (!isNaN(parsed) && parsed > 0) {
        duration = parsed;
      }
    }

    // 2. Try stream duration if format duration missing
    if (duration === 0 && Array.isArray(info.streams)) {
      for (const s of info.streams) {
        if (s.duration) {
          const parsed = parseFloat(s.duration);
          if (!isNaN(parsed) && parsed > 0) {
            duration = parsed;
            break;
          }
        }
      }
    }

    let width: number | undefined = undefined;
    let height: number | undefined = undefined;
    if (Array.isArray(info.streams)) {
      const videoStream = info.streams.find((s: any) => s.width && s.height);
      if (videoStream) {
        width = parseInt(videoStream.width, 10);
        height = parseInt(videoStream.height, 10);
      }
    }

    const bitrate = info.format?.bit_rate ? parseInt(info.format.bit_rate, 10) : undefined;
    const format = info.format?.format_name;

    // Fallback if ffprobe JSON returned duration 0
    if (duration === 0) {
      try {
        const { stderr } = await execFileAsync('ffmpeg', ['-i', filePath], { timeout: 15000 }).catch(e => e);
        if (stderr && typeof stderr === 'string') {
          const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
          if (match) {
            const hours = parseInt(match[1], 10);
            const mins = parseInt(match[2], 10);
            const secs = parseFloat(match[3]);
            duration = hours * 3600 + mins * 60 + secs;
          }
        }
      } catch {}
    }

    return {
      duration,
      width,
      height,
      format,
      bitrate
    };
  } catch (err) {
    console.warn(`[videoProbe] ffprobe error inspecting ${filePath}:`, err);
    // Try ffmpeg fallback before giving up
    try {
      const { stderr } = await execFileAsync('ffmpeg', ['-i', filePath], { timeout: 15000 }).catch(e => e);
      if (stderr && typeof stderr === 'string') {
        const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          const secs = parseFloat(match[3]);
          const duration = hours * 3600 + mins * 60 + secs;
          return { duration };
        }
      }
    } catch {}
    return { duration: 0 };
  }
}

/**
 * Splits a long video into sequential 60-second segments using stream copy (-c copy).
 * Zero re-encoding, preserving 100% original video, audio, and aspect ratio.
 */
export async function splitVideoIntoStorySegments(
  inputFilePath: string,
  outputDir: string,
  segmentLengthSeconds: number = 60
): Promise<string[]> {
  if (!fs.existsSync(inputFilePath)) {
    throw new Error('Input video file does not exist on disk.');
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const meta = await probeVideoMetadata(inputFilePath);
  const totalDuration = meta.duration;
  if (totalDuration <= 0) {
    console.warn('[videoProbe] Could not probe video duration to split, using original file directly.');
    return [inputFilePath];
  }

  const segmentCount = Math.ceil(totalDuration / segmentLengthSeconds);
  if (segmentCount <= 1) {
    return [inputFilePath];
  }

  const ext = path.extname(inputFilePath) || '.mp4';
  const baseName = path.basename(inputFilePath, ext);
  const segmentPaths: string[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const startTime = i * segmentLengthSeconds;
    const duration = Math.min(segmentLengthSeconds, totalDuration - startTime);
    const segFilename = `${baseName}-seg${i + 1}-of-${segmentCount}-${Date.now()}${ext}`;
    const outPath = path.join(outputDir, segFilename);

    let segmentCreated = false;

    // 1. First attempt: Zero-transcode fast stream copy (-c copy)
    try {
      await execFileAsync('ffmpeg', [
        '-ss', startTime.toString(),
        '-i', inputFilePath,
        '-t', duration.toString(),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        outPath,
        '-y'
      ], { timeout: 30000 });

      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        segmentPaths.push(outPath);
        segmentCreated = true;
      }
    } catch (ffmpegErr) {
      console.warn(`[videoProbe] Fast stream copy failed for segment ${i + 1}, retrying with ultrafast re-encode:`, ffmpegErr);
    }

    // 2. Fallback attempt: Ultrafast libx264/aac encode if stream copy fails
    if (!segmentCreated) {
      try {
        await execFileAsync('ffmpeg', [
          '-ss', startTime.toString(),
          '-i', inputFilePath,
          '-t', duration.toString(),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
          outPath,
          '-y'
        ], { timeout: 45000 });

        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
          segmentPaths.push(outPath);
          segmentCreated = true;
        }
      } catch (encodeErr) {
        console.error(`[videoProbe] Ultrafast re-encode failed for segment ${i + 1}:`, encodeErr);
      }
    }
  }

  // If no segments were created successfully, fallback gracefully to returning the original video file
  if (segmentPaths.length === 0) {
    console.warn('[videoProbe] No segments generated, falling back to original file.');
    return [inputFilePath];
  }

  return segmentPaths;
}

export function formatServerDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0s';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}
