import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pool } from "./db";
import { storage } from "./storage";
import { extractRemoteAudioSegments } from "./ffmpeg";
import {
  extractVimeoVideoId,
  getVimeoVideoDownload,
  getVimeoVideoDurationMinutes,
  getVimeoVideoThumbnail,
  syncVimeoChapters,
} from "./vimeo";
import { generateLessonChapters, generateReplayDescription, transcribeAudioWithTimestamps } from "./ai";
import { formatTranscriptParagraphs } from "@shared/transcript-format";

const VIDEO_CONCURRENCY = 2;
const GEMINI_CONCURRENCY = 3;
const SEGMENT_SECONDS = 600;
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 4_000;
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

let started = false;
let activeVideos = 0;
let geminiActive = 0;
const geminiWaiters: Array<() => void> = [];

async function withGeminiSlot<T>(work: () => Promise<T>): Promise<T> {
  if (geminiActive >= GEMINI_CONCURRENCY) {
    await new Promise<void>((resolve) => geminiWaiters.push(resolve));
  }
  geminiActive += 1;
  try {
    return await work();
  } finally {
    geminiActive -= 1;
    geminiWaiters.shift()?.();
  }
}

async function claimNextReplayId(): Promise<string | null> {
  const result = await pool.query<{ id: string }>(`
    WITH candidate AS (
      SELECT id
      FROM training_replays
      WHERE transcript_processing_status = 'queued'
        AND (transcript_processing_next_attempt_at IS NULL OR transcript_processing_next_attempt_at <= CURRENT_TIMESTAMP)
      ORDER BY transcript_processing_queued_at ASC NULLS FIRST, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE training_replays replay
    SET transcript_processing_status = 'processing',
        transcript_processing_started_at = CURRENT_TIMESTAMP,
        transcript_processing_error = NULL,
        transcript_processing_attempts = replay.transcript_processing_attempts + 1,
        updated_at = CURRENT_TIMESTAMP
    FROM candidate
    WHERE replay.id = candidate.id
    RETURNING replay.id
  `);
  return result.rows[0]?.id ?? null;
}

async function markFailure(replayId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Fresh transcription failed.";
  const replay = await storage.getTrainingReplay(replayId);
  const attempts = replay?.transcriptProcessingAttempts ?? MAX_ATTEMPTS;
  const transient = /429|quota|rate limit|timeout|timed out|502|503|fetch failed|temporar/i.test(message);
  if (transient && attempts < MAX_ATTEMPTS) {
    const delayMinutes = attempts * 5;
    await pool.query(`
      UPDATE training_replays
      SET transcript_processing_status = 'queued',
          transcript_processing_error = $2,
          transcript_processing_started_at = NULL,
          transcript_processing_next_attempt_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute'),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [replayId, message.slice(0, 1_000), delayMinutes]);
    console.warn(`[Replay transcript queue] ${replayId} will retry in ${delayMinutes} minutes: ${message}`);
    return;
  }
  await pool.query(`
    UPDATE training_replays
    SET transcript_processing_status = 'failed',
        transcript_processing_error = $2,
        transcript_processing_started_at = NULL,
        transcript_processing_next_attempt_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [replayId, message.slice(0, 1_000)]);
  console.error(`[Replay transcript queue] ${replayId} failed: ${message}`);
}

async function processReplay(replayId: string): Promise<void> {
  const temporaryFiles: string[] = [];
  try {
    const replay = await storage.getTrainingReplay(replayId);
    const videoId = replay?.videoUrl ? extractVimeoVideoId(replay.videoUrl) : null;
    if (!replay || !videoId) throw new Error("Imported replay does not have a valid Vimeo video.");

    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    const [download, durationMinutes, thumbnailUrl] = await Promise.all([
      getVimeoVideoDownload(videoId),
      getVimeoVideoDurationMinutes(videoId),
      getVimeoVideoThumbnail(videoId),
    ]);
    const prefix = `import-transcript-${replay.id}-${crypto.randomBytes(6).toString("hex")}`;
    const extracted = await extractRemoteAudioSegments(
      download.link,
      UPLOADS_DIR,
      prefix,
      SEGMENT_SECONDS,
      durationMinutes ? durationMinutes * 60 : undefined,
    );
    temporaryFiles.push(...(extracted.segmentPaths ?? []));
    if (!extracted.success || !extracted.segmentPaths?.length) {
      throw new Error(extracted.error || "Could not extract the Vimeo video's audio.");
    }

    const segmentResults = await Promise.all(
      extracted.segmentPaths.map((segmentPath, index) =>
        withGeminiSlot(() =>
          transcribeAudioWithTimestamps(
            segmentPath,
            index * (extracted.segmentDurationSeconds ?? SEGMENT_SECONDS),
          ),
        ),
      ),
    );
    const transcriptText = formatTranscriptParagraphs(
      segmentResults.map((segment) => segment.text).filter(Boolean).join(" "),
    );
    const transcriptCues = segmentResults.flatMap((segment) => segment.cues);
    const transcriptLanguage = segmentResults.find((segment) => segment.language)?.language || "";
    if (!transcriptText || transcriptCues.length < 2) {
      throw new Error("No timestamped speech was found in the Vimeo video.");
    }
    const transcriptChapters = await generateLessonChapters(transcriptCues);
    const refreshedDescription = await generateReplayDescription(replay.title, transcriptText);
    const generatedAt = new Date();
    await storage.updateTrainingReplay(replay.id, {
      description: refreshedDescription,
      transcriptText,
      transcriptLanguage: transcriptLanguage || null,
      transcriptSource: "Fresh transcription created automatically during ClickFunnels import",
      transcriptUpdatedAt: generatedAt,
      transcriptCues,
      transcriptChapters,
      transcriptChaptersGeneratedAt: generatedAt,
      durationMinutes,
      thumbnailUrl: thumbnailUrl || replay.thumbnailUrl || null,
      transcriptProcessingStatus: "complete",
      transcriptProcessingError: null,
      transcriptProcessingStartedAt: null,
      transcriptProcessingNextAttemptAt: null,
    });
    try {
      await syncVimeoChapters(videoId, transcriptChapters);
    } catch (error) {
      console.warn(
        `[Replay transcript queue] Vimeo chapter sync failed for ${replay.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
    console.log(`[Replay transcript queue] completed ${replay.id} (${transcriptChapters.length} chapters)`);
  } catch (error) {
    await markFailure(replayId, error);
  } finally {
    for (const filePath of temporaryFiles) {
      await fs.promises.unlink(filePath).catch(() => undefined);
    }
  }
}

async function fillWorkerSlots(): Promise<void> {
  while (activeVideos < VIDEO_CONCURRENCY) {
    const replayId = await claimNextReplayId();
    if (!replayId) return;
    activeVideos += 1;
    void processReplay(replayId).finally(() => {
      activeVideos -= 1;
      void fillWorkerSlots().catch((error) =>
        console.error("[Replay transcript queue] refill failed:", error),
      );
    });
  }
}

export async function enqueueImportedReplayTranscripts(replayIds: string[]): Promise<number> {
  const uniqueIds = [...new Set(replayIds)].filter(Boolean);
  if (!uniqueIds.length) return 0;
  const result = await pool.query(`
    UPDATE training_replays
    SET transcript_processing_status = 'queued',
        transcript_processing_error = NULL,
        transcript_processing_attempts = 0,
        transcript_processing_queued_at = CURRENT_TIMESTAMP,
        transcript_processing_started_at = NULL,
        transcript_processing_next_attempt_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::varchar[])
      AND video_url ~* '(^|[./])vimeo\\.com/'
    RETURNING id
  `, [uniqueIds]);
  void fillWorkerSlots().catch((error) =>
    console.error("[Replay transcript queue] immediate start failed:", error),
  );
  return result.rowCount ?? 0;
}

export function startTrainingReplayTranscriptWorker(): void {
  if (started) return;
  started = true;
  const timer = setInterval(() => {
    void fillWorkerSlots().catch((error) =>
      console.error("[Replay transcript queue] poll failed:", error),
    );
  }, POLL_INTERVAL_MS);
  timer.unref();
  void fillWorkerSlots().catch((error) =>
    console.error("[Replay transcript queue] startup failed:", error),
  );
  console.log(`[Replay transcript queue] started (${VIDEO_CONCURRENCY} videos, ${GEMINI_CONCURRENCY} Gemini segments)`);
}