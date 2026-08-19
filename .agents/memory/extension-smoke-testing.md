---
name: Extension smoke testing
description: Reliable local smoke testing for the packaged MV3 extension in this Replit environment.
---

Warm a packaged extension's service worker before using its Chrome APIs in a headless Chromium smoke test.

**Why:** The worker debugger target can appear before the worker has finished initializing its API bindings, causing an initial browser-automation request to stall even though the extension is healthy.

**How to apply:** Load the ZIP into a clean temporary profile, wait briefly after attaching to the service worker, and make a simple runtime call before creating test tabs or windows.

When a smoke test deliberately backgrounds a tab, do not use Puppeteer's default `waitForFunction` polling to observe that tab.

**Why:** Its default polling depends on `requestAnimationFrame`, which Chromium suspends for background tabs; a completed cleanup can look like a timeout.

**How to apply:** Use a Node-side delay and then a direct `page.evaluate()` assertion, or explicit non-RAF polling, for inactive-tab checks.