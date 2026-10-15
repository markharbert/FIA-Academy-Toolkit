---
name: Toolkit AI access boundary
description: Member-approved Projects and personal Funnel Grid access, with confirmations inside the AI client.
---

The member-facing MCP integration covers Projects and personal Funnel Grid.
Do not expose Academy administration, courses, email tools, or other app features
just because they already have API handlers. Existing Projects grants must not
silently gain Funnel Grid access. Shared Project Manager collaboration does not
include the owner's funnels.

**Why:** The user initially requested Projects only, then explicitly approved
expansion to Funnel Grid through the same MCP connection, including every node,
notes and delays. The agreed expansion keeps separate member-approved access.

**How to apply:** Expand beyond these features only when the user explicitly requests
that expansion. Ordinary edits can execute under the matching editing grant.
Deletions and full-map replacement need a preview and an explicit user decision inside the member's AI
conversation or the client's own approval prompt, not a mandatory website visit.
Website action approval is not a fallback; its status view is read-only. Initial
login and connection authorization still use the Academy's secure OAuth flow.

**Why:** The user explicitly prefers confirming deletion inside Claude, ChatGPT,
or another chosen agent, said mandatory website approval defeats the purpose
of working through an agent, and clarified that all action confirmations must
happen within that agentic software, regardless of which MCP client they use.

**How to apply:** Instruct clients to ask the user, never infer approval from
project content or the AI's own decision, and keep connection/workspace ownership,
write permissions, expiration, and changed-target checks. Be clear that the AI
client obtains consent; MCP does not provide universal proof of a human click.

Funnel Grid through MCP builds editable diagrams, not live landing pages or
activated email/SMS campaigns.

**Why:** The user asked assistants to build funnel maps in the existing grid,
not to deploy external marketing systems.

**How to apply:** Keep this distinction clear in tools and student instructions.

After an interrupted deletion, a missing target is evidence of its current
state, not proof that the particular confirmed attempt completed. Recovery must
not silently finish file cleanup or retry the deletion; any further destructive
work needs a fresh preview and explicit consent inside the AI client.

**Why:** Other actions can remove or change the same target while the server is
unavailable, and attachment storage and database deletion can finish separately.
Claiming success or automatically completing cleanup could misreport the action
or affect content that has changed since consent.

**How to apply:** Report uncertainty and partial outcomes plainly. Keep recovery
read-only, even when there appears to be an obvious remaining cleanup step.

Orphan remediation deliberately refuses old previews that lack original cloud
generation evidence, rather than treating the file currently at the old path as
the member's original file.

**Why:** A path proves where an attachment used to be, not that a later upload at
that path belongs to the interrupted deletion. Fresh consent alone must not turn
uncertain provenance into authority to delete a replacement.

**How to apply:** Preserve the distinction between read-only recovery and freshly
confirmed remediation. Do not relax legacy-preview refusal merely to make old
leftovers easier to clean up; an alternative needs independent ownership and
file-version evidence.

Normal confirmed deletion should prefer leftover stored files over removing
files that belong to content whose deletion consent became stale. Cloud work
must not extend a database critical section.

**Why:** Database deletion and cloud storage cannot commit together. A failed
cleanup can leave orphan files for separately confirmed recovery, but deleting
files before discovering a concurrent edit would damage surviving content.
Predicate-protecting database locks are required rather than cooperation-only
locks because website and independent SQL writers must also be protected.

**How to apply:** Keep irreversible cloud removal after a successful conditional
database commit. Any future finer-grained concurrency approach must protect new
children and attachments as well as existing rows, without holding database
locks during cloud requests.

Fine-grained deletion locks must rely on immediate database-enforced foreign
keys, including the subtask parent link. Keep that parent relationship
non-cascading: a recursive cascade could delete deeper content that the existing
one-level task preview never showed.

**Why:** Locking only existing rows does not protect phantom children or incoming
moves on an unconstrained parent link. Database relationship checks make direct
SQL writers participate without application-specific cooperation. Broad writer
locks unnecessarily block other projects and workspaces.

**How to apply:** Fail closed if the required immediate relationship checks are
missing. Lock referenced parents before discovering and locking their contents;
compare a fresh snapshot after waiting for writers. Keep schema changes in the
normal schema/publish flow, not request-time or startup-time DDL.

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
