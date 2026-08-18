---
name: Replit publish "delete column" warning
description: How to diagnose and fix the Replit publish flow warning about dropping a column that is actually in the schema.
---

## The Rule

When the Replit publish UI warns "you're about to delete column X from table Y", the cause is **not** the schema file — it's the **dev database missing that column**.

## Why

Replit's publish flow diffs the **dev database** against the **production database** (not the schema file against prod). If prod has a column that dev is missing, the diff reads as "delete from prod to match dev" — even if `shared/schema.ts` clearly defines the column.

## How it happened here

`screenshot_url` was added to `shared/schema.ts` but `drizzle-kit push` (via post-merge.sh) never applied it to the dev database. Production had the column (from a prior publish). Replit's publish diff saw the mismatch and flagged a destructive change — blocking every subsequent publish attempt.

## Fix

Add the missing column directly to the dev database via SQL:

```sql
ALTER TABLE affiliate_links ADD COLUMN IF NOT EXISTS screenshot_url text;
```

After that, publish proceeds cleanly with no warning, and any pending frontend fixes also reach production.

**Why:** The publish is blocked until dev and prod databases are in sync. Fixing the dev DB is the right path — never alter the production database directly.

**How to apply:** Any time a publish warning says "delete column X" but the schema clearly has column X, run `executeSql({ environment: "development" })` to add the column to dev, then re-publish.
