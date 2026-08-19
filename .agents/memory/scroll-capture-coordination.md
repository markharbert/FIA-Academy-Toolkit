---
name: Scroll capture coordination
description: Reliability rule for extension tools that scroll and screenshot a source tab.
---

Full Page capture and Color Palette scanning must acquire the same per-tab operation lock before they change scroll position, hide fixed elements, or capture pixels.

**Why:** Their asynchronous loops otherwise interleave on the same tab, producing corrupted screenshots or palettes and leaving the user's page in an unexpected scroll or visibility state.

**How to apply:** Any future tool that performs a multi-step scroll-and-capture workflow should use the shared lock, release it only after cleanup in `finally`, and show a conflict message outside the page being captured so it cannot alter the result.