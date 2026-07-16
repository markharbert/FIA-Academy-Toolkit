---
name: Teleprompter recording upload
description: Why chunked upload is required for the in-page modal and what approaches do not work.
---

## Rule
For the in-page modal (blob-URL iframe context), always use **chunked upload** through the parent page. Never use the two-step signed-URL / direct GCS PUT approach, and never send the whole blob as a single FormData POST.

## Why

### Direct signed-URL PUT to GCS — CORS-blocked
`prepare-upload` returns a GCS pre-signed URL. When the browser tries a cross-origin PUT to `storage.googleapis.com` from a blob-URL iframe (origin `null`), GCS CORS policy blocks it. The XHR silently fails with a network error; the server never receives data.

### Single-request FormData POST — Replit ingress 413
Posting the whole blob as `multipart/form-data` through the parent page's `fetch` (or directly from the popup XHR) travels through Replit's deployment reverse proxy, which enforces a body-size limit. A ~3-4 minute video (~50-200 MB) gets a 413 Payload Too Large.

## The working approach: chunked upload

Slice the blob into **5 MB chunks**. Each chunk goes:

```
iframe (postMessage) → parent React page → fetch POST /api/teleprompter/recordings/upload-chunk → Express (multer) → disk
```

After all chunks arrive, the parent sends `teleprompter-finalize-upload-request`. The server assembles the temp files, runs `faststartMp4`, pushes to GCS via `objectStorage.uploadFile()`, and creates the DB record.

### Message types (iframe ↔ parent)
- `teleprompter-chunk-upload-request` → `teleprompter-chunk-upload-result` (per chunk)
- `teleprompter-finalize-upload-request` → `teleprompter-finalize-upload-result` (once, after last chunk)

### Server routes
- `POST /api/teleprompter/recordings/upload-chunk` — multer, stores chunk to `uploads/chunks/<uploadId>/chunk-<index>`
- `POST /api/teleprompter/recordings/finalize-chunked-upload` — assembles, faststart, GCS upload, DB record

### Popup window context
The popup window path (direct XHR, no iframe) also sends to `POST /api/teleprompter/recordings` via the server. It will have the same 413 problem for large files; chunked upload should eventually be applied there too.

## How to apply
- `client/src/lib/teleprompter.ts` — `inIframe` branch at the upload section
- `client/src/pages/teleprompter.tsx` — `useEffect` message handler (listen for `teleprompter-chunk-upload-request` and `teleprompter-finalize-upload-request`)
- `server/routes.ts` — routes near line 5120 (`upload-chunk`, `finalize-chunked-upload`)
