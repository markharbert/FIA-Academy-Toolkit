---
name: Extension push retired
description: Deliberate product decision to remove browser push broadcasts without removing the toolkit extension.
---

Do not reintroduce Web Push subscriptions, VAPID keys, or extension broadcast notifications unless the user explicitly asks.

**Why:** The user clarified that they do not want browser push notifications and declined setting up new VAPID keys. This did not mean they wanted the rest of the toolkit extension removed.

**How to apply:** Keep normal extension features and non-push local alerts separate from browser push; do not propose restoring push as routine setup. Historical subscription data was left untouched to avoid unapproved deletion.