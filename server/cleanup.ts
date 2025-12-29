import { storage } from "./storage";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function cleanupExpiredVideos(): Promise<number> {
  console.log("[Cleanup] Starting expired video cleanup...");
  
  try {
    const expiredSessions = await storage.getExpiredSessions();
    let cleanedCount = 0;

    for (const session of expiredSessions) {
      if (session.videoPath) {
        const videoFullPath = path.join(UPLOADS_DIR, session.videoPath);
        
        try {
          if (fs.existsSync(videoFullPath)) {
            fs.unlinkSync(videoFullPath);
            console.log(`[Cleanup] Deleted video: ${session.videoPath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to delete video ${session.videoPath}:`, err);
        }
      }

      // Skip deleting thumbnails - they are stored permanently in object storage
      // Legacy local thumbnails can be cleaned up manually if needed
      if (session.thumbnailPath && !session.thumbnailPath.startsWith('/objects/')) {
        const thumbFullPath = path.join(UPLOADS_DIR, session.thumbnailPath);
        
        try {
          if (fs.existsSync(thumbFullPath)) {
            fs.unlinkSync(thumbFullPath);
            console.log(`[Cleanup] Deleted local thumbnail: ${session.thumbnailPath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to delete thumbnail ${session.thumbnailPath}:`, err);
        }
      }

      // Delete preview video
      const previewVideoPath = (session as any).previewVideoPath;
      if (previewVideoPath && previewVideoPath !== "failed") {
        const previewFullPath = path.join(UPLOADS_DIR, previewVideoPath);
        
        try {
          if (fs.existsSync(previewFullPath)) {
            fs.unlinkSync(previewFullPath);
            console.log(`[Cleanup] Deleted preview video: ${previewVideoPath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to delete preview video ${previewVideoPath}:`, err);
        }
      }

      // Skip deleting poster image - they are stored permanently in object storage
      // Legacy local posters can be cleaned up manually if needed
      const posterPath = (session as any).previewPosterPath;
      if (posterPath && !posterPath.startsWith('/objects/')) {
        const posterFullPath = path.join(UPLOADS_DIR, posterPath);
        
        try {
          if (fs.existsSync(posterFullPath)) {
            fs.unlinkSync(posterFullPath);
            console.log(`[Cleanup] Deleted local poster: ${posterPath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to delete poster ${posterPath}:`, err);
        }
      }

      // Delete audio file if exists
      const audioPath = (session as any).audioPath;
      if (audioPath) {
        const audioFullPath = path.join(UPLOADS_DIR, audioPath);
        
        try {
          if (fs.existsSync(audioFullPath)) {
            fs.unlinkSync(audioFullPath);
            console.log(`[Cleanup] Deleted audio: ${audioPath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to delete audio ${audioPath}:`, err);
        }
      }

      await storage.markVideoDeleted(session.id);
      cleanedCount++;
    }

    console.log(`[Cleanup] Cleaned up ${cleanedCount} expired sessions`);
    return cleanedCount;
  } catch (err) {
    console.error("[Cleanup] Error during cleanup:", err);
    return 0;
  }
}

export function startCleanupJob(intervalMs: number = 24 * 60 * 60 * 1000): NodeJS.Timeout {
  // Run immediately on startup
  cleanupExpiredVideos();

  // Then run on interval (default: every 24 hours)
  const interval = setInterval(cleanupExpiredVideos, intervalMs);
  
  console.log(`[Cleanup] Scheduled cleanup job to run every ${intervalMs / 1000 / 60} minutes`);
  
  return interval;
}
