---
name: Member notification timing
description: Time-zone and catch-up rules for scheduled member emails.
---

Evaluate notification schedules against the member's wall-clock date, weekday, and hour using their IANA timezone. Convert local midnight to an absolute instant for per-day deduplication.

**Why:** Reconstructing a Date from a localized string depends on the server timezone and shifts day boundaries. Exact-hour checks also skip notifications whenever the process sleeps or restarts during the target hour.

**How to apply:** A notification is due on its configured day once the configured hour has passed. Use the existing daily send log to deliver it once and prevent duplicate catch-up sends.