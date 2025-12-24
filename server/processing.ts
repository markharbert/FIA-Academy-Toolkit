import { storage } from "./storage";
import { generatePreview, generateThumbnail, extractAudio } from "./ffmpeg";
import { transcribeAudio, scoreTranscript, generateTitle } from "./ai";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import type { ProcessingStatus, GoalType } from "@shared/schema";
import path from "path";
import fs from "fs";

const objectStorageService = new ObjectStorageService();

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

const activeProcessing = new Set<string>();

async function uploadPreviewToCloud(previewPath: string, sessionId: string): Promise<string | null> {
  try {
    const previewFilename = path.basename(previewPath);
    const objectPath = `/objects/.private/previews/${sessionId}/${previewFilename}`;
    
    console.log(`[Processing] Uploading preview to cloud storage: ${objectPath}`);
    
    const fileBuffer = fs.readFileSync(previewPath);
    await objectStorageService.uploadFile(objectPath, fileBuffer);
    
    console.log(`[Processing] Preview uploaded to cloud storage successfully`);
    return objectPath;
  } catch (err) {
    console.error("[Processing] Failed to upload preview to cloud storage:", err);
    return null;
  }
}

async function deleteOriginalUpload(
  sessionId: string, 
  originalUploadPath: string | null,
  originalCloudPath: string | null,
  uploadsDir: string
): Promise<void> {
  try {
    // Delete from cloud storage (original upload only, not preview)
    if (originalCloudPath) {
      console.log(`[Processing] Deleting original from cloud storage: ${originalCloudPath}`);
      try {
        await objectStorageService.deleteObject(originalCloudPath);
        console.log(`[Processing] Original deleted from cloud storage`);
      } catch (cloudErr) {
        console.warn(`[Processing] Failed to delete original from cloud storage:`, cloudErr);
      }
    }
    
    // Delete local original file (not preview)
    if (originalUploadPath) {
      const localOriginalPath = path.join(uploadsDir, originalUploadPath);
      if (fs.existsSync(localOriginalPath)) {
        fs.unlinkSync(localOriginalPath);
        console.log(`[Processing] Deleted local original: ${originalUploadPath}`);
      }
    }
    
    await storage.updateSession(sessionId, {
      originalDeletedAt: new Date(),
    });
  } catch (err) {
    console.error("[Processing] Error deleting original files:", err);
  }
}

export async function processSession(sessionId: string, userId: string): Promise<void> {
  console.log(`[Processing] Starting preview-first processing for session ${sessionId}`);
  
  if (activeProcessing.has(sessionId)) {
    console.log(`[Processing] Session ${sessionId} is already being processed, skipping`);
    return;
  }
  
  try {
    const session = await storage.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    if (session.userId !== userId) {
      throw new Error("Access denied");
    }
    
    if (session.processingStatus === "ready" && session.scoreJson) {
      console.log(`[Processing] Session ${sessionId} already completed, skipping`);
      return;
    }
    
    const inProgressStatuses = ["transcoding", "transcribing", "scoring"];
    if (session.processingStatus && inProgressStatuses.includes(session.processingStatus)) {
      console.log(`[Processing] Session ${sessionId} is already processing (status: ${session.processingStatus}), skipping`);
      return;
    }
    
    activeProcessing.add(sessionId);
    
    await storage.updateSession(sessionId, {
      processingStartedAt: new Date(),
      processingStatus: "transcoding",
      processingProgress: 10,
      processingMessage: "Starting video processing...",
    });
    
    if (!session.videoPath) {
      await updateProcessingStatus(sessionId, "failed", 0, "No video uploaded", "No video file found");
      activeProcessing.delete(sessionId);
      return;
    }
    
    const videoFullPath = path.join(UPLOADS_DIR, session.videoPath);
    
    if (!fs.existsSync(videoFullPath)) {
      if (session.cloudStoragePath) {
        console.log(`[Processing] Local file not found, downloading from cloud storage: ${session.cloudStoragePath}`);
        try {
          await updateProcessingStatus(sessionId, "transcoding", 15, "Downloading video from cloud...");
          const objectFile = await objectStorageService.getObjectEntityFile(session.cloudStoragePath);
          const downloadPath = videoFullPath;
          
          await new Promise<void>((resolve, reject) => {
            const writeStream = fs.createWriteStream(downloadPath);
            const readStream = objectFile.createReadStream();
            readStream.pipe(writeStream);
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
            readStream.on("error", reject);
          });
          
          console.log(`[Processing] Downloaded video from cloud storage`);
        } catch (downloadErr) {
          console.error(`[Processing] Failed to download from cloud storage:`, downloadErr);
          await updateProcessingStatus(sessionId, "failed", 0, "Video file not available", "Could not retrieve video from storage");
          activeProcessing.delete(sessionId);
          return;
        }
      } else {
        await updateProcessingStatus(sessionId, "failed", 0, "Video file not found", "Video file missing from storage");
        activeProcessing.delete(sessionId);
        return;
      }
    }
    
    // Save original paths before we update videoPath to point to preview
    const originalUploadPath = session.originalUploadPath || session.videoPath;
    const originalCloudPath = session.cloudStoragePath;
    
    await updateProcessingStatus(sessionId, "transcoding", 20, "Generating preview video...");
    
    const startTime = Date.now();
    const previewResult = await generatePreview(videoFullPath, UPLOADS_DIR);
    
    if (!previewResult.success) {
      await updateProcessingStatus(sessionId, "failed", 20, "Preview generation failed", previewResult.error);
      activeProcessing.delete(sessionId);
      return;
    }
    
    const previewFullPath = path.join(UPLOADS_DIR, previewResult.outputPath!);
    const previewGenerationTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Processing] Preview ready in ${previewGenerationTime}s`);
    
    const previewCloudPath = await uploadPreviewToCloud(previewFullPath, sessionId);
    
    await storage.updateSession(sessionId, {
      previewVideoPath: previewResult.outputPath,
      previewCloudStoragePath: previewCloudPath,
      previewGeneratedAt: new Date(),
      videoPath: previewResult.outputPath,
      videoMimeType: "video/mp4",
      videoSizeBytes: previewResult.sizeBytes,
      durationSeconds: previewResult.durationSeconds || session.durationSeconds,
      finalVideoPath: previewResult.outputPath,
      finalVideoResolution: "854x480",
    });
    
    console.log(`[Processing] Preview saved, video is now playable`);
    
    await updateProcessingStatus(sessionId, "transcoding", 35, "Generating thumbnail...");
    
    if (!session.thumbnailPath) {
      const thumbnailResult = await generateThumbnail(previewFullPath, UPLOADS_DIR);
      if (thumbnailResult.success) {
        await storage.updateSession(sessionId, {
          thumbnailPath: thumbnailResult.thumbnailPath,
        });
      }
    }
    
    await updateProcessingStatus(sessionId, "transcribing", 45, "Extracting audio...");
    
    const audioResult = await extractAudio(previewFullPath, UPLOADS_DIR);
    if (!audioResult.success) {
      await updateProcessingStatus(sessionId, "failed", 45, "Audio extraction failed", audioResult.error);
      activeProcessing.delete(sessionId);
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
      
      // Delete original upload to save storage (only if preview cloud upload succeeded)
      if (previewCloudPath && !session.originalDeletedAt) {
        console.log(`[Processing] Deleting original upload to save storage...`);
        await deleteOriginalUpload(sessionId, originalUploadPath, originalCloudPath, UPLOADS_DIR);
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
  } finally {
    activeProcessing.delete(sessionId);
  }
}
