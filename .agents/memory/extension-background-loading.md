---
name: Extension background loading
description: The user's standing expectation for fast extension popup content and link thumbnails.
---

The browser extension should load its data and link thumbnails in the background so they are already available when members open its tabs. The user wants it to be “quick, fast, and easy.”

**Why:** Opening the Links tab and then waiting several seconds for thumbnails made the extension feel slow.

**How to apply:** Preserve background preloading and fast cached reopening when changing extension features. Keep private cached content isolated between members and clear it on sign-out. This does not change the separate capture-only Swipe File popup rule.
