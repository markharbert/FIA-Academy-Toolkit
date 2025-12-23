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
        const fullPath = path.join(UPLOADS_DIR, session.videoPath);
        
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`[Cleanup] Deleted video: ${session.videoPath}`);
          }
        } catch (err) {
          console.error(`[Cleanup] Failed to delete file ${session.videoPath}:`, err);
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
