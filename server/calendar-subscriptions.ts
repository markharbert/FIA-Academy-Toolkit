import { randomBytes } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { storage } from "./storage";

// A shared bearer belongs to the actor and the specific invitation, never to
// the owner's private calendar. Keeping the invitation ID prevents rejoining
// a workspace from resurrecting an old subscription.
export async function ensureCalendarFeedGrantsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_feed_grants (
      actor_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      owner_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invite_id VARCHAR NOT NULL REFERENCES workspace_invites(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL DEFAULT 'projects' CHECK (scope = 'projects'),
      revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (actor_id, owner_id)
    )`);
}

async function sharedInvitation(actorId: string, ownerId: string) {
  const { rows } = await pool.query(`
    SELECT i.id FROM workspace_invites i
    JOIN users actor ON actor.id=i.member_id
    JOIN users owner ON owner.id=i.owner_id
    WHERE i.member_id=$1 AND i.owner_id=$2 AND i.status='accepted'
      AND NOT actor.is_disabled AND NOT owner.is_disabled
      AND (owner.is_admin OR (owner.cf_enrolled IS TRUE AND owner.cf_revoked_at IS NULL))
    ORDER BY i.accepted_at DESC, i.id LIMIT 1`, [actorId, ownerId]);
  return rows[0]?.id as string | undefined;
}

export async function resolveCalendarFeed(token: string) {
  // Legacy tokens have historically been both 48 and 64 hex characters.
  if (!/^(?:[a-f0-9]{48}|[a-f0-9]{64})$/.test(token)) return null;
  const { rows } = await pool.query(`
    SELECT g.owner_id FROM calendar_feed_grants g
    JOIN workspace_invites i ON i.id=g.invite_id
      AND i.owner_id=g.owner_id AND i.member_id=g.actor_id AND i.status='accepted'
    JOIN users actor ON actor.id=g.actor_id
    JOIN users owner ON owner.id=g.owner_id
    WHERE g.token=$1 AND g.revoked_at IS NULL AND g.scope='projects'
      AND NOT actor.is_disabled AND NOT owner.is_disabled
      AND (owner.is_admin OR (owner.cf_enrolled IS TRUE AND owner.cf_revoked_at IS NULL))`, [token]);
  if (rows[0]) {
    const user = await storage.getUser(rows[0].owner_id);
    return user ? { user, scope: "projects" as const } : null;
  }
  // Never fall back to the actor or owner's token for an invalid shared grant.
  const user = await storage.getUserByIcalToken(token);
  if (!user || user.isDisabled || (!user.isAdmin && (user.cfEnrolled !== true || user.cfRevokedAt))) return null;
  return { user, scope: "personal" as const };
}

// All feed scopes deliberately read ONLY Project Manager data. In particular,
// adding personal calendar sources here must never broaden a shared grant.
export async function getCalendarFeedData(token: string) {
  const feed = await resolveCalendarFeed(token);
  if (!feed) return null;
  const [tasks, projects] = await Promise.all([
    storage.getAllTasksWithDueDatesForUser(feed.user.id),
    storage.getProjectsForUser(feed.user.id),
  ]);
  return { ...feed, tasks, projects };
}

export function registerProjectCalendarFeedRoute(
  app: Express,
  render: (data: NonNullable<Awaited<ReturnType<typeof getCalendarFeedData>>>) => string,
) {
  app.get("/api/calendar/ical/:token", async (req, res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    try {
      const data = await getCalendarFeedData(req.params.token.replace(/\.ics$/, ""));
      if (!data) { res.status(404).type("text/plain").send("Calendar not found"); return; }
      res.set("Content-Type", "text/calendar; charset=utf-8");
      res.set("Content-Disposition", 'attachment; filename="academy-toolkit.ics"');
      res.send(render(data));
    } catch (error) {
      console.error("[ical] feed error:", error instanceof Error ? error.name : "Unknown error");
      res.status(500).type("text/plain").send("Failed to generate calendar");
    }
  });
}

export function registerCalendarSubscriptionRoutes(app: Express, requireAuth: RequestHandler) {
  const handle = (rotate: boolean, revoke = false): RequestHandler => async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.session.impersonatingAdminId) {
        res.status(403).json({ message: "End impersonation before managing calendar subscriptions." }); return;
      }
      const actorId = req.session.userId!;
      const ownerId = req.session.workspaceOwnerId || actorId;
      const expectedWorkspace = req.method === "GET" ? req.query.workspaceId : req.body?.workspaceId;
      if (expectedWorkspace !== undefined && expectedWorkspace !== ownerId) {
        res.status(409).json({ message: "Your workspace changed. Reload before managing this subscription." }); return;
      }
      let token: string;
      if (ownerId === actorId) {
        const user = await storage.getUser(actorId);
        if (!user || user.isDisabled || (!user.isAdmin && (user.cfEnrolled !== true || user.cfRevokedAt))) {
          res.status(403).json({ message: "Active membership required." }); return;
        }
        if (revoke) {
          await pool.query("UPDATE users SET ical_token=NULL WHERE id=$1", [actorId]);
          res.json({ ok: true }); return;
        }
        if (rotate) token = await storage.rotateIcalToken(actorId);
        else {
          // Concurrent first reads must return the same personal bearer.
          const { rows } = await pool.query(
            "UPDATE users SET ical_token=COALESCE(ical_token,$2) WHERE id=$1 RETURNING ical_token",
            [actorId, randomBytes(24).toString("hex")],
          );
          token = rows[0].ical_token;
        }
      } else {
        const invitationId = await sharedInvitation(actorId, ownerId);
        if (!invitationId) {
          res.status(403).json({ message: "Workspace access has been revoked." }); return;
        }
        if (revoke) {
          await pool.query("UPDATE calendar_feed_grants SET revoked_at=CURRENT_TIMESTAMP WHERE actor_id=$1 AND owner_id=$2", [actorId, ownerId]);
          res.json({ ok: true }); return;
        }
        const candidate = randomBytes(32).toString("hex");
        const { rows } = await pool.query(`
          INSERT INTO calendar_feed_grants(actor_id,owner_id,invite_id,token)
          VALUES($1,$2,$3,$4)
          ON CONFLICT(actor_id,owner_id) DO UPDATE SET
            token=CASE WHEN $5 OR calendar_feed_grants.revoked_at IS NOT NULL
              OR calendar_feed_grants.invite_id<>EXCLUDED.invite_id
              THEN EXCLUDED.token ELSE calendar_feed_grants.token END,
            invite_id=EXCLUDED.invite_id, revoked_at=NULL
          RETURNING token`, [actorId, ownerId, invitationId, candidate, rotate]);
        token = rows[0].token;
      }
      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      res.json({
        url: `${proto}://${host}/api/calendar/ical/${token}.ics`,
        workspaceId: ownerId,
        scope: ownerId === actorId ? "personal" : "projects",
      });
    } catch (error) {
      // Do not log bearer URLs or tokens.
      console.error("[ical] subscription error:", error instanceof Error ? error.name : "Unknown error");
      res.status(500).json({ message: "Failed to manage calendar subscription" });
    }
  };
  app.get("/api/calendar/ical-url", requireAuth, handle(false));
  app.post("/api/calendar/rotate-ical-token", requireAuth, handle(true));
  app.delete("/api/calendar/ical-url", requireAuth, handle(false, true));
}
