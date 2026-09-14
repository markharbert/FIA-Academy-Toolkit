---
name: ClickFunnels recurring revenue data
description: Live data inconsistencies that affect recurring revenue aggregation and reconciliation.
---

Treat current ClickFunnels service and trial flags as authoritative for present-day totals. For historical periods, use lifecycle timestamps. A subscription order may contain multiple recurring offer lines while omitting the billing interval on only one line; infer that line's cadence only when multiple invoice dates establish a safe daily, weekly, monthly, or annual pattern.

**Why:** Live reconciliation found a mixed active order whose second recurring line had no interval, and separate records where current service/trial flags disagreed with timestamps. Ignoring the line understated offer totals; trusting timestamps for current reporting inflated MRR and active counts.

**How to apply:** Keep summary totals reconciled to offer-line totals. Count active subscriptions by recurring offer line and subscribers by unique contact. Label safely inferred line cadence as invoice-derived, and never infer cadence from a single invoice.

For regular revenue, use eligible live one-time invoice snapshots for gross receipts and approved refund transactions for exact refund amounts and processing dates. Refunded invoices can lose `paid_at`; only then, use the linked approved sale transaction's `created_at` as the original receipt timestamp.

**Why:** Invoice totals do not change after partial refunds, while `GET /api/v2/orders/:orderId/transactions` exposes exact negative refund adjustments. Live validation also found refunded invoices without `paid_at`, even though the original approved sale transaction remains available.

**How to apply:** Fetch invoices in bulk from `GET /api/v2/workspaces/:workspaceId/orders/invoices`, then fetch transactions only for refunded orders. Attribute offers from historical invoice line items, allocate integer cents by largest remainder, use New York half-open periods, and reject snapshots unless offer gross, refunds, and cash reconcile exactly to period totals. Never combine mixed currencies.