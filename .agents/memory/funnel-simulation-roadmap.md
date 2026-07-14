---
name: Funnel Simulation Roadmap
description: Planned feature — funnel profitability simulation/report using per-node metrics already being collected.
---

## The Goal
Generate a "funnel simulation" report showing projected profitability based on numbers entered in each node.

## Data Already Being Collected (per node, stored in canvasData JSON)
- **Traffic Source**: `estimatedTraffic` (visitors/day), `costPerClick` ($)
- **Page nodes** (capture, sales, thank-you, etc.): `conversionRate` (%)
- **Email nodes**: `emailDay` (sequence position)

## What the Simulation Needs to Do
1. Walk the funnel graph (edges define flow) starting from each traffic source
2. At each step, multiply incoming visitors × the next page's `conversionRate`
3. Calculate spend: `estimatedTraffic × costPerClick × timeframe`
4. Need additional fields (not yet collected) to complete profitability:
   - Sales page / offer: `productPrice` or `revenuePerConversion` ($)
   - Possibly: `emailClickRate` (%), `emailConversionRate` (%) for sequence nodes
5. Output a report card: Total Spend, Total Leads, Total Sales, Revenue, ROI %

## Why
**"Once we get everything set up, we're gonna do a simulation where it provides them a report where they can say, 'Okay, if I send traffic at this amount to each page, eventually we can calculate the profitability of a funnel.'"**

## Notes
- Simulation runs client-side (graph traversal on canvasData) — no new DB schema needed beyond existing canvasData JSON
- Report could be a panel/modal inside the editor, or a separate "Simulate" button in the toolbar
- May want to add a `revenuePerConversion` field to sales/thank-you page nodes when we build this
