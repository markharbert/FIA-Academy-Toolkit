---
name: Transcript workflow uniformity
description: The required consistency rule for transcript features across courses and Training Library replays.
---

Transcript controls, status information, generation behavior, timestamps, sources, chapters, downloads, replacement, and removal must remain uniform across course lessons and Training Library replays.

**Why:** Admins manage both kinds of training content and need one predictable transcript workflow rather than separate feature sets that drift over time.

**How to apply:** Whenever transcript behavior or presentation changes on either surface, review and update the corresponding course and replay flows together unless the product requirement explicitly distinguishes them.

Fresh-transcript progress responses must bypass response compression, pad each NDJSON event beyond proxy buffering thresholds, flush every event, and emit bounded heartbeat percentages during long AI calls.

**Why:** Compression and reverse proxies can buffer small progress messages, while long AI calls naturally produce no intermediate completion events. Either issue makes the browser appear stuck.

**How to apply:** Keep every fresh-transcript endpoint covered by the compression bypass and shared padded stream writer, and clear its heartbeat timer on every exit path.

The browser must also maintain a monotonic, bounded local estimate while the request is active, because intermediaries may still withhold the server stream.

**Why:** A client-side estimate guarantees visible movement even when no network progress event is delivered; its timer must stop before showing 100% or it can regress the displayed value.

**How to apply:** Keep the estimate inside the shared transcript-generation client, cap it below completion, merge server values with `Math.max`, and clear it before emitting 100%.