---
name: Cloud generation precondition verification
description: Destructive cloud operations need wire-level SDK tests and exact opaque generation strings.
---

Treat cloud object generations as opaque decimal strings. Verify destructive
preconditions through the installed SDK's actual HTTP request, not merely a mock
that accepts the options the application supplies.

**Why:** A mock can falsely accept unsupported delete options. SDK paths that
select a generation can also coerce a string to a JavaScript number, losing
precision above the safe integer range. Either mistake undermines the promise
that a replaced file will survive cleanup after stale consent.

**How to apply:** Use a local HTTP storage fixture with the real installed SDK.
Check the exact generation in the wire request, replace the object after the
last metadata check, and verify a 412 failure without removing the replacement.
Keep these tests whenever changing SDK versions or the storage deletion path.
