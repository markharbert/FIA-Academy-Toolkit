---
name: Workspace calendar subscription boundaries
description: Why shared calendar bearers must remain actor- and invitation-bound while legacy personal URLs stay private.
---

Keep shared calendar subscriptions bound to both the subscribing actor and the specific accepted invitation, not just the workspace owner. Scope them to Project Manager events, and validate the invitation and owner membership on every anonymous fetch. Existing personal subscription URLs must continue working without being handed to teammates.

**Why:** Selecting a shared workspace does not confer the owner's identity or private calendar. A revoked invitation followed by a new invitation must not resurrect a previously leaked subscription link.

**How to apply:** New calendar sources must not expand shared subscriptions beyond Project Manager data. Subscription changes affect only the actor's selected workspace. Never log calendar bearer paths or subscription URL responses. Revocation stops future fetches but cannot erase events already downloaded by calendar apps.
