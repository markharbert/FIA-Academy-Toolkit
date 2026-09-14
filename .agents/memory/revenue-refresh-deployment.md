---
name: Revenue refresh deployment
description: Why ClickFunnels revenue reports require an always-on production deployment.
---

Keep production on an always-on VM while Recurring Revenue and Regular Revenue depend on in-process 15-minute background schedulers.

**Why:** An Autoscale deployment stops when idle, so interval timers do not run while no users are visiting. The next admin request previously received the persisted stale snapshot while a refresh ran afterward.

**How to apply:** Preserve the VM deployment target unless refresh scheduling is moved to an independent managed scheduler. When a persisted snapshot is stale after startup, revenue endpoints should coalesce with and await the active refresh rather than presenting the old timestamp as current.