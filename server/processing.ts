import { storage } from "./storage";
import { generatePreview, generateThumbnail, extractAudioFast, probeVideo } from "./ffmpeg";
import { transcribeAudio, scoreTranscript, generateTitle } from "./ai";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import type { ProcessingStatus, GoalType, InsertProcessingMetric } from "@shared/schema";
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

async function recordMetric(
  sessionId: string, 
  stepName: string, 
  startedAt: Date,
  success: boolean,
  errorSummary?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();
    
    await storage.createProcessingMetric({
      sessionId,
      stepName,
      startedAt,
      endedAt,
      durationMs,
      success,
      errorSummary: errorSummary || null,
      metadata: metadata || null,
    });
    
    console.log(`[Metrics] ${stepName}: ${durationMs}ms (${success ? 'success' : 'failed'})`);
  } catch (err) {
    console.warn("[Metrics] Failed to record metric:", err);
  }
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
    if (originalCloudPath) {
      console.log(`[Processing] Deleting original from cloud storage: ${originalCloudPath}`);
      try {
        await objectStorageService.deleteObject(originalCloudPath);
        console.log(`[Processing] Original deleted from cloud storage`);
      } catch (cloudErr) {
        console.warn(`[Processing] Failed to delete original from cloud storage:`, cloudErr);
      }
    }
    
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

async function generatePreviewInBackground(
  sessionId: string,
  videoFullPath: string,
  originalUploadPath: string | null,
  originalCloudPath: string | null
): Promise<void> {
  console.log(`[Processing] Starting background preview generation for session ${sessionId}`);
  
  try {
    const previewStart = new Date();
    const previewResult = await generatePreview(videoFullPath, UPLOADS_DIR);
    
    if (!previewResult.success) {
      await recordMetric(sessionId, "preview_generation", previewStart, false, previewResult.error);
      console.warn(`[Processing] Background preview generation failed: ${previewResult.error}`);
      await storage.updateSession(sessionId, {
        previewVideoPath: "failed",
        previewGeneratedAt: new Date(),
      });
      return;
    }
    
    await recordMetric(sessionId, "preview_generation", previewStart, true, undefined, {
      sizeBytes: previewResult.sizeBytes,
      durationSeconds: previewResult.durationSeconds,
    });
    
    const previewFullPath = path.join(UPLOADS_DIR, previewResult.outputPath!);
    
    const cloudStart = new Date();
    const previewCloudPath = await uploadPreviewToCloud(previewFullPath, sessionId);
    await recordMetric(sessionId, "preview_cloud_upload", cloudStart, !!previewCloudPath);
    
    await storage.updateSession(sessionId, {
      previewVideoPath: previewResult.outputPath,
      previewCloudStoragePath: previewCloudPath,
      previewGeneratedAt: new Date(),
      videoPath: previewResult.outputPath,
      videoMimeType: "video/mp4",
      videoSizeBytes: previewResult.sizeBytes,
      durationSeconds: previewResult.durationSeconds,
      finalVideoPath: previewResult.outputPath,
      finalVideoResolution: "854x480",
    });
    
    console.log(`[Processing] Background preview ready for session ${sessionId}`);
    
    const thumbnailStart = new Date();
    const thumbnailResult = await generateThumbnail(previewFullPath, UPLOADS_DIR);
    if (thumbnailResult.success) {
      await storage.updateSession(sessionId, {
        thumbnailPath: thumbnailResult.thumbnailPath,
      });
    }
    await recordMetric(sessionId, "thumbnail_generation", thumbnailStart, thumbnailResult.success);
    
    if (previewCloudPath) {
      const deleteStart = new Date();
      await deleteOriginalUpload(sessionId, originalUploadPath, originalCloudPath, UPLOADS_DIR);
      await recordMetric(sessionId, "original_deletion", deleteStart, true);
    }
    
    console.log(`[Processing] Preview generation complete for session ${sessionId}`);
    
  } catch (err) {
    console.error(`[Processing] Background preview error for session ${sessionId}:`, err);
    await recordMetric(sessionId, "preview_generation", new Date(), false, String(err));
    try {
      await storage.updateSession(sessionId, {
        previewVideoPath: "failed",
        previewGeneratedAt: new Date(),
      });
    } catch {}
  }
}

export async function processSession(sessionId: string, userId: string): Promise<void> {
  console.log(`[Processing] Starting AUDIO-FIRST fast path for session ${sessionId}`);
  const pipelineStart = new Date();
  
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
      processingStatus: "transcribing",
      processingProgress: 5,
      processingMessage: "Extracting audio...",
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
        const downloadStart = new Date();
        try {
          await updateProcessingStatus(sessionId, "transcribing", 10, "Downloading video from cloud...");
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
          
          await recordMetric(sessionId, "cloud_download", downloadStart, true);
          console.log(`[Processing] Downloaded video from cloud storage`);
        } catch (downloadErr) {
          await recordMetric(sessionId, "cloud_download", downloadStart, false, String(downloadErr));
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
    
    const originalUploadPath = session.originalUploadPath || session.videoPath;
    const originalCloudPath = session.cloudStoragePath;
    
    await updateProcessingStatus(sessionId, "transcribing", 15, "Extracting audio from video...");
    
    const audioStart = new Date();
    const audioResult = await extractAudioFast(videoFullPath, UPLOADS_DIR);
    
    if (!audioResult.success) {
      await recordMetric(sessionId, "audio_extraction", audioStart, false, audioResult.error);
      await updateProcessingStatus(sessionId, "failed", 15, "Audio extraction failed", audioResult.error);
      activeProcessing.delete(sessionId);
      return;
    }
    
    await recordMetric(sessionId, "audio_extraction", audioStart, true, undefined, {
      durationSeconds: audioResult.durationSeconds,
      sizeBytes: audioResult.sizeBytes,
    });
    
    if (audioResult.durationSeconds) {
      await storage.updateSession(sessionId, {
        durationSeconds: audioResult.durationSeconds,
      });
    }
    
    const audioPath = path.join(UPLOADS_DIR, audioResult.audioPath!);
    
    await updateProcessingStatus(sessionId, "transcribing", 30, "Transcribing audio with AI...");
    
    let transcript: string;
    try {
      const transcribeStart = new Date();
      transcript = await transcribeAudio(audioPath);
      await recordMetric(sessionId, "transcription", transcribeStart, true, undefined, {
        transcriptLength: transcript.length,
      });
      
      await storage.updateSession(sessionId, {
        transcriptText: transcript,
      });
      
      console.log(`[Processing] Transcript ready (${transcript.length} chars)`);
      
    } catch (transcribeErr) {
      await recordMetric(sessionId, "transcription", new Date(), false, String(transcribeErr));
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } catch {}
      throw transcribeErr;
    }
    
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch {}
    
    await updateProcessingStatus(sessionId, "scoring", 60, "Analyzing video content with AI...");
    
    const updatedSession = await storage.getSession(sessionId);
    const finalTranscript = updatedSession?.transcriptEditedText || transcript;
    
    if (finalTranscript && finalTranscript.length > 0) {
      try {
        const scoreStart = new Date();
        const scoreResult = await scoreTranscript(
          finalTranscript,
          session.goalType as GoalType,
          audioResult.durationSeconds || session.durationSeconds || 60
        );
        await recordMetric(sessionId, "scoring", scoreStart, true);
        
        await storage.updateSession(sessionId, {
          scoreJson: scoreResult,
          scoreUpdatedAt: new Date(),
        });
        
        console.log(`[Processing] Score ready: ${scoreResult.totalScore}/100`);
        
      } catch (scoreErr) {
        await recordMetric(sessionId, "scoring", new Date(), false, String(scoreErr));
        console.error("[Processing] Scoring failed:", scoreErr);
      }
      
      await updateProcessingStatus(sessionId, "scoring", 85, "Generating title...");
      
      if (!session.title && finalTranscript.length > 10) {
        try {
          const titleStart = new Date();
          const aiTitle = await generateTitle(finalTranscript);
          await storage.updateSession(sessionId, {
            title: aiTitle,
            titleSource: "ai",
            titleGeneratedAt: new Date(),
          });
          await recordMetric(sessionId, "title_generation", titleStart, true);
        } catch (titleErr) {
          console.warn("[Processing] Failed to generate title:", titleErr);
        }
      }
    }
    
    await updateProcessingStatus(sessionId, "ready", 100, "Processing complete");
    
    await recordMetric(sessionId, "full_pipeline", pipelineStart, true);
    
    const pipelineDuration = ((Date.now() - pipelineStart.getTime()) / 1000).toFixed(1);
    console.log(`[Processing] Session ${sessionId} RESULTS READY in ${pipelineDuration}s (transcript + score)`);
    
    generatePreviewInBackground(sessionId, videoFullPath, originalUploadPath, originalCloudPath)
      .catch(err => console.error(`[Processing] Background preview failed:`, err));
    
  } catch (err) {
    console.error(`[Processing] Error processing session ${sessionId}:`, err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    await updateProcessingStatus(sessionId, "failed", 0, "Processing failed", errorMessage);
    await recordMetric(sessionId, "full_pipeline", pipelineStart, false, errorMessage);
  } finally {
    activeProcessing.delete(sessionId);
  }
}
