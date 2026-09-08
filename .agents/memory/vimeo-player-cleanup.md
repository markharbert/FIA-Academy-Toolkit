---
name: Vimeo player cleanup
description: Safe Vimeo iframe lifecycle behavior in React dialogs and components.
---

Do not call Vimeo Player `destroy()` from a React effect cleanup when React owns the iframe. Explicitly pause the player and remove listeners or polling; let React remove the iframe when the component unmounts.

**Why:** React development mode intentionally runs an effect setup/cleanup cycle during initialization. Vimeo `destroy()` removes or severs the iframe API connection during that diagnostic cycle, so the video can appear while later playback-time tracking remains disconnected.

**How to apply:** For Vimeo players embedded in React components or dialogs, make asynchronous setup cancellation-aware, pause during cleanup, and rely on component unmounting to remove the iframe.