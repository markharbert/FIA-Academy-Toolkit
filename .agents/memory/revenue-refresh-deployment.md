---
name: Revenue refresh deployment
description: Why ClickFunnels revenue reports require an always-on production deployment.
---

Keep production on an always-on VM while Recurring Revenue and Regular Revenue depend on in-process 15-minute background schedulers.

**Why:** An Autoscale deployment stops when idle, so interval timers do not run while no users are visiting. The next admin request previously received the persisted stale snapshot while a refresh ran afterward.

**How to apply:** Preserve the VM deployment target unless refresh scheduling is moved to an independent managed scheduler. Revenue endpoints must always return the latest completed persistent snapshot immediately; stale snapshots trigger a background refresh but page requests never wait on ClickFunnels.