---
name: Teleprompter recording upload
description: Why the two-step signed-URL approach fails and what works instead.
---

## Rule
Always use `POST /api/teleprompter/recordings` (multer FormData route) for teleprompter recording uploads. Never use the two-step prepare-upload → browser-PUT-to-GCS approach.

## Why
The signed-URL approach (`prepare-upload` returns a GCS pre-signed URL, browser does cross-origin PUT to `storage.googleapis.com`) is blocked by GCS CORS policy in the browser. The XHR PUT silently fails with a network error. The server never sees the data, so `confirm-upload` is never called.

All 13 existing takes (storage keys `/objects/recordings/userId/uuid.mp4`) were created via the server proxy route, never via the signed-URL flow.

## How to apply
- Client: `FormData` with `video` blob, `title`, `scriptId`, `durationSeconds`, `format` fields → `POST /api/teleprompter/recordings` with `xhr.withCredentials = true`.
- Server: multer `upload.single("video")` → disk → `faststartMp4` → `objectStorage.uploadFile()` → `storage.createTeleprompterRecording()`.
- The signed-URL infrastructure (`prepare-upload`, `confirm-upload`, `getObjectEntityUploadURL`) can stay in place but is not used for browser uploads.

## Canvas recording
Canvas-based recording (captureStream + audio track from original stream) causes A/V sync drift because the two streams have different internal clocks. Always record directly from `mediaStream` using `MediaRecorder`. CSS `object-fit: cover` on the preview container provides accurate aspect-ratio cropping visually.
