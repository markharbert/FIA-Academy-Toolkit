---
name: Training Schedule Calendar
description: Access and rollout boundary for the Academy Training Schedule.
---

The Training Schedule is an admin-only, read-only view of the FIA Event Schedule Google Calendar. The workspace-level calendar connection is the source of truth; the calendar is fixed rather than selectable.

**Why:** Training events are planned in one dedicated FIA calendar. Keeping Google authoritative avoids a second event store and prevents accidental changes from the Toolkit; a selector would make the schedule ambiguous. The pre-existing project iCal feed is a user-specific export of project tasks, not a source for Academy training events.

**How to apply:** Keep calendar queries protected by the admin boundary and use only the FIA Event Schedule. Do not add event editing or alternate calendar selection without an explicit product decision. Treat a public schedule as a separate rollout that exposes only deliberately approved event fields, never the connected calendar's private details by default.