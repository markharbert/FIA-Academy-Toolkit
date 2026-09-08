import test from "node:test";
import assert from "node:assert/strict";
import { buildTranscriptIndexChunks } from "./trainingReplayTranscriptIndex";

test("buildTranscriptIndexChunks preserves cue timestamps", () => {
  assert.deepEqual(buildTranscriptIndexChunks("ignored", [
    { startSeconds: 12.8, text: " First phrase " },
    { startSeconds: 19.2, text: "Second   phrase" },
  ]), [
    { chunkIndex: 0, startSeconds: 12, endSeconds: 19, text: "First phrase" },
    { chunkIndex: 1, startSeconds: 19, endSeconds: null, text: "Second phrase" },
  ]);
});

test("buildTranscriptIndexChunks indexes text without timestamp cues", () => {
  const chunks = buildTranscriptIndexChunks("A ".repeat(400), null);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].startSeconds, 0);
  assert.ok(chunks.every((chunk) => chunk.text.length > 0));
});

test("buildTranscriptIndexChunks creates no searchable chunks for a cleared transcript", () => {
  assert.deepEqual(buildTranscriptIndexChunks(null, null), []);
});