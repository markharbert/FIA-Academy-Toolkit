---
name: Member health and commercial reporting
description: Boundaries for health classification and ClickFunnels commercial reporting.
---

Member health must remain explainable: its segments are derived from access, sign-in, course progress, DMO activity, meaningful Toolkit actions, and recency. A member should be able to see why they entered a segment; do not replace these explanations with opaque scoring.

**Why:** Membership access and engagement describe different things. A current subscriber who has not activated needs a different follow-up from a previously engaged member who has gone quiet.

**How to apply:** Preserve the explicit health reasons and keep administrators excluded. Treat recent training progress and DMO work as activity, not only generic action-log events.

Commercial reporting is a manual, read-only ClickFunnels refresh. It stores only the order identifier, contact association, offer, order date, amount, and reliable UTM attribution fields.

**Why:** Reporting should support onboarding, retention, and offer decisions without changing ClickFunnels authority, retaining raw order payloads, or inferring campaign attribution where the source data is absent.

**How to apply:** Never create, update, cancel, or alter ClickFunnels commercial records from this reporting flow. Show campaign/tag attribution only when ClickFunnels supplies an unambiguous value.

For the Academy payment view, include only ClickFunnels line items whose original product or variant name explicitly identifies Fearless Influencer Academy, whose contact maps to a known member, and whose payment date is within the current 90-day window.

**Why:** A member’s other ClickFunnels purchases must not be interpreted as Academy payments, and an order total can include unrelated line items.

**How to apply:** Aggregate only matching line-item amounts, not the whole order. Replace the dedicated reporting ledger on refresh so legacy broad records cannot remain visible.