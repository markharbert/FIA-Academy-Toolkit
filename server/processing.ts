import { storage } from "./storage";
import { convertToMp4, generateThumbnail, extractAudio } from "./ffmpeg";
import { transcribeAudio, scoreTranscript, generateTitle } from "./ai";
import type { ProcessingStatus, GoalType } from "@shared/schema";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

type ProgressListener = (data: {
  status: ProcessingStatus;
  progress: number;
  message: string;
  error?: string;
}) => void;

const sessionListeners = new Map<string, Set<ProgressListener>>();

export function subscribeToSession(sessionId: string, listener: ProgressListener) {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Set());
  }
  sessionListeners.get(sessionId)!.add(listener);
  
  return () => {
    const listeners = sessionListeners.get(sessionId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        sessionListeners.delete(sessionId);
      }
    }
  };
}

function notifyListeners(sessionId: string, data: {
  status: ProcessingStatus;
  progress: number;
  message: string;
  error?: string;
}) {
  const listeners = sessionListeners.get(sessionId);
  if (listeners) {
    listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error("[Processing] Listener error:", err);
      }
    });
  }
}

async function updateProcessingStatus(
  sessionId: string,
  status: ProcessingStatus,
  progress: number,
  message: string,
  error?: string
) {
  const now = new Date();
  const updates: any = {
    processingStatus: status,
    processingProgress: progress,
    processingMessage: message,
    processingUpdatedAt: now,
    processingError: error || null,
  };
  
  if (status === "ready" || status === "failed") {
    updates.processingCompletedAt = now;
  }
  
  await storage.updateSession(sessionId, updates);
  notifyListeners(sessionId, { status, progress, message, error });
}

export async function processSession(sessionId: string, userId: string): Promise<void> {
  console.log(`[Processing] Starting processing for session ${sessionId}`);
  
  try {
    const session = await storage.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    if (session.userId !== userId) {
      throw new Error("Access denied");
    }
    
    await storage.updateSession(sessionId, {
      processingStartedAt: new Date(),
    });
    
    if (!session.videoPath) {
      await updateProcessingStatus(sessionId, "failed", 0, "No video uploaded", "No video file found");
      return;
    }
    
    const videoFullPath = path.join(UPLOADS_DIR, session.videoPath);
    let mp4Path = videoFullPath;
    let currentVideoPath = session.videoPath;
    
    await updateProcessingStatus(sessionId, "transcoding", 20, "Converting video to MP4...");
    
    if (!session.videoPath.endsWith(".mp4")) {
      const conversionResult = await convertToMp4(videoFullPath, UPLOADS_DIR);
      
      if (!conversionResult.success) {
        await updateProcessingStatus(sessionId, "failed", 20, "Video conversion failed", conversionResult.error);
        return;
      }
      
      mp4Path = path.join(UPLOADS_DIR, conversionResult.outputPath!);
      currentVideoPath = conversionResult.outputPath!;
      const stat = fs.statSync(mp4Path);
      
      await storage.updateSession(sessionId, {
        videoPath: currentVideoPath,
        videoMimeType: "video/mp4",
        videoSizeBytes: stat.size,
        finalVideoPath: currentVideoPath,
      });
    } else {
      await storage.updateSession(sessionId, {
        finalVideoPath: session.videoPath,
      });
    }
    
    await updateProcessingStatus(sessionId, "transcoding", 35, "Generating thumbnail...");
    
    if (!session.thumbnailPath) {
      const thumbnailResult = await generateThumbnail(mp4Path, UPLOADS_DIR);
      if (thumbnailResult.success) {
        await storage.updateSession(sessionId, {
          thumbnailPath: thumbnailResult.thumbnailPath,
        });
      }
    }
    
    await updateProcessingStatus(sessionId, "transcribing", 45, "Extracting audio...");
    
    const audioResult = await extractAudio(mp4Path, UPLOADS_DIR);
    if (!audioResult.success) {
      await updateProcessingStatus(sessionId, "failed", 45, "Audio extraction failed", audioResult.error);
      return;
    }
    
    const audioPath = path.join(UPLOADS_DIR, audioResult.audioPath!);
    
    await updateProcessingStatus(sessionId, "transcribing", 55, "Transcribing audio...");
    
    try {
      const transcript = await transcribeAudio(audioPath);
      
      await storage.updateSession(sessionId, {
        transcriptText: transcript,
      });
      
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } catch {}
      
      await updateProcessingStatus(sessionId, "scoring", 75, "Analyzing video content...");
      
      const updatedSession = await storage.getSession(sessionId);
      const finalTranscript = updatedSession?.transcriptEditedText || transcript;
      
      if (finalTranscript && finalTranscript.length > 0) {
        const scoreResult = await scoreTranscript(
          finalTranscript,
          session.goalType as GoalType,
          session.durationSeconds || 60
        );
        
        await storage.updateSession(sessionId, {
          scoreJson: scoreResult,
          scoreUpdatedAt: new Date(),
        });
        
        await updateProcessingStatus(sessionId, "scoring", 90, "Generating title...");
        
        if (!session.title && finalTranscript.length > 10) {
          try {
            const aiTitle = await generateTitle(finalTranscript);
            await storage.updateSession(sessionId, {
              title: aiTitle,
              titleSource: "ai",
              titleGeneratedAt: new Date(),
            });
          } catch (titleErr) {
            console.warn("[Processing] Failed to generate title:", titleErr);
          }
        }
      }
      
      await updateProcessingStatus(sessionId, "ready", 100, "Processing complete");
      console.log(`[Processing] Session ${sessionId} processing complete`);
      
    } catch (transcribeErr) {
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } catch {}
      throw transcribeErr;
    }
    
  } catch (err) {
    console.error(`[Processing] Error processing session ${sessionId}:`, err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    await updateProcessingStatus(sessionId, "failed", 0, "Processing failed", errorMessage);
  }
}
