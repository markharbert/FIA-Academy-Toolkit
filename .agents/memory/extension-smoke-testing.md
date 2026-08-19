---
name: Extension smoke testing
description: Reliable local smoke testing for the packaged MV3 extension in this Replit environment.
---

Warm a packaged extension's service worker before using its Chrome APIs in a headless Chromium smoke test.

**Why:** The worker debugger target can appear before the worker has finished initializing its API bindings, causing an initial browser-automation request to stall even though the extension is healthy.

**How to apply:** Load the ZIP into a clean temporary profile, wait briefly after attaching to the service worker, and make a simple runtime call before creating test tabs or windows.