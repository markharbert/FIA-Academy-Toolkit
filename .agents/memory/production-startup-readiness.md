---
name: Production startup readiness
description: Keep the web server healthy during additive database migration work on autoscale deployments.
---

The HTTP server must begin listening before long-running, additive startup migrations and backfills run.

**Why:** Autoscale deployment health checks expect a prompt HTTP response. Running schema checks and backfills before opening the listener produces repeated health-check failures and can trigger avoidable restarts that users experience as an unavailable or crashing dashboard.

**How to apply:** Register routes and static serving first, then open the listener. Run additive migrations, index checks, bootstrap work, and optional backfills in guarded background initialization. Any request path that needs a newly introduced schema must tolerate the brief initialization window or be released only after the migration is already present.

Verify compiled-server readiness with actual HTTP responses, not an exact startup-log substring.

**Why:** A log-matching probe timed out, while the same compiled application passed direct HTTP health and asset checks. Log capture and formatting are not a reliable readiness signal.

**How to apply:** Brief production probes should block external HTTP calls and terminate promptly after their checks, rather than leave a second set of background jobs running alongside the managed workflow.