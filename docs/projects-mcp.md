# Academy Projects AI connection

Open **Projects → AI connections** for endpoint URLs, setup instructions, active
connections, and pending destructive actions. This integration only exposes the
member's Projects workspace; it does not grant access to administration, courses,
email integrations, or other Academy tools.

## First connection

1. Publish this version before connecting an AI assistant to the live member site.
2. In a client supporting custom remote MCP servers and OAuth, add the published
   endpoint shown on the connection page, using Streamable HTTP:
   `https://toolkit.fearlessmarketinglab.com/mcp/projects`.
3. Sign in on the Academy website using the existing member login.
4. Review the assistant's name and callback address. Read-only is the default;
   select **Include write access** to allow project edits.
5. Try “List my projects,” then “Create a project named Test launch with three
   tasks.” Check the result in the normal Projects page.
6. A delete request does not immediately delete anything. Open AI connections,
   review the request, and approve or deny it. Changed or expired requests must
   be submitted again.

Client availability, account requirements, connector labels, and file handling
vary by AI platform. The SDK integration tests do not certify any particular
Claude, ChatGPT, Grok, or other account's UI. Development previews may also require
Replit access, so use the published endpoint for external-client testing.

## Supported controls

- Projects: list/search/read, create, edit details and order, archive/restore,
  populate from a template, request deletion.
- Tasks and single-level subtasks: list/search/read, create, edit, complete/reopen,
  move within the project board, order, priorities, deadlines, tags, and links.
- Board sections, comments, task activity, workspace overview.
- Templates and template tasks: list/read/create/edit, duplicate, save an existing
  project as a template, instantiate into a project, request deletion.
- Attachments: metadata, five-minute download links, task-bound upload URLs for
  files up to 25 MB, direct base64 upload up to 512 KB, request deletion.
- Approval status lookup.

All create/edit/upload operations require a unique `request_id` UUID. Retrying
the same ID with the same arguments returns the recorded result rather than
repeating the mutation. Reusing it with different arguments is rejected.
For edits requiring `expected_version`, copy the exact version from the relevant
get response, including fractional seconds; newer edits cannot be overwritten.
Comments retain the existing website's edit behavior.

Imports from third-party project managers, bulk preview/apply transactions,
per-project grant restrictions, and provider-specific configuration helpers are
not part of this base version.

## Security and operations

OAuth authorization uses S256 PKCE, one-use codes, registered HTTPS or local
loopback callbacks, session-bound consent, and resource-bound credentials.
Access credentials expire after 15 minutes; rotating refresh credentials remain
usable for 30 days and extend that window on successful renewal. A client that
does not use its refresh credential within that window must reconnect.
Tokens and authorization codes are stored as hashes. Confidential OAuth client
metadata is encrypted using the existing session secret; do not change that
secret without expecting those clients to reconnect.

Every MCP request rechecks current account eligibility and collaborator invites.
Each grant is restricted to its verified workspace. Disconnecting blocks both
access and refresh. Cookie-authorized consent and approval actions require
same-origin browser requests; consent additionally uses a session-bound nonce.
An AI client's bearer credential cannot approve its own destructive requests.

Deletion requests expire after 10 minutes. The target and its relevant contents
are fingerprinted; intervening changes require a fresh request. Approval is
atomically claimed to prevent two browser tabs executing it twice. Mutation and
approval records are retained for up to 90 days. These records may contain project
content supplied to the tools; they are not public logs. MCP API response bodies,
OAuth credentials, and signed URLs must not be added to request logs.

New database tables are additive and initialized in the background after routes
are registered. Initialization failure is surfaced by requests and retried,
without blocking the HTTP listener.

## Verification

```
node --import tsx --test server/projects-mcp/projects-mcp.test.ts
npx vitest run client/src/pages/ai-connections.test.tsx
npm run build
```

The server tests use isolated temporary members in the development database,
an isolated test-only login route, the official MCP client SDK, and a real small
object-storage upload/download/delete round trip. All fixtures are cleaned up.
Never register the test login route in the actual application.
