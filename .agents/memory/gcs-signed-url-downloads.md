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

## CRITICAL LIMIT (found July 2026): proxy fails in production for files >32 MiB
Replit Autoscale deployments run on Google Cloud Run, which caps non-chunked HTTP responses at 32 MiB. The Express proxy sets `Content-Length` (added for Safari, which saves 0-byte files on chunked downloads without a declared size), so the response is not chunked — Cloud Run kills the connection at 32 MiB and the browser shows a failed download. Works fine in dev; fails ONLY in production, ONLY for large files. Evidence: member's 154/181 MB recordings failed in every browser while 17–23 MB ones downloaded fine; server logs show clean "proxying N bytes" with no error (the cutoff happens at the infra layer).

**Implication:** the proxy approach is only safe for files under ~30 MB. For large downloads either (a) have the signing service include `response-content-disposition` in the V4 signature AT signing time (supported by GCS if the signer accepts it) and redirect, or (b) drop Content-Length to force chunked encoding — but that reintroduces the Safari 0-byte issue, so browser-sniff or accept the tradeoff.
