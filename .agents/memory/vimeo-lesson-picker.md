---
name: Vimeo lesson picker
description: Vimeo API constraints for the admin lesson video selector.
---

Use Vimeo's current `/me/folders` endpoints for folder browsing, and require a personal access token with the `private` scope. Fetch video results in bounded pages rather than trying to retrieve an entire account library in one request.

**Why:** The legacy projects endpoint and a token without the private scope return 403 for folders. A full-library video request can time out on accounts with large video collections.

**How to apply:** Keep the token server-only, page the picker results, and let admins explicitly choose a folder and then a video to populate a lesson's URL. Do not infer lesson-to-video matches automatically.