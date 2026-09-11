---
name: Replay detail performance
description: Performance boundaries for public Training Library replay pages.
---

The initial replay-detail response must exclude full transcript text and timestamp cues. Load them through a separate request when the transcript opens, with a delayed background prefetch after the title and video are ready.

**Why:** Transcript payloads can be substantially larger than the rest of the page and are collapsed by default. Making them part of the initial response delays the primary content for data most visitors do not immediately view.

**How to apply:** Keep only transcript availability and compact chapters in the primary replay response. Any transcript feature that needs full text or cues should use the dedicated transcript query rather than widening the initial payload.

Vimeo time updates should update React state only while live transcript highlighting is visible.

**Why:** Player events fire repeatedly during playback. Updating page state while the transcript is closed needlessly rerenders the replay content, resources, and discussion several times per second.

**How to apply:** Gate playback-time state updates behind the open transcript view, and memoize transcript formatting, tokenization, and cue offsets.