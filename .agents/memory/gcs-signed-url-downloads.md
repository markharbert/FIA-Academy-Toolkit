---
name: GCS Signed URL Downloads
description: How to force file downloads via GCS signed URLs and why server-proxy is needed.
---

## Rule
For download routes that must send `Content-Disposition: attachment`, do NOT redirect to a GCS V4 signed URL and expect the browser `download` attribute to work. Instead, proxy the file through Express.

## Why
- The HTML `download` attribute is ignored by Chrome/Firefox for cross-origin redirects — the browser opens the file instead of saving it.
- GCS V4 signed URLs include `response-content-disposition` in the canonical query string (string-to-sign). Appending it after signing produces a `SignatureDoesNotMatch` error. It cannot be tacked on post-hoc.
- The old `file.createReadStream().pipe(res)` approach was failing silently because the Replit sidecar (`127.0.0.1:1106`) doesn't reliably hold connections open for large files.

## How to Apply
1. Generate a signed URL via `objectStorage.getSignedReadUrl(storageKey, ttlSec)` — same as the stream/preview route.
2. Server-side: `fetch(signedUrl)` — this goes directly to `storage.googleapis.com`, bypassing the sidecar. Works for large files.
3. Set `Content-Disposition: attachment; filename="..."` on the Express response yourself.
4. Pipe: `Readable.fromWeb(gcsRes.body).pipe(res)`.
5. For streaming/preview (not downloads), the plain 302 redirect to the signed URL works fine — let the browser hit GCS directly.
