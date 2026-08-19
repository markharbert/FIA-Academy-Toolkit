---
name: Responsive script-free snapshots
description: Keeping Responsive Preview snapshots functional for CSS testing without sandbox script warnings.
---

Responsive Preview must stay script-free; do not add `allow-scripts` to its iframe sandbox to suppress blocked-script warnings. Keep the preview iframe inside a shadow-root mount rather than the page's light DOM.

**Why:** Captured pages can contain nested iframes or inline script entry points even after top-level `<script>` tags are removed. Some pages also react to a newly inserted light-DOM iframe by trying to run code in its initial sandboxed `about:blank` document. Allowing scripts would execute captured page code in the preview; shadow isolation and sanitization prevent both cases while preserving CSS media-query rendering.

**How to apply:** When updating snapshot generation, remove script, iframe/frame, object, and embed nodes; strip inline `on*` attributes and `javascript:` URLs. Keep the actual preview iframe in a shadow-root mount, and retain tests that it is absent from light DOM, no script-capable content enters the preview, and sandbox excludes `allow-scripts`.