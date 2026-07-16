---
name: Teleprompter recording upload
description: Why direct chunked fetch (no postMessage relay) is the correct upload approach for the in-page modal.
---

## Rule
For the in-page modal (blob-URL iframe), upload via **direct fetch() chunks from the iframe** to the Express server. Do NOT use a postMessage relay through the parent page. Do NOT use signed-URL PUT to GCS.

## Why each approach does or doesn't work

### Direct signed-URL PUT to GCS — CORS-blocked
`prepare-upload` returns a GCS pre-signed URL. When the browser tries a cross-origin PUT to `storage.googleapis.com` from a blob-URL iframe (origin `null`), GCS CORS policy blocks it. The XHR silently fails.

### Single-request FormData POST to Express — Replit ingress 413
Posting the whole blob as `multipart/form-data` (either directly or via parent relay) trips the deployment reverse proxy body-size limit. A ~3-4 minute video (~50-200 MB) gets a 413 Payload Too Large.

### postMessage relay (chunk blob → parent → Express) — too many failure points
The parent's async event handler must capture `e.source` BEFORE the await, rely on structured clone to preserve Blob.type, and reply back to the correct iframe window. Any mismatch (e.source null, stale handler from HMR, blob type lost) silently breaks the upload. Avoid.

### Direct chunked fetch from iframe — the working approach
Blob-URL iframes share the creating page's origin. `fetch()` with `credentials:"include"` sends session cookies to the same-origin Express server exactly like the parent page. No postMessage needed.

```
iframe → fetch() → /api/teleprompter/recordings/upload-chunk (×N chunks)
iframe → fetch() → /api/teleprompter/recordings/finalize-chunked-upload
```

## Implementation

### Iframe (client/src/lib/teleprompter.ts)
IIFE inside `uploadRecording()`, always runs (covers both iframe and popup contexts):
- Slice blob into 5 MB chunks
- For each chunk: `fetch('/api/teleprompter/recordings/upload-chunk', { method:'POST', credentials:'include', body: FormData })`
- After all chunks: `fetch('/api/teleprompter/recordings/finalize-chunked-upload', { credentials:'include', ... })`
- `return;` after IIFE so old popup XHR code is dead (unreachable)

### Server routes (server/routes.ts)
- `POST /api/teleprompter/recordings/upload-chunk` — `chunkUpload.single("chunk")` (dedicated multer, no fileFilter), stores chunk to `uploads/chunks/<uploadId>/chunk-000000`
- `POST /api/teleprompter/recordings/finalize-chunked-upload` — assembles chunks, runs faststartMp4, uploads to GCS, creates DB record

### Parent handlers (client/src/pages/teleprompter.tsx)
The old postMessage handlers (`teleprompter-chunk-upload-request`, `teleprompter-finalize-upload-request`) are still registered in the useEffect but are no longer invoked by the iframe. They're harmless and can stay.

## How to apply
- `client/src/lib/teleprompter.ts` — `uploadRecording()` function (IIFE section)
- `server/routes.ts` — `chunkUpload` multer + `upload-chunk` + `finalize-chunked-upload` routes
