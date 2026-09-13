---
name: ClickFunnels recurring revenue data
description: Live data inconsistencies that affect recurring revenue aggregation and reconciliation.
---

Treat current ClickFunnels service and trial flags as authoritative for present-day totals. For historical periods, use lifecycle timestamps. A subscription order may contain multiple recurring offer lines while omitting the billing interval on only one line; infer that line's cadence only when multiple invoice dates establish a safe daily, weekly, monthly, or annual pattern.

**Why:** Live reconciliation found a mixed active order whose second recurring line had no interval, and separate records where current service/trial flags disagreed with timestamps. Ignoring the line understated offer totals; trusting timestamps for current reporting inflated MRR and active counts.

**How to apply:** Keep summary totals reconciled to offer-line totals. Count active subscriptions by recurring offer line and subscribers by unique contact. Label safely inferred line cadence as invoice-derived, and never infer cadence from a single invoice.