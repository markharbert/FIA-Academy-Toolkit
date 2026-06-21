import { storage } from "./storage";
import { extractAudioFast, probeVideo, generatePoster, generateTimelineFrames } from "./ffmpeg";
import { transcribeAudio, scoreTranscript, generateTitle } from "./ai";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import type { ProcessingStatus, GoalType, InsertProcessingMetric, TranscriptStatus, ScoreStatus } from "@shared/schema";
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

// Per-user concurrency cap: track how many sessions each user has actively processing.
// This prevents one member from monopolising CPU/disk/AI spend by submitting many
// sessions in parallel.  The limit deliberately applies before the per-session
// activeProcessing guard so that the budget is consumed at the point of acceptance,
// not after the session lock is acquired.
const MAX_CONCURRENT_SESSIONS_PER_USER = 2;
const activeSessionsPerUser = new Map<string, number>();

function incrementUserSessions(userId: string): boolean {
  const current = activeSessionsPerUser.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_SESSIONS_PER_USER) {
    return false;
  }
  activeSessionsPerUser.set(userId, current + 1);
  return true;
}

function decrementUserSessions(userId: string): void {
  const current = activeSessionsPerUser.get(userId) ?? 0;
  const next = Math.max(0, current - 1);
  if (next === 0) {
    activeSessionsPerUser.delete(userId);
  } else {
    activeSessionsPerUser.set(userId, next);
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


export async function processSession(sessionId: string, userId: string, preExtractedAudioPath?: string): Promise<void> {
  console.log(`[Processing] Starting AUDIO-FIRST fast path for session ${sessionId}${preExtractedAudioPath ? " (pre-extracted audio)" : ""}`);
  const pipelineStart = new Date();
  
  if (activeProcessing.has(sessionId)) {
    console.log(`[Processing] Session ${sessionId} is already being processed, skipping`);
    return;
  }

  // Enforce per-user concurrency cap before accepting any work.
  if (!incrementUserSessions(userId)) {
    console.warn(`[Processing] User ${userId} has reached the concurrent session limit (${MAX_CONCURRENT_SESSIONS_PER_USER}), rejecting session ${sessionId}`);
    await storage.updateSession(sessionId, {
      processingStatus: "failed",
      processingProgress: 0,
      processingMessage: "Too many videos are already being processed for your account. Please wait for a current video to finish before starting another.",
      processingError: "per_user_concurrency_limit",
    }).catch(() => {});
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
      processingMessage: preExtractedAudioPath ? "Preparing transcription..." : "Extracting audio...",
    });
    
    let audioPath: string;
    
    if (preExtractedAudioPath) {
      console.log(`[Processing] Using pre-extracted audio: ${preExtractedAudioPath}`);
      audioPath = preExtractedAudioPath;
      
      if (!fs.existsSync(audioPath)) {
        await updateProcessingStatus(sessionId, "failed", 0, "Audio file not found", "Pre-extracted audio file missing");
        activeProcessing.delete(sessionId);
        return;
      }
      
      await storage.updateSession(sessionId, {
        audioPath: path.basename(audioPath),
        audioExtractedAt: new Date(),
        transcriptStatus: "transcribing" as TranscriptStatus,
      });
    } else {
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
      
      await storage.updateSession(sessionId, {
        transcriptStatus: "extracting_audio" as TranscriptStatus,
      });
      
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
      
      await storage.updateSession(sessionId, {
        audioPath: audioResult.audioPath,
        audioExtractedAt: new Date(),
        durationSeconds: audioResult.durationSeconds || undefined,
        transcriptStatus: "transcribing" as TranscriptStatus,
      });
      
      console.log(`[Processing] Audio extracted successfully, generating poster before deleting video`);
      
      try {
        const posterResult = await generatePoster(videoFullPath, UPLOADS_DIR, sessionId);
        if (posterResult.success && posterResult.posterPath) {
          const localPosterPath = path.join(UPLOADS_DIR, posterResult.posterPath);
          
          try {
            const objectPath = await objectStorageService.uploadImage(localPosterPath, posterResult.posterPath);
            await storage.updateSession(sessionId, {
              previewPosterPath: objectPath,
              previewPosterMimeType: "image/jpeg",
              previewPosterGeneratedAt: new Date(),
            });
            console.log(`[Processing] Poster uploaded to object storage: ${objectPath}`);
            
            try {
              if (fs.existsSync(localPosterPath)) {
                fs.unlinkSync(localPosterPath);
              }
            } catch {}
          } catch (uploadErr) {
            console.warn(`[Processing] Failed to upload poster to object storage, using local:`, uploadErr);
            await storage.updateSession(sessionId, {
              previewPosterPath: posterResult.posterPath,
              previewPosterMimeType: "image/jpeg",
              previewPosterGeneratedAt: new Date(),
            });
          }
        } else {
          console.warn(`[Processing] Poster generation failed: ${posterResult.error}`);
        }
      } catch (posterErr) {
        console.warn(`[Processing] Poster generation error:`, posterErr);
      }
      
      try {
        const videoDuration = audioResult.durationSeconds || session.durationSeconds || 0;
        if (videoDuration > 0) {
          const timelineResult = await generateTimelineFrames(videoFullPath, UPLOADS_DIR, sessionId, videoDuration, 12);
          if (timelineResult.success && timelineResult.framePaths) {
            const objectPaths: string[] = [];
            
            for (const framePath of timelineResult.framePaths) {
              const localFramePath = path.join(UPLOADS_DIR, framePath);
              try {
                const objectPath = await objectStorageService.uploadImage(localFramePath, framePath);
                objectPaths.push(objectPath);
                
                try {
                  if (fs.existsSync(localFramePath)) {
                    fs.unlinkSync(localFramePath);
                  }
                } catch {}
              } catch (uploadErr) {
                console.warn(`[Processing] Failed to upload frame ${framePath} to object storage:`, uploadErr);
                objectPaths.push(framePath);
              }
            }
            
            await storage.updateSession(sessionId, {
              timelineFrames: objectPaths,
              timelineFramesGeneratedAt: new Date(),
            });
            console.log(`[Processing] Timeline frames uploaded: ${objectPaths.length} frames`);
          } else {
            console.warn(`[Processing] Timeline frame generation failed: ${timelineResult.error}`);
          }
        }
      } catch (timelineErr) {
        console.warn(`[Processing] Timeline frame generation error:`, timelineErr);
      }
      
      const deleteStart = new Date();
      await deleteOriginalUpload(sessionId, originalUploadPath, originalCloudPath, UPLOADS_DIR);
      await storage.updateSession(sessionId, {
        videoDeletedAt: new Date(),
      });
      await recordMetric(sessionId, "video_deletion", deleteStart, true);
      console.log(`[Processing] Video file deleted after audio extraction`);
      
      audioPath = path.join(UPLOADS_DIR, audioResult.audioPath!);
    }
    
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
        transcriptStatus: "complete" as TranscriptStatus,
        scoreStatus: "partial" as ScoreStatus,
      });
      
      console.log(`[Processing] Transcript ready (${transcript.length} chars)`);
      
    } catch (transcribeErr) {
      await recordMetric(sessionId, "transcription", new Date(), false, String(transcribeErr));
      await storage.updateSession(sessionId, {
        transcriptStatus: "failed" as TranscriptStatus,
        scoreStatus: "failed" as ScoreStatus,
      });
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
          session.durationSeconds || 60
        );
        await recordMetric(sessionId, "scoring", scoreStart, true);
        
        await storage.updateSession(sessionId, {
          scoreJson: scoreResult,
          scoreUpdatedAt: new Date(),
          scoreStatus: "final" as ScoreStatus,
        });
        
        console.log(`[Processing] Score ready: ${scoreResult.totalScore}/100`);
        
      } catch (scoreErr) {
        await recordMetric(sessionId, "scoring", new Date(), false, String(scoreErr));
        await storage.updateSession(sessionId, {
          scoreStatus: "failed" as ScoreStatus,
        });
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
    
  } catch (err) {
    console.error(`[Processing] Error processing session ${sessionId}:`, err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    await updateProcessingStatus(sessionId, "failed", 0, "Processing failed", errorMessage);
    await recordMetric(sessionId, "full_pipeline", pipelineStart, false, errorMessage);
  } finally {
    activeProcessing.delete(sessionId);
    decrementUserSessions(userId);
  }
}
