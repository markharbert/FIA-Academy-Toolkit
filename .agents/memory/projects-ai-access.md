---
name: Projects AI access boundary
description: Why the member-facing MCP integration starts with Projects and uses member-controlled grants and deletion approval.
---

The initial member-facing MCP integration is deliberately limited to Projects.
Do not expose Academy administration, courses, email tools, or other app features
just because they already have API handlers.

**Why:** The user requested full control of Projects through members' chosen AI
assistants, specifically “just for now, the projects,” with a base build to test
before further improvements.

**How to apply:** Expand beyond Projects only when the user explicitly requests
that expansion. Ordinary project edits can execute under an editing grant;
destructive deletions require a separate decision from the member on the website,
not an approval the connected AI can grant itself.

Use the normal Academy member login for assistant authorization rather than
reusing a broad member API key.

**Why:** The agreed approach prioritizes familiar member sign-in and revocable,
limited assistant access without asking members to copy long-lived API keys.

**How to apply:** Keep assistant authorization separate from website sessions and
other clients' credentials. Follow the existing ClickFunnels membership authority
and shared-workspace access rules when evaluating whether a grant remains usable.
