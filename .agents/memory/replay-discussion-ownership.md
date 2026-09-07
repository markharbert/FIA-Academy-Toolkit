---
name: Replay discussion ownership
description: Durable ownership and deletion behavior for Training Library replay comments.
---

Members may edit or delete only comments they authored. Replying remains available to everyone with discussion access.

Deleting any comment permanently removes that comment and every nested reply beneath it; do not preserve a deleted-comment placeholder.

**Why:** Comment authors must be able to remove an unwanted discussion that developed beneath their comment, not merely hide their own text while leaving the thread active.

**How to apply:** Keep author checks enforced on the server, keep destructive confirmation explicit when replies exist, and preserve database cascade behavior for parent-child comment relationships.