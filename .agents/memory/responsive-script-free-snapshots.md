---
name: Responsive script-free snapshots
description: Keeping Responsive Preview snapshots functional for CSS testing without sandbox script warnings.
---

Responsive Preview must keep captured page content script-free. Its sandbox should not include `allow-scripts`; keep `allow-same-origin` only when same-origin rendering is needed, and keep the preview iframe inside a shadow-root mount rather than the page's light DOM.

**Why:** Captured pages can contain nested iframes or inline script entry points even after top-level `<script>` tags are removed. Combining `allow-scripts` with `allow-same-origin` creates Chrome's sandbox-escape warning, while the preview's media-query/CSS behavior does not require JavaScript. Shadow isolation prevents page scripts from targeting the frame, while sanitization removes executable content.

**How to apply:** When updating snapshot generation, remove script, iframe/frame, object, and embed nodes; strip inline `on*` attributes and `javascript:` URLs. Keep the actual preview iframe in a shadow-root mount, omit `allow-scripts`, and retain tests that it is absent from light DOM, no script-capable content enters the preview, and sandbox configuration matches the sanitized model.