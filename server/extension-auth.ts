import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { pool } from "./db";
import { storage } from "./storage";
import { checkCfEnrollmentByEmail } from "./clickfunnels";

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 90 * 24 * 60 * 60 * 1000;
const REQUEST_MS = 10 * 60 * 1000;
const RETRY_GRACE_MS = 60 * 1000;
export const hashExtensionToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const extensionPkceChallenge = (value: string) => createHash("sha256").update(value).digest("base64url");
const randomToken = () => randomBytes(32).toString("base64url");
const matches = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const derived = (seed: string, kind: "access" | "refresh") => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return `fte_${kind}_` + createHmac("sha256", secret).update(`extension:v1:${kind}:${seed}`).digest("hex");
};
const accountInfo = (user: any) => ({ id: user.id, displayName: user.displayName, email: user.email });
const tokens = (seed: string, row: any) => ({
  accessToken: derived(seed, "access"), refreshToken: derived(seed, "refresh"),
  accessExpiresAt: new Date(row.access_expires_at).getTime(),
  refreshExpiresAt: new Date(row.refresh_expires_at).getTime(),
});
const suspended = (user: any) => user.isDisabled && user.cfEnrolled === false && !!user.cfRevokedAt;
const activeMembership = (user: any) => user.isAdmin || !process.env.CF_API_TOKEN || !process.env.CF_COURSE_ID || user.cfEnrolled === true;
const authError = (res: Response, status: number, error: string, message: string) => res.status(status).json({ error, message });

const approvalToken = (req: Request, requestId: string) =>
  derived(`approval:${req.sessionID}:${req.session.userId}:${requestId}`, "access");

export function isExtensionApiPath(path: string) {
  return /^\/api\/v1\/(?:me|dmo(?:\/(?:settings|history))?|links(?:\/[^/]+(?:\/click)?)?|swipe(?:\/(?:request-upload-url|capture-url)|\/[^/]+\/share)?)\/?$/.test(path);
}

export async function resolveExtensionAccess(rawToken: string, allowSuspended = false) {
  if (!/^fte_access_[a-f0-9]{64}$/.test(rawToken)) return null;
  const { rows: [row] } = await pool.query(
    `SELECT * FROM extension_device_sessions WHERE access_token_hash=$1 AND revoked_at IS NULL
     AND access_expires_at > NOW() AND refresh_expires_at > NOW()`, [hashExtensionToken(rawToken)],
  );
  if (!row) return null;
  const user = await storage.getUser(row.user_id);
  if (!user) return null;
  if (user.isDisabled && !(allowSuspended && suspended(user))) {
    return { row, user, blocked: suspended(user) ? "membership_inactive" : "account_disabled" };
  }
  return { row, user, blocked: null };
}

export async function requireExtensionAccess(req: Request, res: Response, next: NextFunction, rawToken: string) {
  if (!isExtensionApiPath(req.path)) return authError(res, 403, "scope_denied", "This extension session cannot access that feature.");
  const result = await resolveExtensionAccess(rawToken);
  if (!result) return authError(res, 401, "extension_session_expired", "Please sign in to the extension again.");
  const { user, row } = result;
  if (result.blocked) return authError(res, 403, result.blocked, result.blocked === "account_disabled" ? "Account is disabled." : "Active Academy membership required.");
  // Local revocation always takes effect immediately, independently of the live-check cache.
  if (!activeMembership(user)) return authError(res, 403, "membership_inactive", "Active Academy membership required.");
  if (!user.isAdmin && process.env.CF_API_TOKEN && process.env.CF_COURSE_ID &&
      (!row.cf_last_checked_at || Date.now() - new Date(row.cf_last_checked_at).getTime() > 86400000)) {
    try {
      const info = await checkCfEnrollmentByEmail(user.email!, user.cfContactId ?? undefined);
      await storage.updateUser(user.id, { cfEnrolled: info.enrolled, cfRevokedAt: info.enrolled ? null : new Date() });
      await pool.query("UPDATE extension_device_sessions SET cf_last_checked_at=NOW() WHERE id=$1", [row.id]);
      if (!info.enrolled) return authError(res, 403, "membership_inactive", "Active Academy membership required.");
    } catch {
      // A temporary provider outage must not sign out a locally verified active member.
      // Retry the live membership check on a later request; do not cache the outage.
    }
  }
  await pool.query("UPDATE extension_device_sessions SET last_used_at=NOW() WHERE id=$1", [row.id]);
  (req as any).apiUser = user;
  next();
}

export async function revokeExtensionSessions(userId: string) {
  await pool.query("UPDATE extension_device_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
}

export function registerExtensionAuthRoutes(app: Express, requireAuth: RequestHandler) {
  const createLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });
  const tokenLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
  app.use("/api/extension/auth", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    // Only extension-owned contexts receive cross-origin access. Browser approval stays same-origin.
    const origin = req.get("origin");
    if (origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  const handle = (fn: (req: Request, res: Response) => Promise<any>): RequestHandler => (req, res, next) => {
    void fn(req, res).catch(next);
  };
  const browserOwner: RequestHandler = (req, res, next) => {
    if (req.get("sec-fetch-site") === "cross-site") {
      return authError(res, 403, "same_origin_required", "Open this page in the Toolkit.");
    }
    if (req.session.impersonatingAdminId || req.session.workspaceOwnerId) {
      return authError(res, 403, "owner_required", "Sign in to your own Academy account to connect an extension.");
    }
    next();
  };

  app.post("/api/extension/auth/start", createLimiter, handle(async (req, res) => {
    const { codeChallenge } = req.body;
    if (typeof codeChallenge !== "string" || !/^[\w-]{43}$/.test(codeChallenge)) return authError(res, 400, "invalid_request", "Invalid sign-in request.");
    const requestId = randomToken();
    const pollSecret = randomToken();
    const userCode = randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})(.{4})/, "$1-$2");
    await pool.query("DELETE FROM extension_auth_requests WHERE expires_at < NOW() - INTERVAL '1 day'");
    await pool.query(
      `INSERT INTO extension_auth_requests (id,poll_secret_hash,pkce_challenge,user_code,device_label,expires_at)
       VALUES ($1,$2,$3,$4,'Chrome extension',$5)`,
      [requestId, hashExtensionToken(pollSecret), codeChallenge, userCode, new Date(Date.now() + REQUEST_MS)],
    );
    res.json({ requestId, pollSecret, userCode, expiresAt: Date.now() + REQUEST_MS, verificationPath: `/extension/connect?request=${requestId}` });
  }));

  app.get("/api/extension/auth/request/:id", requireAuth, browserOwner, handle(async (req, res) => {
    const { rows: [row] } = await pool.query("SELECT * FROM extension_auth_requests WHERE id=$1 AND expires_at>NOW()", [req.params.id]);
    if (!row || row.status !== "pending") return authError(res, 410, "request_expired", "This sign-in request is no longer available. Start again from the extension.");
    const csrfToken = approvalToken(req, row.id);
    res.json({ userCode: row.user_code, deviceLabel: row.device_label, expiresAt: row.expires_at, status: row.status, csrfToken });
  }));

  app.post("/api/extension/auth/approve", requireAuth, browserOwner, handle(async (req, res) => {
    const { requestId, csrfToken, decision } = req.body;
    if (typeof requestId !== "string" || typeof csrfToken !== "string" ||
        !matches(approvalToken(req, requestId), csrfToken)) {
      return authError(res, 403, "invalid_approval", "Reopen the sign-in request before approving.");
    }
    if (!["approve", "deny"].includes(decision)) return authError(res, 400, "invalid_request", "Invalid decision.");
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.isDisabled || !activeMembership(user) || await storage.getCollaboratorOwner(user.id)) {
      return authError(res, 403, "membership_inactive", "An active Academy account is required.");
    }
    const updated = await pool.query(
      `UPDATE extension_auth_requests SET status=$2,user_id=$3 WHERE id=$1 AND status='pending' AND expires_at>NOW() RETURNING id`,
      [requestId, decision === "approve" ? "approved" : "denied", user.id],
    );
    if (!updated.rowCount) return authError(res, 410, "request_expired", "This request has expired or was already used.");
    res.json({ approved: decision === "approve" });
  }));

  app.post("/api/extension/auth/poll", tokenLimiter, handle(async (req, res) => {
    const { requestId, pollSecret, codeVerifier } = req.body;
    if (typeof pollSecret !== "string" || typeof codeVerifier !== "string" || !/^[\w.-]{43,128}$/.test(codeVerifier)) {
      return authError(res, 400, "invalid_request", "Invalid sign-in request.");
    }
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      const { rows: [row] } = await conn.query("SELECT * FROM extension_auth_requests WHERE id=$1 FOR UPDATE", [requestId]);
      if (!row || !matches(row.poll_secret_hash, hashExtensionToken(pollSecret)) || !matches(row.pkce_challenge, extensionPkceChallenge(codeVerifier))) {
        await conn.query("ROLLBACK");
        return authError(res, 401, "invalid_request", "Invalid sign-in request.");
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await conn.query("ROLLBACK");
        return authError(res, 410, "request_expired", "Sign-in request expired. Please try again.");
      }
      if (row.status !== "approved") {
        await conn.query("COMMIT");
        return res.json({ status: row.status });
      }
      const user = await storage.getUser(row.user_id);
      if (!user || user.isDisabled || !activeMembership(user)) {
        await conn.query("ROLLBACK");
        return authError(res, 403, "membership_inactive", "An active Academy account is required.");
      }
      const seed = `grant:${pollSecret}`;
      let session;
      if (row.consumed_at) {
        if (Date.now() - new Date(row.consumed_at).getTime() > RETRY_GRACE_MS) {
          await conn.query("ROLLBACK");
          return authError(res, 410, "request_used", "Sign-in request already used.");
        }
        session = (await conn.query("SELECT * FROM extension_device_sessions WHERE id=$1 AND revoked_at IS NULL", [row.session_id])).rows[0];
      } else {
        session = (await conn.query(
          `INSERT INTO extension_device_sessions (user_id,device_label,refresh_token_hash,access_token_hash,access_expires_at,refresh_expires_at,cf_last_checked_at)
           VALUES ($1,$2,$3,$4,$5,$6,NULL) RETURNING *`,
          [user.id, row.device_label, hashExtensionToken(derived(seed, "refresh")), hashExtensionToken(derived(seed, "access")),
            new Date(Date.now() + ACCESS_MS), new Date(Date.now() + REFRESH_MS)],
        )).rows[0];
        await conn.query("UPDATE extension_auth_requests SET consumed_at=NOW(),session_id=$2 WHERE id=$1", [row.id, session.id]);
      }
      await conn.query("COMMIT");
      if (!session || session.refresh_token_hash !== hashExtensionToken(derived(seed, "refresh"))) {
        return authError(res, 410, "request_used", "This sign-in request was already completed.");
      }
      res.json({ status: "connected", ...tokens(seed, session), account: accountInfo(user) });
    } catch (err) {
      await conn.query("ROLLBACK");
      throw err;
    } finally { conn.release(); }
  }));

  app.post("/api/extension/auth/refresh", tokenLimiter, handle(async (req, res) => {
    const raw = req.body.refreshToken;
    if (typeof raw !== "string" || !/^fte_refresh_[a-f0-9]{64}$/.test(raw)) return authError(res, 401, "extension_session_expired", "Please sign in again.");
    const tokenHash = hashExtensionToken(raw);
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      let row = (await conn.query(
        `SELECT * FROM extension_device_sessions WHERE (refresh_token_hash=$1 OR previous_refresh_token_hash=$1) FOR UPDATE`, [tokenHash],
      )).rows[0];
      if (!row || row.revoked_at || new Date(row.refresh_expires_at).getTime() < Date.now()) {
        await conn.query("ROLLBACK");
        return authError(res, 401, "extension_session_expired", "Please sign in again.");
      }
      const user = await storage.getUser(row.user_id);
      if (!user || (user.isDisabled && !suspended(user))) {
        await conn.query("UPDATE extension_device_sessions SET revoked_at=NOW() WHERE id=$1", [row.id]);
        await conn.query("COMMIT");
        return authError(res, 403, "account_disabled", "Account is disabled.");
      }
      const seed = `rotate:${raw}`;
      if (row.refresh_token_hash === tokenHash) {
        row = (await conn.query(
          `UPDATE extension_device_sessions SET previous_refresh_token_hash=refresh_token_hash,previous_refresh_until=$2,
           refresh_token_hash=$3,access_token_hash=$4,access_expires_at=$5,refresh_expires_at=$6,last_used_at=NOW()
           WHERE id=$1 RETURNING *`,
          [row.id, new Date(Date.now() + RETRY_GRACE_MS), hashExtensionToken(derived(seed, "refresh")),
            hashExtensionToken(derived(seed, "access")), new Date(Date.now() + ACCESS_MS), new Date(Date.now() + REFRESH_MS)],
        )).rows[0];
      } else if (!row.previous_refresh_until || new Date(row.previous_refresh_until).getTime() < Date.now()) {
        await conn.query("UPDATE extension_device_sessions SET revoked_at=NOW() WHERE id=$1", [row.id]);
        await conn.query("COMMIT");
        return authError(res, 401, "extension_session_expired", "This session has been revoked. Please sign in again.");
      }
      await conn.query("COMMIT");
      res.json({ ...tokens(seed, row), account: accountInfo(user) });
    } catch (err) {
      await conn.query("ROLLBACK");
      throw err;
    } finally { conn.release(); }
  }));

  app.post("/api/extension/auth/logout", tokenLimiter, handle(async (req, res) => {
    const raw = req.body.refreshToken;
    if (typeof raw === "string") await pool.query(
      "UPDATE extension_device_sessions SET revoked_at=NOW() WHERE refresh_token_hash=$1 OR previous_refresh_token_hash=$1",
      [hashExtensionToken(raw)],
    );
    res.json({ ok: true });
  }));
  app.get("/api/account/extension-sessions", requireAuth, browserOwner, handle(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { rows } = await pool.query(
      `SELECT id,device_label AS "deviceLabel",created_at AS "createdAt",last_used_at AS "lastUsedAt"
       FROM extension_device_sessions WHERE user_id=$1 AND revoked_at IS NULL AND refresh_expires_at>NOW() ORDER BY last_used_at DESC`,
      [req.session.userId],
    );
    res.json({ sessions: rows });
  }));
  app.delete("/api/account/extension-sessions/:id", requireAuth, browserOwner, handle(async (req, res) => {
    if (req.get("x-toolkit-request") !== "extension-device") {
      return authError(res, 403, "same_origin_required", "Revoke sessions from your Account page.");
    }
    await pool.query("UPDATE extension_device_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2", [req.params.id, req.session.userId]);
    res.json({ ok: true });
  }));
}
