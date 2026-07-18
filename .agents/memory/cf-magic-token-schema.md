---
name: CF Magic Token Schema Fix
description: cf_magic_tokens.user_id was integer in both dev and prod; fix required ALTER TABLE in dev then re-publish.
---

# CF Magic Token Schema Mismatch

## The Rule
When `db:push` is never re-run after a schema change, both dev and prod can have the same stale column type. The Publish diff sees no change and applies nothing to production.

**Why:** The `cf_magic_tokens` table was first created when `user_id` was `integer`. The schema was later changed to `varchar` but `db:push` was never re-run in dev, so dev still had `integer`. Publish saw dev=integer vs prod=integer → no diff → no migration applied.

**How to apply:** If a Publish isn't fixing a prod schema problem, always check the DEV database column types first (`information_schema.columns`). If dev and prod match (both stale), fix dev first with a direct `ALTER TABLE` via `executeSql` (dev is writable), then re-publish so the diff is non-empty.

## Token Write Format
CF API v2 accepts `custom_attributes` as a flat object `{ atk_token: value }` in the PUT body — confirmed working. No array format needed.

## Verification
After fixes: scheduler runs every 4 minutes, `pushed=177 failed=0`. Tokens rotate correctly in both `cf_magic_tokens` table and CF contact `custom_attributes.atk_token`.

## CF Merge Tag Contexts
- **CF Page Builder buttons**: Only reliably replaces standard contact fields. Use `?email={{contact.email_address}}` for page button URLs.
- **CF Emails**: Replaces custom attribute merge tags. Use `?t={{contact.atk_token}}` in email links/buttons.
- Admin UI now shows both URLs with context-specific instructions.
