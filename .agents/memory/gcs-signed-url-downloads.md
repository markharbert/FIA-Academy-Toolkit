---
name: GCS Signed URL Downloads
description: How to force attachment downloads from GCS on Replit — set contentDisposition as object metadata, then 302 redirect to a plain signed URL. Do NOT proxy through Express.
---

## Rule (WORKING SOLUTION, shipped July 2026)
For download routes that must send `Content-Disposition: attachment`: set the disposition as **object metadata** via `file.setMetadata({ contentDisposition: 'attachment; filename="..."' })`, then 302-redirect to a plain sidecar-signed V4 URL. GCS serves the header itself. Do NOT proxy the bytes through Express and do NOT try to append `response-content-disposition` to a signed URL.

**Why:**
- Cloud Run (Replit Autoscale) kills non-chunked HTTP responses at **32 MiB** — an Express proxy with `Content-Length` set silently fails in production for large files while working fine in dev. Evidence: 154/181 MB recordings failed in every browser; 17–23 MB ones worked; server logs showed no error (cutoff is at the infra layer).
- GCS V4 signed URLs include `response-content-disposition` in the string-to-sign — appending it post-signing gives 403 `SignatureDoesNotMatch`. The Replit sidecar signer doesn't accept disposition params, and the SDK's `getSignedUrl` fails with "Cannot sign data without client_email" under sidecar creds.
- Object-metadata contentDisposition sidesteps both: verified end-to-end (302 → GCS 200 with correct attachment header, byte-identical file, works for any size).

**How to apply:**
1. Sanitize the filename server-side (ASCII whitelist + strip `"` `\` CR/LF — it goes into a header).
2. `await file.setMetadata({ contentDisposition })` — must re-run after any re-upload of the object (uploads reset metadata).
3. Sign a plain read URL (sidecar signer) and `res.redirect(302, url)`.
4. Caveat: the disposition is permanent on the object — opening a *stream* signed URL directly in a tab will download instead of play. `<video>` elements ignore Content-Disposition, so streaming/preview routes are unaffected.
5. The HTML `download` attribute is ignored cross-origin — irrelevant here since GCS sends the header.
