---
name: ClickFunnels membership authority
description: Membership access follows ClickFunnels immediately; local profiles and history remain preserved.
---

ClickFunnels is the sole authority for Academy membership. When it reports an enrollment as inactive, suspended, or deleted, the Toolkit must revoke access without a local grace period. Do not delete the member’s local profile, activity, or ClickFunnels identifiers.

**Why:** Membership payments and enrollment are controlled in ClickFunnels, so a local extension of access creates conflicting membership states. The owner explicitly confirmed that inactive ClickFunnels members must not be able to log in.

**How to apply:** Keep local records for reporting. A complete reconciliation should classify existing local profiles with an inactive ClickFunnels enrollment as revoked, even if they never logged in. Profiles without any ClickFunnels enrollment evidence remain never enrolled. Do not add local grace windows or manual membership overrides.

Inbound ClickFunnels webhooks are only evidence when their delivery ID has not already been processed, their event time is not older than the member’s recorded membership event, and direct enrollment events explicitly identify the configured course. Broad subscription cancellations must confirm the member’s current configured-course enrollment before revoking access.

**Why:** ClickFunnels can retry and deliver webhook events out of order, while subscription events can describe activity unrelated to the Academy course.

**How to apply:** Preserve only receipt metadata and outcomes, not raw payloads. Match a known ClickFunnels contact ID before email; if identity evidence conflicts, leave access unchanged and surface an admin review record rather than merging accounts automatically.