---
name: Responsive script-free snapshots
description: Keeping Responsive Preview snapshots functional for CSS testing without sandbox script warnings.
---

Responsive Preview must stay script-free; do not add `allow-scripts` to its iframe sandbox to suppress blocked-script warnings.

**Why:** Captured pages can contain nested iframes or inline script entry points even after top-level `<script>` tags are removed. Allowing scripts would execute captured page code in the preview; removing nested documents and script-capable attributes prevents that while preserving CSS media-query rendering.

**How to apply:** When updating snapshot generation, remove script, iframe/frame, object, and embed nodes; strip inline `on*` attributes and `javascript:` URLs; retain a test that confirms no script-capable content enters the preview and sandbox excludes `allow-scripts`.