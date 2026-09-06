---
name: Transcript workflow uniformity
description: The required consistency rule for transcript features across courses and Training Library replays.
---

Transcript controls, status information, generation behavior, timestamps, sources, chapters, downloads, replacement, and removal must remain uniform across course lessons and Training Library replays.

**Why:** Admins manage both kinds of training content and need one predictable transcript workflow rather than separate feature sets that drift over time.

**How to apply:** Whenever transcript behavior or presentation changes on either surface, review and update the corresponding course and replay flows together unless the product requirement explicitly distinguishes them.

Fresh-transcript progress responses must bypass response compression and flush each NDJSON event.

**Why:** Compression middleware buffers the small progress messages, making the browser appear stuck until the completed response arrives.

**How to apply:** Keep every fresh-transcript streaming endpoint covered by the compression bypass whenever routes are added or renamed.