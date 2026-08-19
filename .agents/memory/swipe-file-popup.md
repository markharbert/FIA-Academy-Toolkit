---
name: Swipe File popup simplification
description: Product decision for the Chrome extension's Swipe File tab.
---

The extension Swipe File tab must offer capture controls and one direct “Access your swipe file” link to the members-area Swipe File page. Do not reintroduce a Recent Saves list, per-item share controls, or a background request to load Swipe File items in the popup.

**Why:** The synced recent-items list added avoidable popup complexity and could fail silently, making saved content appear missing. The full members-area page is the appropriate place to browse and manage saved items.

**How to apply:** Keep all save/capture flows functional in the extension, but send browsing and management to the members-area Swipe File page.