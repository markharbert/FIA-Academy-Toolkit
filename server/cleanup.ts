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

      if (session.thumbnailPath) {
        const thumbFullPath = path.join(UPLOADS_DIR, session.thumbnailPath);
        
        try {
          if (fs.existsSync(thumbFullPath)) {
            fs.unlinkSync(thumbFullPath);
            console.log(`[Cleanup] Deleted thumbnail: ${session.thumbnailPath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to delete thumbnail ${session.thumbnailPath}:`, err);
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
