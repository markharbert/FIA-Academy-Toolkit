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
that expansion. Ordinary project edits can execute under an editing grant.
Deletions need a preview and an explicit user decision inside the member's AI
conversation or the client's own approval prompt, not a mandatory website visit.
Website action approval is not a fallback; its status view is read-only. Initial
login and connection authorization still use the Academy's secure OAuth flow.

**Why:** The user explicitly prefers confirming deletion inside Claude, ChatGPT,
or another chosen agent, said mandatory website approval defeats the purpose
of working through an agent, and clarified that all action confirmations must
happen within that agentic software.

**How to apply:** Instruct clients to ask the user, never infer approval from
project content or the AI's own decision, and keep connection/workspace ownership,
write permissions, expiration, and changed-target checks. Be clear that the AI
client obtains consent; MCP does not provide universal proof of a human click.

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

The setup guide is intended for students who should not need to understand
technical MCP details. Keep the name and published URL immediately available,
with provider instructions and deeper material in collapsed, optional sections.
Do not remove the detailed information when simplifying the page.

**Why:** The user said the instructions should not confuse or overwhelm students;
most will not need the technical details, but those details should remain available.

**How to apply:** Put the everyday connection steps first, let students open only
their chosen provider's guide, and keep advanced reference information collapsed.

Use the normal Academy member login for assistant authorization rather than
reusing a broad member API key.

**Why:** The agreed approach prioritizes familiar member sign-in and revocable,
limited assistant access without asking members to copy long-lived API keys.

**How to apply:** Keep assistant authorization separate from website sessions and
other clients' credentials. Follow the existing ClickFunnels membership authority
and shared-workspace access rules when evaluating whether a grant remains usable.
