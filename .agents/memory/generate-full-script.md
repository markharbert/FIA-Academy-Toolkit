---
name: Generate Full Script feature
description: How the AI "Generate Full Script" feature works and a key debugging lesson about server restarts causing false failures.
---

# Generate Full Script Feature

## What it does
- Located in `client/src/pages/topic-pulse-script.tsx` — "Full Script" tab in the script editor
- POST `/api/topic-pulse/scripts/:id/generate-full` → calls `generateFullScript()` in `server/topic-pulse.ts`
- GPT-4o expands the structured outline (`scriptJson.fullScript`) into flowing teleprompter prose
- Output is post-processed by `formatForTeleprompter()` to guarantee 1-2 sentences per paragraph with `\n\n` breaks
- Saved back to `scripts.scriptJson.expandedScript` in the DB

## Key debugging lesson: "Failed to generate" false positives
**Why:** During development, server restarts (triggered by file saves) can cut off in-flight fetch connections. The client's `fetch()` throws `TypeError: Failed to fetch` (triggering mutation `onError`), but the server may have already logged `200` before the SIGTERM killed the connection. The code is fine — the error is from the restart, not the route.

**How to apply:** If a route returns 200 quickly but the client shows an error, first check whether server restarts coincided with the user's click before diagnosing the route code itself.
