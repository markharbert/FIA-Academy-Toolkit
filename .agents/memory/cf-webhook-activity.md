---
name: ClickFunnels webhook activity
description: Durable logging rules for inbound ClickFunnels enrollment and revocation webhooks.
---

Record ClickFunnels webhook activity after signature verification, including the event type, member identifiers when present, processing outcome, HTTP result, error summary, duration, and timestamp. Record rejected signature attempts without an email or raw payload.

**Why:** Application logs are short-lived and cannot prove whether ClickFunnels actually reached the Toolkit or how an event was processed. The admin needs a durable, safe operational record.

**How to apply:** Keep activity records for 90 days. Do not save raw webhook bodies, signatures, API tokens, or webhook secrets. Treat ClickFunnels delivery history as evidence that ClickFunnels attempted a request, and this activity log as evidence that the Toolkit received and processed it.