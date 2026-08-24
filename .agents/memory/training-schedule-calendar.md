---
name: Training Schedule Calendar
description: Access and rollout boundary for the Academy Training Schedule.
---

The Training Schedule is an admin-only, read-only view of a shared Google Calendar. The workspace-level calendar connection is the source of truth, and admins choose the one calendar that supplies the schedule.

**Why:** Training events are planned in Google Calendar. Keeping Google authoritative avoids a second event store and prevents accidental changes from the Toolkit. The pre-existing project iCal feed is a user-specific export of project tasks, not a source for Academy training events.

**How to apply:** Keep calendar queries and configuration protected by the admin boundary. Do not add event editing without an explicit product decision. Treat a public schedule as a separate rollout that exposes only deliberately approved event fields, never the connected calendar's private details by default.