---
name: Topic Pulse search allowance
description: Distinguishes the member-facing monthly search allowance from third-party keyword API usage.
---

One successful Topic Pulse search consumes exactly one unit of the member's monthly allowance, including searches fulfilled from cache.

**Why:** Keyword API credits are an implementation cost and vary with cache state. Using them as the member allowance made identical searches consume different amounts and allowed cached searches to consume nothing.

**How to apply:** Atomically reserve one search before work begins, retain it on success, and refund it only when the search fails. Track keyword API credits separately for diagnostics.