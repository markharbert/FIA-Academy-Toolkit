#!/usr/bin/env npx tsx
/**
 * One-time migration: adds streak cache columns to dmo_settings.
 * Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).
 */
import { pool } from "../db";

async function run() {
  await pool.query(`
    ALTER TABLE dmo_settings
      ADD COLUMN IF NOT EXISTS streak_current integer,
      ADD COLUMN IF NOT EXISTS streak_best integer,
      ADD COLUMN IF NOT EXISTS streak_total_days integer,
      ADD COLUMN IF NOT EXISTS streak_last_active_date varchar(10),
      ADD COLUMN IF NOT EXISTS streak_updated_at timestamp;
  `);
  console.log("[migration] dmo_settings streak columns added (or already present)");
  await pool.end();
}

run().catch(err => {
  console.error("[migration] failed:", err);
  process.exit(1);
});
