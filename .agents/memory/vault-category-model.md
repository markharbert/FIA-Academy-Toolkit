---
name: Vault category model
description: Product and ordering rules for categories in the replay Vault.
---

Replay categories are custom, admin-created labels backed by a persistent category registry. Keep the replay's category label for compatibility, but use the registry as the source of choices in admin interfaces. Creating or importing a categorized replay must register the category automatically. Renaming a category updates every replay using it; deleting one uncategorizes those replays without deleting them.

**Why:** Categories must remain available when no replay currently uses them, and admins need one safe place to create, rename, and remove the available choices.

**How to apply:** Use persistent categories for Vault Manager filters and replay editor choices. Continue deriving member-facing facets from published replay data so empty categories are not shown to members. Only permit ordering against the complete, unfiltered catalog.