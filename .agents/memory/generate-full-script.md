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

## Teleprompter handoff constraint
Generated-script titles can be much longer than the Teleprompter library accepts. Normalize the title to the Teleprompter limit before saving, without truncating the script body, and navigate directly to the canonical Teleprompter route with the new script ID.

**Why:** Production recorded a 400 when “Save & Open in Teleprompter” passed a generated title beyond the Teleprompter title limit. Going through the legacy redirect could also discard the script-selection query.

**How to apply:** Any generated-script-to-Teleprompter handoff must map source data to the destination contract and preserve the selected script ID through navigation.
