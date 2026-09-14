---
name: ClickFunnels recurring revenue data
description: Live data inconsistencies that affect recurring revenue aggregation and reconciliation.
---

Treat current ClickFunnels service and trial flags as authoritative for present-day totals. For historical periods, use lifecycle timestamps. A subscription order may contain multiple recurring offer lines while omitting the billing interval on only one line; infer that line's cadence only when multiple invoice dates establish a safe daily, weekly, monthly, or annual pattern.

**Why:** Live reconciliation found a mixed active order whose second recurring line had no interval, and separate records where current service/trial flags disagreed with timestamps. Ignoring the line understated offer totals; trusting timestamps for current reporting inflated MRR and active counts.

**How to apply:** Keep summary totals reconciled to offer-line totals. Count active subscriptions by recurring offer line and subscribers by unique contact. Label safely inferred line cadence as invoice-derived, and never infer cadence from a single invoice.

For regular revenue, treat `paid`, `refunded`, and `partially-refunded` invoices as gross orders. Include their original invoice totals in revenue and order counts, then show refunded invoice value separately rather than subtracting it.

**Why:** ClickFunnels returns the partial-refund status with a hyphen, and its order report uses gross revenue. Excluding refunded invoices produces net revenue and fewer orders, which will not reconcile with ClickFunnels.

**How to apply:** Normalize both hyphenated and underscored refund statuses. Keep gross revenue, order count, refunds, and allocated offer revenue separate, and verify offer revenue sums to gross revenue. At offer level, count any fully or partially refunded order once, allocate its refund proportionally in multi-offer orders, and define cash collected as gross allocated revenue minus that refund.