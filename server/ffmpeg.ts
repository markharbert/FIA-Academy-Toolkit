import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const MAX_DURATION_SECONDS = 600;

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
