---
name: Learner course delivery performance
description: Boundaries that keep course lists, outlines, and readable lesson links responsive as the library grows.
---

Course lists and course navigation outlines must return only the fields required to navigate and display progress. Rich lesson fields such as body content and transcripts belong exclusively in the active lesson response. A course list should also include the first available lesson path so entering a course does not require an intermediate redirect request.

**Why:** A learner can navigate an entire curriculum with a few small fields, while transcripts and lesson content can be large. Loading those fields for every lesson makes course entry slower as more material is imported.

**How to apply:** When adding learner navigation or progress features, extend the lightweight course summary/outline responses instead of reusing lesson-detail records. Preserve the direct readable-path lookup for lesson pages and add an index whenever a new course lookup becomes part of the request path.