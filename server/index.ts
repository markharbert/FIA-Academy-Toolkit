import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { bootstrapSuperAdmins, runMigrations, storage } from "./storage";
import { startNotificationScheduler } from "./notificationScheduler";

import { configureEmailSender } from "./email-sendgrid";
import { startYouTubeAnalyticsScheduler } from "./youtubeAnalyticsScheduler";
import { db, pool } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { teleprompterScripts, teleprompterRecordings } from "@shared/schema";
import { slugify } from "@shared/slug";

// Prevent stray async errors (e.g. TLS socket events fired after a promise
// resolves) from crashing the entire process.
process.on("uncaughtException", (err: Error) => {
  console.error("[process] uncaughtException — server kept alive:", err?.message);
});
process.on("unhandledRejection", (reason: unknown) => {
  console.error("[process] unhandledRejection — server kept alive:", reason);
});

const app = express();
const httpServer = createServer(app);

// Increase server timeouts for large file uploads (2GB max)
// Default is 2 minutes, we need more for slow connections
httpServer.timeout = 30 * 60 * 1000; // 30 minutes
httpServer.keepAliveTimeout = 30 * 60 * 1000; // 30 minutes
httpServer.headersTimeout = 31 * 60 * 1000; // 31 minutes (must be > keepAliveTimeout)

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Skip global JSON parsing for the ClickFunnels webhook so the route's own
// raw-body collector (with 1 MB cap + absolute timeout) has authoritative
// control over that stream from the start. Regex handles trailing-slash
// variants so the bypass is not circumventable by appending a slash.
// Gzip/Brotli all text responses — skip SSE and large upload routes
app.use(compression({
  filter: (req, res) => {
    // Don't compress SSE streams or file-upload paths
    if (req.path.startsWith("/api/sessions") && req.method === "POST") return false;
    return compression.filter(req, res);
  },
}));

// Security headers — applied to every response
app.use((_req, res, next) => {
  // Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Disallow this app from being embedded in iframes elsewhere
  res.setHeader("X-Frame-Options", "DENY");
  // Control how much referrer info is sent to third parties (e.g. Google Fonts)
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (process.env.NODE_ENV === "production") {
    // Force HTTPS for 1 year in production
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const CF_WEBHOOK_RE = /^\/api\/webhooks\/clickfunnels\/?$/;
app.use((req, res, next) => {
  if (CF_WEBHOOK_RE.test(req.path)) return next();
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })(req, res, next);
});

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

const SENSITIVE_LOG_PATHS = [
  "/api/inbox-analyzer/",
];

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const isSensitivePath = SENSITIVE_LOG_PATHS.some((p) => path.startsWith(p));

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    if (!isSensitivePath) {
      capturedJsonResponse = bodyJson;
    }
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const isProduction = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
      if (capturedJsonResponse && !isProduction) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function runStartupMigrations() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cf_webhook_activity (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        email TEXT,
        contact_id TEXT,
        course_id TEXT,
        status TEXT NOT NULL,
        action TEXT NOT NULL,
        http_status INTEGER,
        error TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cf_webhook_activity_created
        ON cf_webhook_activity (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cf_webhook_activity_event_type
        ON cf_webhook_activity (event_type);
      CREATE INDEX IF NOT EXISTS idx_cf_webhook_activity_status
        ON cf_webhook_activity (status);
    `);
    console.log("[startup] cf_webhook_activity migration complete");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cf_reconciliation_runs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        status TEXT NOT NULL,
        total_fetched INTEGER NOT NULL DEFAULT 0,
        active_fetched INTEGER NOT NULL DEFAULT 0,
        inactive_fetched INTEGER NOT NULL DEFAULT 0,
        accounts_created INTEGER NOT NULL DEFAULT 0,
        accounts_reactivated INTEGER NOT NULL DEFAULT 0,
        accounts_revoked INTEGER NOT NULL DEFAULT 0,
        unchanged INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cf_reconciliation_runs_started
        ON cf_reconciliation_runs (started_at DESC);
    `);
    console.log("[startup] cf_reconciliation_runs migration complete");

    await db.execute(sql`
      ALTER TABLE email_analyses
        ADD COLUMN IF NOT EXISTS reply_to text,
        ADD COLUMN IF NOT EXISTS subject_analysis jsonb,
        ADD COLUMN IF NOT EXISTS technical_health jsonb,
        ADD COLUMN IF NOT EXISTS sender_trust jsonb,
        ADD COLUMN IF NOT EXISTS content_quality jsonb,
        ADD COLUMN IF NOT EXISTS can_spam_compliance jsonb;
    `);
    console.log("[startup] email_analyses migration complete");
    await db.execute(sql`
      ALTER TABLE email_analyses
        ADD COLUMN IF NOT EXISTS message_id text
    `);
    await db.execute(sql`
      ALTER TABLE email_inbox_addresses
        ADD COLUMN IF NOT EXISTS placement_check_message_id text,
        ADD COLUMN IF NOT EXISTS placement_check_received_at timestamp,
        ADD COLUMN IF NOT EXISTS placement_check_subject text
    `);
    console.log("[startup] email_inbox_addresses migration complete");
    await db.execute(sql`
      ALTER TABLE seed_inboxes
        ADD COLUMN IF NOT EXISTS oauth_needs_reconnect boolean NOT NULL DEFAULT false
    `);
    await db.execute(sql`
      ALTER TABLE seed_inboxes
        ADD COLUMN IF NOT EXISTS imap_password text,
        ADD COLUMN IF NOT EXISTS auth_method text
    `);
    console.log("[startup] seed_inboxes oauth_needs_reconnect + imap migration complete");
    await db.execute(sql`
      ALTER TABLE email_analyses
        ADD COLUMN IF NOT EXISTS placement_results jsonb,
        ADD COLUMN IF NOT EXISTS placement_confirmed_at timestamp
    `);
    console.log("[startup] email_analyses placement columns migration complete");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS postmaster_connections (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        oauth_access_token TEXT,
        oauth_refresh_token TEXT,
        oauth_token_expiry TIMESTAMP,
        connected_email TEXT,
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS postmaster_domains (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        domain_name TEXT NOT NULL,
        latest_reputation TEXT,
        latest_spam_rate REAL,
        latest_spf_ratio REAL,
        latest_dkim_ratio REAL,
        latest_dmarc_ratio REAL,
        latest_encryption_ratio REAL,
        traffic_stats JSONB,
        last_fetched_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(user_id, domain_name)
      )
    `);
    console.log("[startup] postmaster tables migration complete");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS teleprompter_scripts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS teleprompter_scripts_user_id_idx
        ON teleprompter_scripts(user_id, updated_at DESC)
    `);
    console.log("[startup] teleprompter_scripts migration complete");
    await db.execute(sql`
      ALTER TABLE teleprompter_recordings
        ADD COLUMN IF NOT EXISTS transcript_text TEXT
    `);
    await db.execute(sql`
      ALTER TABLE teleprompter_recordings
        ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'landscape'
    `);
    console.log("[startup] teleprompter_recordings transcript_text + format migration complete");
    await db.execute(sql`
      ALTER TABLE teleprompter_recordings
        ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'complete'
    `);
    console.log("[startup] teleprompter_recordings processing_status migration complete");
    // Recordings left in "processing" after a server crash/restart will never complete.
    // Mark any that have been stuck for more than 3 minutes as "failed" so the UI unblocks.
    {
      const stuckCutoff = new Date(Date.now() - 3 * 60 * 1000);
      const stuckResult = await db.execute(sql`
        UPDATE teleprompter_recordings
        SET processing_status = 'failed'
        WHERE processing_status = 'processing'
          AND created_at < ${stuckCutoff.toISOString()}
      `);
      if ((stuckResult.rowCount ?? 0) > 0) {
        console.log(`[startup] marked ${stuckResult.rowCount} stuck teleprompter recording(s) as failed`);
      }
    }
    await db.execute(sql`
      ALTER TABLE teleprompter_scripts
        ADD COLUMN IF NOT EXISTS take_count INTEGER NOT NULL DEFAULT 0
    `);
    // Backfill take_count from existing recordings so the persistent counter
    // starts above the highest take number ever recorded for each script.
    {
      const allRecs = await db.select({ scriptId: teleprompterRecordings.scriptId, title: teleprompterRecordings.title }).from(teleprompterRecordings);
      const allScripts = await db.select({ id: teleprompterScripts.id, takeCount: teleprompterScripts.takeCount }).from(teleprompterScripts);
      const takeRegex = /^Take (\d+)\s*\u2014/; // matches "Take N —"
      const maxByScript = new Map<string, number>();
      for (const rec of allRecs) {
        if (!rec.scriptId) continue;
        const m = takeRegex.exec(rec.title);
        if (!m) continue;
        const n = parseInt(m[1], 10);
        if ((maxByScript.get(rec.scriptId) ?? 0) < n) maxByScript.set(rec.scriptId, n);
      }
      for (const script of allScripts) {
        const max = maxByScript.get(script.id) ?? 0;
        if (max > script.takeCount) {
          await db.update(teleprompterScripts).set({ takeCount: max }).where(eq(teleprompterScripts.id, script.id));
        }
      }
    }
    console.log("[startup] teleprompter_scripts take_count migration complete");
    await db.execute(sql`
      ALTER TABLE scripts
        ADD COLUMN IF NOT EXISTS teleprompter_script_id VARCHAR
    `);
    console.log("[startup] scripts teleprompter_script_id migration complete");

    // DMO Tracker: switch storage from rounded minutes to exact seconds.
    // Adds *_seconds columns alongside legacy *_minutes columns and backfills
    // seconds = minutes * 60 only where seconds is still 0 (idempotent).
    // Legacy *_minutes columns are left in place untouched as a safety net.
    await db.execute(sql`
      ALTER TABLE dmo_entries
        ADD COLUMN IF NOT EXISTS vision_seconds    INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS personal_seconds  INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS expand_seconds    INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS execution_seconds INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS connecting_seconds INTEGER NOT NULL DEFAULT 0
    `);
    // Backfill is guarded: only runs if the legacy *_minutes columns still exist.
    // On fresh DBs (or DBs where legacy columns were later dropped) the IF block is a no-op,
    // so this whole migration step is safe to re-run in any schema state.
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dmo_entries' AND column_name = 'vision_minutes'
        ) THEN
          UPDATE dmo_entries SET
            vision_seconds     = CASE WHEN vision_seconds     = 0 AND vision_minutes     > 0 THEN vision_minutes     * 60 ELSE vision_seconds     END,
            personal_seconds   = CASE WHEN personal_seconds   = 0 AND personal_minutes   > 0 THEN personal_minutes   * 60 ELSE personal_seconds   END,
            expand_seconds     = CASE WHEN expand_seconds     = 0 AND expand_minutes     > 0 THEN expand_minutes     * 60 ELSE expand_seconds     END,
            execution_seconds  = CASE WHEN execution_seconds  = 0 AND execution_minutes  > 0 THEN execution_minutes  * 60 ELSE execution_seconds  END,
            connecting_seconds = CASE WHEN connecting_seconds = 0 AND connecting_minutes > 0 THEN connecting_minutes * 60 ELSE connecting_seconds END
          WHERE
            (vision_seconds     = 0 AND vision_minutes     > 0) OR
            (personal_seconds   = 0 AND personal_minutes   > 0) OR
            (expand_seconds     = 0 AND expand_minutes     > 0) OR
            (execution_seconds  = 0 AND execution_minutes  > 0) OR
            (connecting_seconds = 0 AND connecting_minutes > 0);
        END IF;
      END $$;
    `);
    console.log("[startup] dmo_entries seconds migration complete");

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_action_log_created_at_desc_idx
        ON user_action_log (created_at DESC);
    `);
    console.log("[startup] user_action_log index migration complete");

    // Projects feature tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#6366f1',
        status TEXT NOT NULL DEFAULT 'active',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS projects_user_id_idx
        ON projects(user_id, sort_order ASC, created_at DESC)
    `);
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS due_date TIMESTAMP
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_tasks (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_task_id VARCHAR,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'none',
        due_date TIMESTAMP,
        completed_at TIMESTAMP,
        tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        links JSONB NOT NULL DEFAULT '[]'::jsonb,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_tasks_project_idx
        ON project_tasks(project_id, sort_order ASC, created_at ASC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_tasks_user_idx
        ON project_tasks(user_id, due_date ASC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_tasks_parent_idx
        ON project_tasks(parent_task_id)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS task_comments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS task_comments_task_idx
        ON task_comments(task_id, created_at ASC)
    `);
    await db.execute(sql`
      ALTER TABLE task_comments
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS task_activity (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS task_activity_task_idx
        ON task_activity(task_id, created_at DESC)
    `);
    console.log("[startup] projects tables migration complete");

    // Project templates
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_templates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#6366f1',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_templates_user_idx
        ON project_templates(user_id, sort_order ASC, created_at DESC)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_template_tasks (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_id VARCHAR NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
        parent_task_id VARCHAR,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'none',
        tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        links JSONB NOT NULL DEFAULT '[]'::jsonb,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_template_tasks_template_idx
        ON project_template_tasks(template_id, sort_order ASC, created_at ASC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_template_tasks_parent_idx
        ON project_template_tasks(parent_task_id)
    `);
    console.log("[startup] project templates migration complete");

    // Kanban board columns
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_columns (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS project_columns_project_idx
        ON project_columns(project_id, sort_order ASC)
    `);
    await db.execute(sql`
      ALTER TABLE project_tasks
        ADD COLUMN IF NOT EXISTS column_id VARCHAR REFERENCES project_columns(id) ON DELETE SET NULL
    `);
    console.log("[startup] project board columns migration complete");

    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York'
    `);
    console.log("[startup] users timezone column migration complete");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS task_attachments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        object_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS task_attachments_task_idx
        ON task_attachments(task_id, created_at ASC)
    `);
    console.log("[startup] task_attachments migration complete");

    // One-time backfill: copy account-level confirmed placement results to the
    // individual email record so old confirmed emails show their result permanently.
    // Wrapped in its own try/catch so a failure here never blocks subsequent migrations.
    try {
      const addressRows = await db.execute(sql`
        SELECT user_id, last_placement_results, placement_check_message_id
        FROM email_inbox_addresses
        WHERE last_placement_results IS NOT NULL
          AND jsonb_array_length(last_placement_results::jsonb) > 0
      `);
      let backfilled = 0;
      for (const addr of addressRows.rows as Array<{ user_id: string; last_placement_results: unknown; placement_check_message_id: string | null }>) {
        // Stringify so Drizzle binds a single text param; PostgreSQL casts it to jsonb.
        const resultsJson = JSON.stringify(addr.last_placement_results);
        // Try exact message_id match first
        if (addr.placement_check_message_id) {
          const updated = await db.execute(sql`
            UPDATE email_analyses
            SET placement_results = ${resultsJson}::jsonb,
                placement_confirmed_at = NOW()
            WHERE user_id = ${addr.user_id}
              AND message_id = ${addr.placement_check_message_id}
              AND placement_results IS NULL
          `);
          if ((updated.rowCount ?? 0) > 0) { backfilled++; continue; }
        }
        // Fallback: most recently received email for this user
        const fallback = await db.execute(sql`
          UPDATE email_analyses
          SET placement_results = ${resultsJson}::jsonb,
              placement_confirmed_at = NOW()
          WHERE id = (
            SELECT id FROM email_analyses
            WHERE user_id = ${addr.user_id}
              AND placement_results IS NULL
            ORDER BY received_at DESC
            LIMIT 1
          )
        `);
        if ((fallback.rowCount ?? 0) > 0) backfilled++;
      }
      if (backfilled > 0) console.log(`[startup] backfilled placement_results onto ${backfilled} email record(s)`);
    } catch (backfillErr) {
      console.error("[startup] placement backfill skipped (non-fatal):", backfillErr);
    }

    // Fix any placement_results that were stored as a bare object instead of an array.
    // This happened for one email where last_placement_results was a single PlacementResult
    // object rather than the expected array, and was copied as-is by the backfill above.
    const fixedObjects = await db.execute(sql`
      UPDATE email_analyses
      SET placement_results = jsonb_build_array(placement_results)
      WHERE placement_results IS NOT NULL
        AND jsonb_typeof(placement_results) = 'object'
    `);
    if ((fixedObjects.rowCount ?? 0) > 0) {
      console.log(`[startup] fixed ${fixedObjects.rowCount} email_analyses row(s) where placement_results was a bare object`);
    }
    // Notification system tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        all_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_log (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        ref_id TEXT,
        sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notification_log_lookup_idx
        ON notification_log(user_id, type, ref_id, sent_at DESC)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_template_overrides (
        template_key TEXT PRIMARY KEY,
        subject_override TEXT,
        html_override TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      DELETE FROM email_template_overrides
      WHERE template_key IN ('videoScoringComplete', 'videoPracticeReminder')
    `);
    await db.execute(sql`
      UPDATE notification_preferences
      SET preferences = preferences - 'videoScoringComplete' - 'videoPracticeReminder'
      WHERE preferences ? 'videoScoringComplete' OR preferences ? 'videoPracticeReminder'
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_resource_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        description TEXT NOT NULL,
        url TEXT NOT NULL,
        anchor_text TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[startup] notification tables migration complete; retired video email settings removed");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public_api_keys (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        label TEXT,
        last_used_at TIMESTAMP,
        cf_last_checked_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS public_api_keys_user_id_idx
        ON public_api_keys(user_id)
    `);
    console.log("[startup] public_api_keys migration complete");

    // Feedback (Bug Reports & Feature Requests)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS feedback_posts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'open',
        admin_response TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS feedback_posts_user_id_idx ON feedback_posts(user_id, created_at DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS feedback_posts_type_status_idx ON feedback_posts(type, status, created_at DESC)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS feedback_votes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id VARCHAR NOT NULL REFERENCES feedback_posts(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS feedback_votes_post_id_idx ON feedback_votes(post_id)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS feedback_comments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id VARCHAR NOT NULL REFERENCES feedback_posts(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        is_admin_note BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS feedback_comments_post_id_idx ON feedback_comments(post_id, created_at ASC)
    `);
    await db.execute(sql`
      ALTER TABLE feedback_posts ADD COLUMN IF NOT EXISTS screenshot_path TEXT
    `);
    console.log("[startup] feedback tables migration complete");

    // DMO per-user goal settings
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS dmo_settings (
        user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        vision_target INTEGER NOT NULL DEFAULT 30,
        personal_target INTEGER NOT NULL DEFAULT 30,
        expand_target INTEGER NOT NULL DEFAULT 60,
        execution_target INTEGER NOT NULL DEFAULT 60,
        connecting_target INTEGER NOT NULL DEFAULT 60
      )
    `);
    console.log("[startup] dmo_settings migration complete");

    // iCal feed token for each user
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ical_token TEXT
    `);
    await db.execute(sql`
      UPDATE users
      SET ical_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
      WHERE ical_token IS NULL
    `);
    console.log("[startup] ical_token migration complete");

    // Workspace collaborators table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workspace_invites (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invite_email TEXT NOT NULL,
        invite_token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        member_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        accepted_at TIMESTAMP
      )
    `);
    // Add name columns if missing (idempotent)
    await db.execute(sql`ALTER TABLE workspace_invites ADD COLUMN IF NOT EXISTS invite_first_name TEXT`);
    await db.execute(sql`ALTER TABLE workspace_invites ADD COLUMN IF NOT EXISTS invite_last_name TEXT`);
    console.log("[startup] workspace_invites migration complete");

    // Prune DMO entries older than 5 years (1825 days) — runs at every startup
    await db.execute(sql`
      DELETE FROM dmo_entries
      WHERE date < (CURRENT_DATE - INTERVAL '1825 days')::text
    `);
    console.log("[startup] dmo_entries older than 5 years pruned");

    // Analytics connections
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_connections (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        oauth_access_token TEXT,
        oauth_refresh_token TEXT,
        oauth_token_expiry TIMESTAMP,
        connected_email TEXT,
        channel_id TEXT,
        channel_title TEXT,
        channel_handle TEXT,
        channel_thumbnail TEXT,
        uploads_playlist_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gsc_connections (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        oauth_access_token TEXT,
        oauth_refresh_token TEXT,
        oauth_token_expiry TIMESTAMP,
        connected_email TEXT,
        selected_site_url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_comment_cache (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id VARCHAR NOT NULL,
        video_title TEXT NOT NULL DEFAULT '',
        video_thumbnail TEXT NOT NULL DEFAULT '',
        video_published_at TIMESTAMP,
        threads JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_results INTEGER NOT NULL DEFAULT 0,
        cached_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, video_id)
      )
    `);
    console.log("[startup] analytics connections migration complete");
    console.log("[startup] youtube_comment_cache migration complete");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pending_attachment_uploads (
        object_path TEXT PRIMARY KEY,
        issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT NOT NULL DEFAULT '',
        task_id TEXT NOT NULL DEFAULT ''
      )
    `);
    // Add columns if table was previously created without them (idempotent)
    await db.execute(sql`ALTER TABLE pending_attachment_uploads ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE pending_attachment_uploads ADD COLUMN IF NOT EXISTS task_id TEXT NOT NULL DEFAULT ''`);
    console.log("[startup] pending_attachment_uploads migration complete");

    // Funnel Planner
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS funnels (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        canvas_data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
        thumbnail_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS funnels_user_id_updated_at_idx ON funnels (user_id, updated_at DESC)
    `);
    console.log("[startup] funnels migration complete");

    // Add share token columns to funnels
    await db.execute(sql`ALTER TABLE funnels ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE`);
    await db.execute(sql`ALTER TABLE funnels ADD COLUMN IF NOT EXISTS share_password_hash TEXT`);
    console.log("[startup] funnels share columns migration complete");

    // Funnel Brain: targeting field + context files table
    await db.execute(sql`ALTER TABLE funnels ADD COLUMN IF NOT EXISTS brain_targeting TEXT`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS funnel_brain_files (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        funnel_id VARCHAR NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'text/plain',
        file_size INTEGER NOT NULL DEFAULT 0,
        extracted_text TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS funnel_brain_files_funnel_id_idx ON funnel_brain_files (funnel_id)`);
    console.log("[startup] funnel brain migration complete");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS teleprompter_score_usage (
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, date)
      )
    `);
    console.log("[startup] teleprompter_score_usage migration complete");

    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_layout JSONB`);
    console.log("[startup] dashboard_layout migration complete");

    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS swipe_promo_links JSONB NOT NULL DEFAULT '[]'::jsonb`);
    console.log("[startup] swipe_promo_links migration complete");

    // CF grace period and revocation columns (may be absent on older DBs)
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS cf_revoked_grace_until TIMESTAMP,
        ADD COLUMN IF NOT EXISTS cf_revoked_at TIMESTAMP
    `);
    console.log("[startup] users cf_revoked_grace_until + cf_revoked_at migration complete");

    // Chrome extension push notification subscriptions
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS extension_push_subscriptions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )
    `);
    console.log("[startup] extension_push_subscriptions migration complete");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS swipe_items (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'upload',
        content TEXT,
        image_path TEXT,
        source_url TEXT,
        notes TEXT,
        promo_links JSONB NOT NULL DEFAULT '[]'::jsonb,
        share_token VARCHAR(64) UNIQUE,
        view_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("[startup] swipe_items migration complete");

    await db.execute(sql`ALTER TABLE swipe_items ADD COLUMN IF NOT EXISTS strips JSONB`);
    console.log("[startup] swipe_items strips column migration complete");

    // DMO streak aggregate cache columns (added for O(1) reads)
    await db.execute(sql`
      ALTER TABLE dmo_settings
        ADD COLUMN IF NOT EXISTS streak_current integer,
        ADD COLUMN IF NOT EXISTS streak_best integer,
        ADD COLUMN IF NOT EXISTS streak_total_days integer,
        ADD COLUMN IF NOT EXISTS streak_last_active_date varchar(10),
        ADD COLUMN IF NOT EXISTS streak_updated_at timestamp
    `);
    console.log("[startup] dmo_settings streak cache columns migration complete");

    await db.execute(sql`ALTER TABLE affiliate_links ADD COLUMN IF NOT EXISTS screenshot_url TEXT`);
    console.log("[startup] affiliate_links screenshot_url migration complete");

    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS fia_affiliate_link TEXT`);
    console.log("[startup] users fia_affiliate_link migration complete");

    await db.execute(sql`ALTER TABLE swipe_items ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log("[startup] swipe_items is_favorite migration complete");

    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS cf_grace_expiry_sent_at TIMESTAMP`);
    console.log("[startup] users cf_grace_expiry_sent_at migration complete");
    await db.execute(sql`ALTER TABLE course_resources ADD COLUMN IF NOT EXISTS subtitle TEXT`);
    console.log("[startup] course_resources subtitle migration complete");
    await db.execute(sql`
      ALTER TABLE course_lessons
        ADD COLUMN IF NOT EXISTS transcript_text TEXT,
        ADD COLUMN IF NOT EXISTS transcript_language TEXT,
        ADD COLUMN IF NOT EXISTS transcript_source TEXT,
        ADD COLUMN IF NOT EXISTS transcript_updated_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS transcript_cues JSONB,
        ADD COLUMN IF NOT EXISTS transcript_chapters JSONB
    `);
    console.log("[startup] course_lessons transcript columns migration complete");

    // Each course, module, and lesson gets a stable, readable URL segment.
    // The ordered backfill makes duplicate-title suffixes deterministic.
    await db.execute(sql`ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS slug TEXT`);
    await db.execute(sql`ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS slug TEXT`);

    const courseRows = (await pool.query(`SELECT id, title FROM courses ORDER BY created_at, id`)).rows;
    const usedCourseSlugs = new Set<string>();
    await pool.query(`UPDATE courses SET slug = 'legacy-' || id`);
    for (const course of courseRows) {
      const base = slugify(course.title);
      let slug = base;
      let suffix = 2;
      while (usedCourseSlugs.has(slug)) slug = `${base}-${suffix++}`;
      usedCourseSlugs.add(slug);
      await pool.query(`UPDATE courses SET slug = $1 WHERE id = $2`, [slug, course.id]);
    }

    const moduleRows = (await pool.query(`
      SELECT id, course_id, title FROM course_modules
      ORDER BY course_id, sort_order, created_at, id
    `)).rows;
    const usedModuleSlugs = new Map<string, Set<string>>();
    for (const module of moduleRows) {
      const used = usedModuleSlugs.get(module.course_id) ?? new Set<string>();
      const base = slugify(module.title);
      let slug = base;
      let suffix = 2;
      while (used.has(slug)) slug = `${base}-${suffix++}`;
      used.add(slug);
      usedModuleSlugs.set(module.course_id, used);
      await pool.query(`UPDATE course_modules SET slug = $1 WHERE id = $2`, [slug, module.id]);
    }

    const lessonRows = (await pool.query(`
      SELECT id, module_id, title FROM course_lessons
      ORDER BY module_id, sort_order, created_at, id
    `)).rows;
    const usedLessonSlugs = new Map<string, Set<string>>();
    for (const lesson of lessonRows) {
      const used = usedLessonSlugs.get(lesson.module_id) ?? new Set<string>();
      const base = slugify(lesson.title);
      let slug = base;
      let suffix = 2;
      while (used.has(slug)) slug = `${base}-${suffix++}`;
      used.add(slug);
      usedLessonSlugs.set(lesson.module_id, used);
      await pool.query(`UPDATE course_lessons SET slug = $1 WHERE id = $2`, [slug, lesson.id]);
    }
    console.log("[startup] readable course URL slugs migration complete");

  } catch (err) {
    console.error("[startup] migration error:", err);
  }
}


(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // Keep the deployment healthy first. These database checks are additive and
      // can safely finish after the HTTP server starts accepting health checks.
      void (async () => {
        try {
          await runStartupMigrations();
          await runMigrations();
          await bootstrapSuperAdmins();

          try {
            const senderSettings = await storage.getEmailSenderSettings();
            configureEmailSender(senderSettings.fromName, senderSettings.fromEmail);
            console.log(`[email] sender configured: ${senderSettings.fromName} <${senderSettings.fromEmail}>`);
          } catch (err: any) {
            console.warn("[email] could not load sender settings from DB, using defaults:", err?.message);
          }

          startNotificationScheduler();
          startYouTubeAnalyticsScheduler();

          // Backfill DMO streak cache for existing users who have never had it
          // computed. It stays detached so it cannot block a healthy server.
          void (async () => {
            try {
              const { pool: pgPool } = await import("./db");
              const result = await pgPool.query(`
                SELECT DISTINCT e.user_id
                FROM dmo_entries e
                LEFT JOIN dmo_settings s ON s.user_id = e.user_id
                WHERE s.streak_updated_at IS NULL
              `);
              const userIds: string[] = result.rows.map((r: any) => r.user_id);
              if (userIds.length === 0) {
                console.log("[DMO] Streak cache: all users already up to date");
                return;
              }
              console.log(`[DMO] Backfilling streak cache for ${userIds.length} user(s)…`);
              for (const uid of userIds) {
                try {
                  await storage.recomputeAndStoreDmoStreak(uid);
                } catch (e: any) {
                  console.warn(`[DMO] Backfill failed for user ${uid}:`, e?.message);
                }
              }
              console.log("[DMO] Streak cache backfill complete");
            } catch (e: any) {
              console.warn("[DMO] Streak cache backfill error:", e?.message);
            }
          })();
        } catch (err: any) {
          console.error("[startup] background initialization failed:", err?.message);
        }
      })();
    },
  );
})();
