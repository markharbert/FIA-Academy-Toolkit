---
name: Responsive script-free snapshots
description: Keeping Responsive Preview snapshots functional for CSS testing without sandbox script warnings.
---

Responsive Preview must keep captured page content script-free. Its sandbox includes `allow-scripts` because Chrome can emit a blocked-script warning while initializing the iframe otherwise; keep the preview iframe inside a shadow-root mount rather than the page's light DOM.

**Why:** Captured pages can contain nested iframes or inline script entry points even after top-level `<script>` tags are removed. Some pages also react to a newly inserted light-DOM iframe by trying to run code in its initial sandboxed `about:blank` document. Shadow isolation prevents page scripts from targeting the frame, while sanitization ensures the allowed script capability has no captured page code to execute.

**How to apply:** When updating snapshot generation, remove script, iframe/frame, object, and embed nodes; strip inline `on*` attributes and `javascript:` URLs. Keep the actual preview iframe in a shadow-root mount, and retain tests that it is absent from light DOM, no script-capable content enters the preview, and sandbox configuration matches the sanitized model.