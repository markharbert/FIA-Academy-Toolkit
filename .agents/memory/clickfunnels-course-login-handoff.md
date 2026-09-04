---
name: ClickFunnels course login handoff
description: Authentication boundary for sending signed-in site members into the ClickFunnels customer course area.
---

Use this site as the member-facing login hub. A signed-in site member can launch the ClickFunnels Customer Center through a server-generated SSO link without maintaining separate ClickFunnels credentials. Do not require the local main-course enrollment flag for this handoff; ClickFunnels remains responsible for determining which courses the contact can access.

**Why:** The intended experience is one login maintained on this site, while ClickFunnels hosts separately managed one-off course access behind the scenes. Members are ClickFunnels customer contacts, not ClickFunnels funnel-builder software users.

**How to apply:** Keep SSO generation server-side, use the dedicated Customer Center JWT secret, and include every required claim (`sub`, `nbf`, `exp`, and `iat`). When a custom Customer Center domain exists, use that exact domain—including `www`—for the SSO URL, JWT subject, and redirect; keep the canonical workspace domain separate for API calls. Identify the contact by the signed-in member's email and leave enrollment decisions to ClickFunnels.