---
name: Extension sign-in
description: Why device sessions are separate, how browser approval stays reliable, and why credentials use extension-origin storage.
---

The user wants the browser extension to use regular Toolkit login instead of manually entered API keys and to stay connected during normal ongoing use.

**Why:** The user explicitly approved replacing API-key entry. Public API keys are shared integration credentials; regenerating one should not disconnect an unrelated browser installation.

**How to apply:** Keep browser device authorization and renewal independent of website-cookie lifetime and the Public API key feature. Require explicit approval in the normal Toolkit login context. Browser-based approval with PKCE-bound polling avoids depending on a fixed Chrome extension ID when installations come from downloaded ZIPs.

Credentials and pending authorization proofs belong in extension-origin IndexedDB, not content-script-accessible Chrome local storage.

**Why:** The packaged tests use Chromium 125, where local storage's setAccessLevel method is unavailable. IndexedDB works there and gives extension-origin isolation without raising the browser minimum just for credential storage. Chrome local storage remains appropriate for non-secret preferences.

**How to apply:** Keep tokens in the trusted worker; trusted extension pages request authenticated operations, never raw credentials. Do not replace the store with an unprotected Chrome-local fallback.

The authenticated routing fallback must honor a pending login return destination, not only the public-only login route.

**Why:** Updating auth state switches the app from public to protected routes before navigation finishes. The protected catch-all can redirect to Dashboard even after the approval page briefly loaded. Fixing only the login form or public-only route does not prevent that race.

**How to apply:** Test the entire password-login → approval journey, including that the approval page remains visible until the member responds. Keep connection approval as a standalone route and protect the transition from premature catch-all redirects.

Renewal must preserve credentials during offline/server failures and support idempotent retries of a successful rotation whose response was lost.

**Why:** Otherwise an ordinary network interruption creates a new unintended sign-out, defeating the user's persistence requirement.

**How to apply:** Retain credentials on transient errors, serialize worker refreshes, and preserve the bounded retry grace for credential rotation. Definitive revocation, security changes, or long inactivity may still require normal sign-in.
