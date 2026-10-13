---
name: Personal identities and shared workspaces
description: One teammate login, existing-account protection, and the distinction between identity and workspace access.
---

Use one personal login per teammate. Someone who already has their own workspace must be able to choose between it and the workspaces they have joined.

**Why:** The user explicitly approved this approach. The old invitation screen asked existing users to create a password but actually checked their existing password, producing misleading failures.

**How to apply:** Invitations must distinguish new-account password creation from existing-account sign-in. Never overwrite an existing account's password during acceptance; use verified email recovery instead. Keep the invitation available after recovery and require an explicit join.

A shared workspace grants Project Manager collaboration, not the owner's identity or Academy membership. Personal workspace access requires the person's own active membership (or existing staff privileges); shared access depends on the owner's active membership and an accepted, unrevoked invitation.

**Why:** Switching workspace must not transfer paid membership, reveal the owner's unrelated tools, or remove the teammate's personal account.

**How to apply:** Preserve the actor's identity while changing the authorized workspace. Keep account settings personal. Reject stale workspace requests without signing a person out of other valid workspaces. Clear tenant caches and reload mounted state when switching, including other open tabs. AI authorizations remain bound to the workspace approved at connection time.
