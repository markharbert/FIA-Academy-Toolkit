import { pool } from "./db";
import type { LessonTranscriptCue } from "@shared/schema";

const POLL_INTERVAL_MS = 2_000;
let started = false;
let working = false;

export type TranscriptIndexChunk = {
  chunkIndex: number;
  startSeconds: number;
  endSeconds: number | null;
  text: string;
};

export function buildTranscriptIndexChunks(
  transcriptText: string | null,
  transcriptCues: LessonTranscriptCue[] | null,
): TranscriptIndexChunk[] {
  const cues = Array.isArray(transcriptCues)
    ? transcriptCues.filter((cue) => Number.isFinite(cue.startSeconds) && cue.text?.trim())
    : [];
  if (cues.length) {
    return cues.map((cue, index) => ({
      chunkIndex: index,
      startSeconds: Math.max(0, Math.floor(cue.startSeconds)),
      endSeconds: cues[index + 1]
        ? Math.max(0, Math.floor(cues[index + 1].startSeconds))
        : null,
      text: cue.text.replace(/\s+/g, " ").trim(),
    }));
  }
  const text = transcriptText?.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const chunks: TranscriptIndexChunk[] = [];
  for (let offset = 0; offset < text.length; offset += 500) {
    chunks.push({
      chunkIndex: chunks.length,
      startSeconds: 0,
      endSeconds: null,
      text: text.slice(offset, offset + 500).trim(),
    });
  }
  return chunks;
}

async function indexNextVersion(): Promise<boolean> {
  const claimed = await pool.query<{
    id: string;
    replayId: string;
    transcriptText: string | null;
    transcriptCues: LessonTranscriptCue[] | null;
  }>(`
    WITH candidate AS (
      SELECT id
      FROM training_replay_transcript_versions
      WHERE index_status = 'pending'
      ORDER BY created_at, version
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE training_replay_transcript_versions version
    SET index_status = 'processing', index_error = NULL
    FROM candidate
    WHERE version.id = candidate.id
    RETURNING version.id, version.replay_id AS "replayId",
      version.transcript_text AS "transcriptText", version.transcript_cues AS "transcriptCues"
  `);
  const version = claimed.rows[0];
  if (!version) return false;
  try {
    const chunks = buildTranscriptIndexChunks(version.transcriptText, version.transcriptCues);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM training_replay_transcript_chunks WHERE transcript_version_id = $1`,
        [version.id],
      );
      for (const chunk of chunks) {
        await client.query(`
          INSERT INTO training_replay_transcript_chunks
            (transcript_version_id, replay_id, chunk_index, start_seconds, end_seconds, text)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [version.id, version.replayId, chunk.chunkIndex, chunk.startSeconds, chunk.endSeconds, chunk.text]);
      }
      await client.query(`
        UPDATE training_replay_transcript_versions
        SET index_status = 'complete', index_error = NULL
        WHERE id = $1
      `, [version.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcript indexing failed";
    await pool.query(`
      UPDATE training_replay_transcript_versions
      SET index_status = 'failed', index_error = $2
      WHERE id = $1
    `, [version.id, message.slice(0, 1_000)]);
    console.error(`[Replay transcript index] ${version.id} failed: ${message}`);
  }
  return true;
}

async function drainQueue(): Promise<void> {
  if (working) return;
  working = true;
  try {
    while (await indexNextVersion()) {
      // Drain all durable pending versions before waiting for the next poll.
    }
  } finally {
    working = false;
  }
}

export function startTrainingReplayTranscriptIndexWorker(): void {
  if (started) return;
  started = true;
  const timer = setInterval(() => {
    void drainQueue().catch((error) => console.error("[Replay transcript index] poll failed:", error));
  }, POLL_INTERVAL_MS);
  timer.unref();
  void drainQueue().catch((error) => console.error("[Replay transcript index] startup failed:", error));
  console.log("[Replay transcript index] started");
}