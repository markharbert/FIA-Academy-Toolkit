import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
}

export interface YouTubeDownloadResult {
  success: boolean;
  audioPath?: string;
  thumbnailPath?: string;
  videoInfo?: YouTubeVideoInfo;
  error?: string;
}

const YOUTUBE_URL_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(&.*)?$/;

export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_REGEX);
  if (match && match[4]) {
    return match[4];
  }
  
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube.com")) {
      return urlObj.searchParams.get("v");
    } else if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1).split("?")[0];
    }
  } catch {
    return null;
  }
  return null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export async function getYouTubeVideoInfo(url: string): Promise<YouTubeVideoInfo | null> {
  return new Promise((resolve) => {
    const ytdlp = spawn("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      url
    ]);

    let stdout = "";
    let stderr = "";

    ytdlp.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ytdlp.on("close", (code) => {
      if (code !== 0) {
        console.error(`[yt-dlp] Failed to get video info:`, stderr);
        resolve(null);
        return;
      }

      try {
        const info = JSON.parse(stdout);
        resolve({
          id: info.id,
          title: info.title || "Untitled Video",
          duration: Math.round(info.duration || 0),
          thumbnailUrl: info.thumbnail || `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`
        });
      } catch (err) {
        console.error(`[yt-dlp] Failed to parse video info:`, err);
        resolve(null);
      }
    });

    ytdlp.on("error", (err) => {
      console.error(`[yt-dlp] Process error:`, err);
      resolve(null);
    });
  });
}

export async function downloadYouTubeAudio(
  url: string, 
  outputDir: string = UPLOADS_DIR
): Promise<YouTubeDownloadResult> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return { success: false, error: "Invalid YouTube URL" };
  }

  const videoInfo = await getYouTubeVideoInfo(url);
  if (!videoInfo) {
    return { success: false, error: "Could not fetch video information. The video may be private, age-restricted, or unavailable." };
  }

  if (videoInfo.duration > 1800) {
    return { success: false, error: `Video too long (${Math.round(videoInfo.duration / 60)} minutes). Maximum is 30 minutes.` };
  }

  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const audioFilename = `yt_${videoId}_${uniqueSuffix}.m4a`;
  const audioPath = path.join(outputDir, audioFilename);
  const thumbnailFilename = `yt_${videoId}_${uniqueSuffix}_thumb.jpg`;
  const thumbnailPath = path.join(outputDir, thumbnailFilename);

  return new Promise((resolve) => {
    console.log(`[yt-dlp] Downloading audio for ${videoId}...`);
    
    const ytdlp = spawn("yt-dlp", [
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "--no-playlist",
      "--no-warnings",
      "--write-thumbnail",
      "--convert-thumbnails", "jpg",
      "-o", audioPath.replace(".m4a", ".%(ext)s"),
      url
    ]);

    let stderr = "";
    ytdlp.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ytdlp.stdout.on("data", (data) => {
      console.log(`[yt-dlp] ${data.toString().trim()}`);
    });

    ytdlp.on("close", async (code) => {
      if (code !== 0) {
        console.error(`[yt-dlp] Download failed:`, stderr);
        resolve({ success: false, error: "Failed to download video audio. Please check if the URL is correct and the video is available." });
        return;
      }

      const possibleAudioPaths = [
        audioPath,
        audioPath.replace(".m4a", ".webm"),
        audioPath.replace(".m4a", ".opus"),
        audioPath.replace(".m4a", ".mp3")
      ];
      
      let foundAudioPath: string | undefined;
      for (const p of possibleAudioPaths) {
        if (fs.existsSync(p)) {
          foundAudioPath = p;
          break;
        }
      }

      if (!foundAudioPath) {
        console.error(`[yt-dlp] Audio file not found at expected paths`);
        resolve({ success: false, error: "Downloaded audio file not found" });
        return;
      }

      const possibleThumbPaths = [
        thumbnailPath,
        audioPath.replace(".m4a", ".jpg"),
        audioPath.replace(".m4a", ".webp").replace(".webp", ".jpg"),
        path.join(outputDir, `yt_${videoId}_${uniqueSuffix}.jpg`)
      ];
      
      let foundThumbPath: string | undefined;
      for (const p of possibleThumbPaths) {
        if (fs.existsSync(p)) {
          foundThumbPath = p;
          break;
        }
      }

      if (!foundThumbPath) {
        console.log(`[yt-dlp] Downloading thumbnail separately...`);
        try {
          const https = await import("https");
          const thumbnailUrl = videoInfo.thumbnailUrl;
          
          await new Promise<void>((resolveThumb, rejectThumb) => {
            const file = fs.createWriteStream(thumbnailPath);
            https.get(thumbnailUrl, (response) => {
              response.pipe(file);
              file.on("finish", () => {
                file.close();
                foundThumbPath = thumbnailPath;
                resolveThumb();
              });
            }).on("error", (err) => {
              fs.unlink(thumbnailPath, () => {});
              console.error(`[yt-dlp] Failed to download thumbnail:`, err);
              resolveThumb();
            });
          });
        } catch (thumbErr) {
          console.error(`[yt-dlp] Thumbnail download error:`, thumbErr);
        }
      }

      console.log(`[yt-dlp] Download complete: audio=${path.basename(foundAudioPath)}, thumb=${foundThumbPath ? path.basename(foundThumbPath) : "none"}`);
      
      resolve({
        success: true,
        audioPath: foundAudioPath,
        thumbnailPath: foundThumbPath ? path.basename(foundThumbPath) : undefined,
        videoInfo
      });
    });

    ytdlp.on("error", (err) => {
      console.error(`[yt-dlp] Process error:`, err);
      resolve({ success: false, error: "Failed to start download process" });
    });
  });
}
