---
name: Responsive script-free snapshots
description: Keeping Responsive Preview snapshots functional for CSS testing without sandbox script warnings.
---

Responsive Preview must keep captured page content script-free. Its sandbox should have no permissions at all, and the preview iframe should stay inside a shadow-root mount rather than the page's light DOM.

**Why:** Captured pages can contain nested iframes or inline script entry points even after top-level `<script>` tags are removed. Any script or origin permission is unnecessary for the sanitized CSS/media-query preview and can create browser sandbox warnings. Shadow isolation prevents page scripts from targeting the frame, while sanitization removes executable content.

**How to apply:** When updating snapshot generation, remove script, noscript, template, iframe/frame, object, and embed nodes; strip inline `on*` attributes and `javascript:` URLs. Keep the actual preview iframe in a shadow-root mount, use an empty sandbox attribute, and retain tests that it is absent from light DOM, no script-capable content enters the preview, and sandbox configuration matches the sanitized model.

**Critical parsing gotcha:** `<noscript>` (and `<template>`) content is inert text on a normal scripting-enabled page, so DOM cloning preserves it invisibly — but a script-disabled sandboxed `srcdoc` re-parses that serialized content as REAL markup. WordPress/GTM tracking `<noscript><script>/<iframe>` fallbacks then become live nodes and Chrome logs "Blocked script execution in 'about:srcdoc'…" per node. Any regression fixture must include noscript-wrapped script/iframe markup, and warning collection must be scoped to the Responsive lifecycle only (reset collectors right before injection) or pre-existing page warnings and other tools' synthetic-event errors pollute the assertion.