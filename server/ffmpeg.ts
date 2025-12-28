import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import type { FFProbeResult } from "@shared/schema";

const MAX_DURATION_SECONDS = 1800; // 30 minutes

// Supported video formats for upload
export const SUPPORTED_VIDEO_EXTENSIONS = [
  ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".wmv",
  ".flv", ".3gp", ".mpeg", ".mpg", ".ts", ".m2ts", ".ogv", ".ogg"
];

export const SUPPORTED_VIDEO_MIMETYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
  "video/x-matroska",
  "video/avi",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/x-flv",
  "video/3gpp",
  "video/mpeg",
  "video/mp2t",
  "video/ogg",
];

export interface ProbeResult {
  success: boolean;
  data?: FFProbeResult;
  hasVideo: boolean;
  hasAudio: boolean;
  duration: number;
  width: number;
  height: number;
  error?: string;
}

export async function probeVideo(inputPath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    if (!fs.existsSync(inputPath)) {
      resolve({ success: false, hasVideo: false, hasAudio: false, duration: 0, width: 0, height: 0, error: "File not found" });
      return;
    }

    const ffprobe = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      inputPath
    ]);

    let stdout = "";
    let stderr = "";

    ffprobe.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        console.error(`[FFprobe] Failed with code ${code}:`, stderr);
        resolve({ 
          success: false, 
          hasVideo: false, 
          hasAudio: false, 
          duration: 0, 
          width: 0, 
          height: 0, 
          error: "Could not analyze video file. Please upload MP4, MOV, or WebM." 
        });
        return;
      }

      try {
        const data = JSON.parse(stdout) as FFProbeResult;
        const videoStream = data.streams?.find((s) => s.codec_type === "video");
        const audioStream = data.streams?.find((s) => s.codec_type === "audio");
        const duration = parseFloat(data.format?.duration || "0");
        
        if (!videoStream) {
          resolve({ 
            success: false, 
            hasVideo: false, 
            hasAudio: !!audioStream, 
            duration, 
            width: 0, 
            height: 0, 
            error: "No video stream found in file" 
          });
          return;
        }

        if (duration > MAX_DURATION_SECONDS) {
          resolve({ 
            success: false, 
            hasVideo: true, 
            hasAudio: !!audioStream, 
            duration, 
            width: videoStream.width || 0, 
            height: videoStream.height || 0, 
            error: `Video too long (${Math.round(duration)}s). Maximum is ${MAX_DURATION_SECONDS / 60} minutes.` 
          });
          return;
        }

        if (duration === 0) {
          resolve({ 
            success: false, 
            hasVideo: true, 
            hasAudio: !!audioStream, 
            duration, 
            width: videoStream.width || 0, 
            height: videoStream.height || 0, 
            error: "Video has zero duration" 
          });
          return;
        }

        resolve({
          success: true,
          data,
          hasVideo: true,
          hasAudio: !!audioStream,
          duration,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
        });

      } catch (parseErr) {
        console.error(`[FFprobe] JSON parse error:`, parseErr);
        resolve({ 
          success: false, 
          hasVideo: false, 
          hasAudio: false, 
          duration: 0, 
          width: 0, 
          height: 0, 
          error: "Could not parse video metadata" 
        });
      }
    });

    ffprobe.on("error", (err) => {
      console.error(`[FFprobe] Process error:`, err);
      resolve({ 
        success: false, 
        hasVideo: false, 
        hasAudio: false, 
        duration: 0, 
        width: 0, 
        height: 0, 
        error: "FFprobe process failed to start" 
      });
    });
  });
}

export interface ConversionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface ThumbnailResult {
  success: boolean;
  thumbnailPath?: string;
  error?: string;
}

async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      inputPath
    ]);

    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        resolve(0);
      }
    });

    ffprobe.on("error", () => resolve(0));
  });
}

async function getVideoResolution(inputPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0",
      inputPath
    ]);

    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const [width, height] = output.trim().split("x").map(Number);
        resolve({ width: width || 0, height: height || 0 });
      } else {
        resolve({ width: 0, height: 0 });
      }
    });

    ffprobe.on("error", () => resolve({ width: 0, height: 0 }));
  });
}

export async function convertToMp4(inputPath: string, uploadsDir: string): Promise<ConversionResult> {
  try {
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: "Input file not found" };
    }

    const duration = await getVideoDuration(inputPath);
    if (duration > MAX_DURATION_SECONDS) {
      return { success: false, error: `Video too long (${Math.round(duration)}s). Maximum is ${MAX_DURATION_SECONDS}s.` };
    }

    const resolution = await getVideoResolution(inputPath);
    const inputFilename = path.basename(inputPath);
    const outputFilename = inputFilename.replace(/\.[^.]+$/, ".mp4");
    const outputPath = path.join(uploadsDir, outputFilename);

    const shouldScale = resolution.width >= 1800 || resolution.height >= 1000;

    const ffmpegArgs = [
      "-i", inputPath,
      "-c:v", "libx264",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-crf", "23",
      "-preset", "medium",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y"
    ];

    if (shouldScale) {
      ffmpegArgs.push(
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
      );
    }

    ffmpegArgs.push(outputPath);

    console.log(`[FFmpeg] Converting ${inputFilename} to MP4...`);
    console.log(`[FFmpeg] Input resolution: ${resolution.width}x${resolution.height}`);
    console.log(`[FFmpeg] Will scale to 1080p: ${shouldScale}`);

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          console.log(`[FFmpeg] Conversion successful: ${outputFilename}`);
          
          try {
            if (inputPath !== outputPath && fs.existsSync(inputPath)) {
              fs.unlinkSync(inputPath);
              console.log(`[FFmpeg] Deleted original file: ${inputFilename}`);
            }
          } catch (err) {
            console.error(`[FFmpeg] Failed to delete original file:`, err);
          }

          resolve({ success: true, outputPath: outputFilename });
        } else {
          console.error(`[FFmpeg] Conversion failed with code ${code}`);
          console.error(`[FFmpeg] stderr: ${stderr.slice(-1000)}`);
          resolve({ success: false, error: "Video conversion failed" });
        }
      });

      ffmpeg.on("error", (err) => {
        console.error(`[FFmpeg] Process error:`, err);
        resolve({ success: false, error: "FFmpeg process failed to start" });
      });
    });
  } catch (err) {
    console.error(`[FFmpeg] Unexpected error:`, err);
    return { success: false, error: "Unexpected error during conversion" };
  }
}

export interface PreviewResult {
  success: boolean;
  outputPath?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  error?: string;
}

/**
 * Generate a fast, lightweight preview MP4 optimized for browser playback.
 * Settings: 480p, H.264 baseline, AAC 128k, ultrafast preset, faststart
 * Goal: Fastest possible generation while maintaining usable quality for transcription
 */
export async function generatePreview(inputPath: string, uploadsDir: string): Promise<PreviewResult> {
  try {
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: "Input file not found" };
    }

    const inputFilename = path.basename(inputPath);
    const previewFilename = inputFilename.replace(/\.[^.]+$/, "_preview.mp4");
    const outputPath = path.join(uploadsDir, previewFilename);

    console.log(`[FFmpeg] Generating fast preview for ${inputFilename}...`);
    const startTime = Date.now();

    // Get input resolution to calculate proper scaling
    const resolution = await getVideoResolution(inputPath);
    console.log(`[FFmpeg] Input resolution: ${resolution.width}x${resolution.height}`);

    // Scale to 480p height, maintaining aspect ratio
    // Use -2 to ensure width is divisible by 2 (required by H.264)
    const scaleFilter = "scale=-2:480";

    const ffmpegArgs = [
      "-i", inputPath,
      "-c:v", "libx264",
      "-profile:v", "baseline",     // Maximum compatibility
      "-level", "3.0",
      "-pix_fmt", "yuv420p",
      "-crf", "28",                  // Higher CRF = smaller file, still good for transcription
      "-preset", "ultrafast",        // Fastest encoding
      "-tune", "fastdecode",         // Optimize for fast decoding
      "-vf", scaleFilter,
      "-r", "24",                    // Cap at 24 fps
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",                    // Stereo audio
      "-ar", "44100",                // Standard sample rate
      "-movflags", "+faststart",     // Enable streaming
      "-y",
      outputPath
    ];

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", async (code) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (code === 0 && fs.existsSync(outputPath)) {
          const stat = fs.statSync(outputPath);
          const duration = await getVideoDuration(outputPath);
          console.log(`[FFmpeg] Preview generated in ${elapsed}s: ${previewFilename} (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);
          resolve({ 
            success: true, 
            outputPath: previewFilename,
            sizeBytes: stat.size,
            durationSeconds: Math.round(duration)
          });
        } else {
          console.error(`[FFmpeg] Preview generation failed with code ${code}`);
          console.error(`[FFmpeg] stderr: ${stderr.slice(-1000)}`);
          resolve({ success: false, error: "Preview generation failed" });
        }
      });

      ffmpeg.on("error", (err) => {
        console.error(`[FFmpeg] Preview process error:`, err);
        resolve({ success: false, error: "FFmpeg process failed to start" });
      });
    });
  } catch (err) {
    console.error(`[FFmpeg] Unexpected preview error:`, err);
    return { success: false, error: "Unexpected error during preview generation" };
  }
}

export interface AudioResult {
  success: boolean;
  audioPath?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  error?: string;
}

/**
 * Fast audio extraction optimized for speech transcription.
 * Uses mono, 16kHz sample rate, and MP3 compression for minimum file size
 * while maintaining speech recognition quality.
 * This is MUCH faster than extracting from a transcoded preview.
 */
export async function extractAudioFast(videoPath: string, uploadsDir: string): Promise<AudioResult> {
  try {
    if (!fs.existsSync(videoPath)) {
      return { success: false, error: "Video file not found" };
    }

    const inputFilename = path.basename(videoPath);
    const audioFilename = inputFilename.replace(/\.[^.]+$/, "_audio_fast.mp3");
    const audioPath = path.join(uploadsDir, audioFilename);

    console.log(`[FFmpeg] Fast audio extraction from ${inputFilename}...`);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", videoPath,
        "-vn",                    // No video
        "-map", "0:a:0",          // Map first audio stream only (fastest)
        "-acodec", "libmp3lame",
        "-ac", "1",               // Mono (half the data, fine for speech)
        "-ar", "16000",           // 16kHz sample rate (optimal for speech recognition)
        "-b:a", "64k",            // 64kbps bitrate (small file, good speech quality)
        "-y",
        audioPath,
      ]);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", async (code) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (code === 0 && fs.existsSync(audioPath)) {
          const stat = fs.statSync(audioPath);
          const duration = await getVideoDuration(audioPath);
          console.log(`[FFmpeg] Fast audio extracted in ${elapsed}s: ${audioFilename} (${(stat.size / 1024 / 1024).toFixed(2)}MB, ${Math.round(duration)}s)`);
          resolve({ 
            success: true, 
            audioPath: audioFilename,
            durationSeconds: Math.round(duration),
            sizeBytes: stat.size
          });
        } else {
          console.error(`[FFmpeg] Fast audio extraction failed in ${elapsed}s:`, stderr.slice(-500));
          resolve({ success: false, error: "Audio extraction failed - no audio track found" });
        }
      });

      ffmpeg.on("error", (err) => {
        console.error(`[FFmpeg] Fast audio extraction process error:`, err);
        resolve({ success: false, error: "FFmpeg process failed to start" });
      });
    });
  } catch (err) {
    console.error(`[FFmpeg] Unexpected fast audio extraction error:`, err);
    return { success: false, error: "Unexpected error during audio extraction" };
  }
}

export async function extractAudio(videoPath: string, uploadsDir: string): Promise<AudioResult> {
  try {
    if (!fs.existsSync(videoPath)) {
      return { success: false, error: "Video file not found" };
    }

    const inputFilename = path.basename(videoPath);
    const audioFilename = inputFilename.replace(/\.[^.]+$/, "_audio.mp3");
    const audioPath = path.join(uploadsDir, audioFilename);

    console.log(`[FFmpeg] Extracting audio from ${inputFilename}...`);

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", videoPath,
        "-vn",
        "-acodec", "libmp3lame",
        "-q:a", "4",
        "-y",
        audioPath,
      ]);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0 && fs.existsSync(audioPath)) {
          const stat = fs.statSync(audioPath);
          console.log(`[FFmpeg] Audio extracted: ${audioFilename} (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);
          resolve({ success: true, audioPath: audioFilename });
        } else {
          console.error(`[FFmpeg] Audio extraction failed:`, stderr.slice(-500));
          resolve({ success: false, error: "Audio extraction failed" });
        }
      });

      ffmpeg.on("error", (err) => {
        console.error(`[FFmpeg] Audio extraction process error:`, err);
        resolve({ success: false, error: "FFmpeg process failed to start" });
      });
    });
  } catch (err) {
    console.error(`[FFmpeg] Unexpected audio extraction error:`, err);
    return { success: false, error: "Unexpected error during audio extraction" };
  }
}

export async function generateThumbnail(videoPath: string, uploadsDir: string): Promise<ThumbnailResult> {
  try {
    if (!fs.existsSync(videoPath)) {
      return { success: false, error: "Video file not found" };
    }

    const inputFilename = path.basename(videoPath);
    const thumbnailFilename = inputFilename.replace(/\.[^.]+$/, "_thumb.jpg");
    const thumbnailPath = path.join(uploadsDir, thumbnailFilename);

    console.log(`[FFmpeg] Generating thumbnail for ${inputFilename}...`);

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", videoPath,
        "-ss", "00:00:01",
        "-vframes", "1",
        "-vf", "scale=320:-1",
        "-q:v", "3",
        "-y",
        thumbnailPath
      ]);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0 && fs.existsSync(thumbnailPath)) {
          console.log(`[FFmpeg] Thumbnail generated: ${thumbnailFilename}`);
          resolve({ success: true, thumbnailPath: thumbnailFilename });
        } else {
          const ffmpegRetry = spawn("ffmpeg", [
            "-i", videoPath,
            "-ss", "00:00:00",
            "-vframes", "1",
            "-vf", "scale=320:-1",
            "-q:v", "3",
            "-y",
            thumbnailPath
          ]);

          ffmpegRetry.on("close", (retryCode) => {
            if (retryCode === 0 && fs.existsSync(thumbnailPath)) {
              console.log(`[FFmpeg] Thumbnail generated (retry at 0s): ${thumbnailFilename}`);
              resolve({ success: true, thumbnailPath: thumbnailFilename });
            } else {
              console.error(`[FFmpeg] Thumbnail generation failed`);
              resolve({ success: false, error: "Thumbnail generation failed" });
            }
          });

          ffmpegRetry.on("error", () => {
            resolve({ success: false, error: "FFmpeg process failed" });
          });
        }
      });

      ffmpeg.on("error", (err) => {
        console.error(`[FFmpeg] Thumbnail process error:`, err);
        resolve({ success: false, error: "FFmpeg process failed to start" });
      });
    });
  } catch (err) {
    console.error(`[FFmpeg] Unexpected thumbnail error:`, err);
    return { success: false, error: "Unexpected error during thumbnail generation" };
  }
}

export interface PosterResult {
  success: boolean;
  posterPath?: string;
  error?: string;
}

export async function generatePoster(videoPath: string, uploadsDir: string, sessionId: string): Promise<PosterResult> {
  try {
    if (!fs.existsSync(videoPath)) {
      return { success: false, error: "Video file not found" };
    }

    const posterFilename = `poster_${sessionId}.jpg`;
    const posterPath = path.join(uploadsDir, posterFilename);

    console.log(`[FFmpeg] Generating poster for session ${sessionId}...`);

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", videoPath,
        "-ss", "0.5",
        "-vframes", "1",
        "-vf", "scale=640:-1",
        "-q:v", "2",
        "-y",
        posterPath
      ]);

      let stderr = "";
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (code === 0 && fs.existsSync(posterPath)) {
          console.log(`[FFmpeg] Poster generated: ${posterFilename}`);
          resolve({ success: true, posterPath: posterFilename });
        } else {
          const ffmpegRetry = spawn("ffmpeg", [
            "-i", videoPath,
            "-ss", "1.0",
            "-vframes", "1",
            "-vf", "scale=640:-1",
            "-q:v", "2",
            "-y",
            posterPath
          ]);

          ffmpegRetry.on("close", (retryCode) => {
            if (retryCode === 0 && fs.existsSync(posterPath)) {
              console.log(`[FFmpeg] Poster generated (retry at 1s): ${posterFilename}`);
              resolve({ success: true, posterPath: posterFilename });
            } else {
              const ffmpegFallback = spawn("ffmpeg", [
                "-i", videoPath,
                "-ss", "0",
                "-vframes", "1",
                "-vf", "scale=640:-1",
                "-q:v", "2",
                "-y",
                posterPath
              ]);

              ffmpegFallback.on("close", (fallbackCode) => {
                if (fallbackCode === 0 && fs.existsSync(posterPath)) {
                  console.log(`[FFmpeg] Poster generated (fallback at 0s): ${posterFilename}`);
                  resolve({ success: true, posterPath: posterFilename });
                } else {
                  console.error(`[FFmpeg] Poster generation failed`);
                  resolve({ success: false, error: "Poster generation failed" });
                }
              });

              ffmpegFallback.on("error", () => {
                resolve({ success: false, error: "FFmpeg process failed" });
              });
            }
          });

          ffmpegRetry.on("error", () => {
            resolve({ success: false, error: "FFmpeg process failed" });
          });
        }
      });

      ffmpeg.on("error", (err) => {
        console.error(`[FFmpeg] Poster process error:`, err);
        resolve({ success: false, error: "FFmpeg process failed to start" });
      });
    });
  } catch (err) {
    console.error(`[FFmpeg] Unexpected poster error:`, err);
    return { success: false, error: "Unexpected error during poster generation" };
  }
}

export interface TimelineFramesResult {
  success: boolean;
  framePaths?: string[];
  error?: string;
}

export async function generateTimelineFrames(
  videoPath: string,
  uploadsDir: string,
  sessionId: string,
  durationSeconds: number,
  frameCount: number = 12
): Promise<TimelineFramesResult> {
  try {
    if (!fs.existsSync(videoPath)) {
      return { success: false, error: "Video file not found" };
    }

    if (durationSeconds <= 0) {
      return { success: false, error: "Invalid video duration" };
    }

    console.log(`[FFmpeg] Generating ${frameCount} timeline frames for session ${sessionId}...`);

    const frameDir = path.join(uploadsDir, `timeline_${sessionId}`);
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const framePaths: string[] = [];
    const interval = durationSeconds / (frameCount + 1);

    const extractFrame = (index: number, timestamp: number): Promise<string | null> => {
      return new Promise((resolve) => {
        const frameFilename = `frame_${sessionId}_${String(index).padStart(2, '0')}.jpg`;
        const framePath = path.join(frameDir, frameFilename);
        const relativeFramePath = `timeline_${sessionId}/${frameFilename}`;

        const ffmpeg = spawn("ffmpeg", [
          "-ss", String(Math.max(0, timestamp)),
          "-i", videoPath,
          "-vframes", "1",
          "-vf", "scale=160:-1",
          "-q:v", "3",
          "-y",
          framePath
        ]);

        ffmpeg.on("close", (code) => {
          if (code === 0 && fs.existsSync(framePath)) {
            resolve(relativeFramePath);
          } else {
            resolve(null);
          }
        });

        ffmpeg.on("error", () => {
          resolve(null);
        });
      });
    };

    const extractionPromises: Promise<string | null>[] = [];
    for (let i = 0; i < frameCount; i++) {
      const timestamp = interval * (i + 1);
      extractionPromises.push(extractFrame(i, timestamp));
    }

    const results = await Promise.all(extractionPromises);
    
    for (const result of results) {
      if (result) {
        framePaths.push(result);
      }
    }

    if (framePaths.length === 0) {
      console.error(`[FFmpeg] No timeline frames could be extracted`);
      return { success: false, error: "Failed to extract any frames" };
    }

    console.log(`[FFmpeg] Generated ${framePaths.length}/${frameCount} timeline frames`);
    return { success: true, framePaths };
  } catch (err) {
    console.error(`[FFmpeg] Unexpected timeline frames error:`, err);
    return { success: false, error: "Unexpected error during timeline frame generation" };
  }
}

export interface HlsResult {
  success: boolean;
  playlistPath?: string;
  hlsDir?: string;
  error?: string;
}

export interface HlsProgressCallback {
  onPlayable?: (playlistPath: string, hlsDir: string) => void;
  onComplete?: (playlistPath: string, hlsDir: string) => void;
  onError?: (error: string) => void;
}

export async function generateHlsPreview(
  inputPath: string,
  uploadsDir: string,
  sessionId: string,
  callbacks?: HlsProgressCallback
): Promise<HlsResult> {
  try {
    if (!fs.existsSync(inputPath)) {
      callbacks?.onError?.("Input file not found");
      return { success: false, error: "Input file not found" };
    }

    const hlsDirName = `hls_${sessionId}`;
    const hlsDir = path.join(uploadsDir, hlsDirName);
    
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }

    const playlistPath = path.join(hlsDir, "preview.m3u8");
    const segmentPattern = path.join(hlsDir, "segment_%04d.m4s");
    const initSegment = path.join(hlsDir, "init.mp4");

    console.log(`[FFmpeg] Generating HLS preview for session ${sessionId}...`);
    const startTime = Date.now();

    const resolution = await getVideoResolution(inputPath);
    console.log(`[FFmpeg] Input resolution: ${resolution.width}x${resolution.height}`);

    const fps = 24;
    const segmentDuration = 2;
    const gopSize = fps * segmentDuration;

    const ffmpegArgs = [
      "-i", inputPath,
      "-c:v", "libx264",
      "-profile:v", "baseline",
      "-level", "3.0",
      "-pix_fmt", "yuv420p",
      "-crf", "30",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-vf", "scale=-2:360",
      "-r", String(fps),
      "-g", String(gopSize),
      "-keyint_min", String(gopSize),
      "-sc_threshold", "0",
      "-c:a", "aac",
      "-b:a", "96k",
      "-ac", "2",
      "-ar", "44100",
      "-f", "hls",
      "-hls_time", String(segmentDuration),
      "-hls_list_size", "0",
      "-hls_flags", "append_list+omit_endlist+independent_segments+temp_file",
      "-hls_segment_type", "fmp4",
      "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", segmentPattern,
      "-y",
      playlistPath
    ];

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);

      let stderr = "";
      let playableNotified = false;
      let checkInterval: NodeJS.Timeout | null = null;

      const checkForFirstSegment = () => {
        if (playableNotified) return;
        
        try {
          const files = fs.readdirSync(hlsDir);
          const hasPlaylist = files.includes("preview.m3u8");
          const hasInit = files.includes("init.mp4");
          const hasSegment = files.some(f => f.startsWith("segment_") && f.endsWith(".m4s"));
          
          if (hasPlaylist && hasInit && hasSegment) {
            playableNotified = true;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[FFmpeg] HLS preview playable in ${elapsed}s`);
            callbacks?.onPlayable?.(path.join(hlsDirName, "preview.m3u8"), hlsDirName);
          }
        } catch (err) {
        }
      };

      checkInterval = setInterval(checkForFirstSegment, 500);

      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpeg.on("close", (code) => {
        if (checkInterval) clearInterval(checkInterval);
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (code === 0 && fs.existsSync(playlistPath)) {
          console.log(`[FFmpeg] HLS preview complete in ${elapsed}s`);
          
          try {
            let playlistContent = fs.readFileSync(playlistPath, "utf-8");
            if (!playlistContent.includes("#EXT-X-ENDLIST")) {
              playlistContent += "\n#EXT-X-ENDLIST\n";
              fs.writeFileSync(playlistPath, playlistContent);
            }
          } catch (err) {
            console.warn("[FFmpeg] Failed to finalize playlist:", err);
          }

          callbacks?.onComplete?.(path.join(hlsDirName, "preview.m3u8"), hlsDirName);
          resolve({ 
            success: true, 
            playlistPath: path.join(hlsDirName, "preview.m3u8"),
            hlsDir: hlsDirName
          });
        } else {
          console.error(`[FFmpeg] HLS generation failed with code ${code}`);
          console.error(`[FFmpeg] stderr: ${stderr.slice(-1000)}`);
          const errorMsg = "HLS preview generation failed";
          callbacks?.onError?.(errorMsg);
          resolve({ success: false, error: errorMsg });
        }
      });

      ffmpeg.on("error", (err) => {
        if (checkInterval) clearInterval(checkInterval);
        console.error(`[FFmpeg] HLS process error:`, err);
        const errorMsg = "FFmpeg process failed to start";
        callbacks?.onError?.(errorMsg);
        resolve({ success: false, error: errorMsg });
      });
    });
  } catch (err) {
    console.error(`[FFmpeg] Unexpected HLS error:`, err);
    callbacks?.onError?.("Unexpected error during HLS generation");
    return { success: false, error: "Unexpected error during HLS generation" };
  }
}
