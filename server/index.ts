import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { bootstrapSuperAdmins } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";

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

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

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

    // One-time backfill: copy account-level confirmed placement results to the
    // individual email record so old confirmed emails show their result permanently.
    // Matches by message_id when available, otherwise picks the most-recently-received
    // email for that user. Skips any email that already has placement_results set.
    const addressRows = await db.execute(sql`
      SELECT user_id, last_placement_results, placement_check_message_id
      FROM email_inbox_addresses
      WHERE last_placement_results IS NOT NULL
        AND jsonb_array_length(last_placement_results::jsonb) > 0
    `);
    let backfilled = 0;
    for (const addr of addressRows.rows as Array<{ user_id: string; last_placement_results: unknown; placement_check_message_id: string | null }>) {
      // Try exact message_id match first
      if (addr.placement_check_message_id) {
        const updated = await db.execute(sql`
          UPDATE email_analyses
          SET placement_results = ${addr.last_placement_results}::jsonb,
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
        SET placement_results = ${addr.last_placement_results}::jsonb,
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
  } catch (err) {
    console.error("[startup] migration error:", err);
  }
}

(async () => {
  await runStartupMigrations();
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
    async () => {
      log(`serving on port ${port}`);
      
      // Bootstrap super admins from environment
      await bootstrapSuperAdmins();
    },
  );
})();
