---
name: Merge marker detection
description: Ordinary equals-sign comment separators can be mistaken for unresolved conflict markers.
---

The merge completion check can treat seven consecutive equals signs anywhere in a conflicted source file as an unresolved conflict, even inside an ordinary comment.

**Why:** A resolved routes file with no line-start conflict markers was rejected until existing decorative equals-sign separators were changed to hyphens.

**How to apply:** If completion reports remaining markers but line-start searches find none, check comment separators too. Prefer hyphen separators in files touched by conflict resolution.
