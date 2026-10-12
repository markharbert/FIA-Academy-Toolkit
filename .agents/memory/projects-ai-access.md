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

The detailed MCP setup/reference page belongs in the Admin navigation and is
admin-only for now. This restriction applies to the documentation page, not to
the existing member connection and approval flows.

**Why:** The user specifically requested an admin-only “MCP server” page with
connection instructions and endpoint reference, to expand as more tools are added.

**How to apply:** Keep both the reference page and its data API admin-protected
unless the user requests a broader rollout. Keep provider instructions accurate
to the server's supported OAuth registration method.

Connection setup should present the name **FIA Toolkit** and the published URL,
not the development URL. The public connection address uses “agent” rather than
“projects”; this naming does not authorize access beyond the current Projects scope.

**Why:** The user only tests published versions and intends to add other app
capabilities later without making the connection look Projects-specific.

**How to apply:** Keep the setup instructions production-focused and preserve
existing connections when renaming the service. Broader feature access still
requires an explicit request and appropriate permission scopes.

Use the normal Academy member login for assistant authorization rather than
reusing a broad member API key.

**Why:** The agreed approach prioritizes familiar member sign-in and revocable,
limited assistant access without asking members to copy long-lived API keys.

**How to apply:** Keep assistant authorization separate from website sessions and
other clients' credentials. Follow the existing ClickFunnels membership authority
and shared-workspace access rules when evaluating whether a grant remains usable.
