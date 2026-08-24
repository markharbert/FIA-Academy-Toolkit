---
name: Member engagement analytics
description: Rules for interpreting and collecting Toolkit member-usage insights in the ClickFunnels directory.
---

Member engagement is a separate concern from ClickFunnels membership. Access state must never be inferred from Toolkit activity, login history, or analytics.

**Why:** A member may have current Academy access without having ever logged in, while local Toolkit activity helps identify adoption and opportunities for better onboarding—not entitlement.

**How to apply:** Use unique members and active days as primary adoption signals rather than raw event counts. Treat feature views as a lightweight discovery signal, and existing create/complete/save actions as stronger engagement signals. Collect the feature identifier and timing only; never place private member content into usage events. Client-side feature visits are intentionally deduplicated to one event per feature per browser session per day to prevent navigation from distorting the dashboard.