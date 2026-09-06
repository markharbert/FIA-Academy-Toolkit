---
name: Vault category model
description: Product and ordering rules for categories in the replay Vault.
---

Replay categories are custom, admin-created labels stored directly on replays and derived from the replay catalog. Do not replace them with a fixed framework or a separate category entity unless the product requirements change.

**Why:** The Vault needs flexible organization that admins can extend while editing a replay, without category-management overhead.

**How to apply:** Reuse derived categories as filters in both Vault Manager and the browsing Vault. Only permit ordering against the complete, unfiltered catalog so a partial result set cannot overwrite global replay order.