import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { test } from "node:test";
import express from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import { pool } from "./db";
import { storage } from "./storage";
import { registerWorkspaceRoutes, listAvailableWorkspaces, defaultWorkspaceOwner, validInviteForEmail, workspaceInviteReturnPath, isSharedWorkspaceRequestAllowed } from "./workspaces";

test("personal login, invitation acceptance, and workspace authorization over HTTP", async (t) => {
  const ids = Array.from({ length: 6 }, () => randomUUID());
  const [member, ownerA, ownerB, stranger, socialMember, disabledMember] = ids;
  const email = (id: string) => `workspace-test-${id}@example.invalid`;
  const password = "Fixture-password-2026";
  const hash = await bcrypt.hash(password, 10);
  const inviteIds: string[] = [];
  const extraUserIds: string[] = [];
  const app = express();
  app.use(express.json(), session({ secret: "isolated-test-session-secret-only", resave: false, saveUninitialized: false }));
  // Fixture setup is confined to this isolated test app, never the real server.
  app.post("/fixture/session", (req, res) => {
    req.session.userId = req.body.userId;
    if (req.body.impersonating) req.session.impersonatingAdminId = stranger;
    res.json({ ok: true });
  });
  app.get("/fixture/context", (req, res) => res.json({ actor: req.session.userId, owner: req.session.workspaceOwnerId || req.session.userId }));
  registerWorkspaceRoutes(app, (_req, _res, next) => next());
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const call = (path: string, body?: unknown, cookie?: string, origin = base) => fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];
  const login = async (id: string, impersonating = false) => cookieOf(await call("/fixture/session", { userId: id, impersonating }));
  const invite = async (owner: string, targetEmail: string) => {
    const result = await storage.createWorkspaceInvite(owner, targetEmail, randomBytes(32).toString("hex"));
    inviteIds.push(result.id);
    return result;
  };
  try {
    for (const id of ids) {
      await pool.query(`INSERT INTO users(id,email,display_name,password_hash,cf_enrolled,is_disabled)
        VALUES($1,$2,$3,$4,$5,$6)`, [id, email(id), "Workspace test", id === socialMember ? null : hash, id !== socialMember, id === disabledMember]);
    }
    let cookie = await login(member);
    const invitation = await invite(ownerA, email(member));

    await t.test("metadata separates existing accounts from new password creation", async () => {
      const response = await call(`/api/workspace/invite/info?token=${invitation.inviteToken}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const info = await response.json();
      assert.equal(info.accountExists, true); assert.equal(info.hasPassword, true);
      assert.equal(workspaceInviteReturnPath(invitation.inviteToken), `/workspace/accept?token=${invitation.inviteToken}`);
      assert.equal(workspaceInviteReturnPath("//evil.example"), undefined);
      assert.equal(await validInviteForEmail(invitation.inviteToken, email(stranger)), undefined);
    });
    await t.test("new password cannot overwrite an existing account", async () => {
      const response = await call("/api/workspace/invite/accept", { token: invitation.inviteToken, password: "Different-new-password" });
      assert.equal(response.status, 401);
      assert.match((await response.json()).message, /existing FIA password/);
      assert.equal((await storage.getUser(member))?.passwordHash, hash);
      assert.equal((await storage.getWorkspaceInviteByToken(invitation.inviteToken))?.status, "pending");
    });
    await t.test("existing password accepts without duplication and rotates the session", async () => {
      const response = await call("/api/workspace/invite/accept", { token: invitation.inviteToken, password }, cookie);
      assert.equal(response.status, 200);
      const nextCookie = cookieOf(response);
      assert.notEqual(nextCookie, cookie);
      cookie = nextCookie;
      assert.deepEqual(await (await call("/fixture/context", undefined, cookie)).json(), { actor: member, owner: ownerA });
      assert.equal((await storage.getUser(member))?.passwordHash, hash);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE email=$1", [email(member)])).rows[0].n, 1);
    });
    await t.test("one identity lists own plus multiple accepted workspaces, not pending invitations", async () => {
      const second = await invite(ownerB, email(member));
      await storage.acceptWorkspaceInvite(second.inviteToken, member);
      await invite(stranger, email(member));
      const response = await call("/api/workspaces", undefined, cookie);
      const data = await response.json();
      assert.equal(data.activeWorkspaceId, ownerA);
      assert.deepEqual(new Set(data.workspaces.map((w: { id: string }) => w.id)), new Set([member, ownerA, ownerB]));
      assert.equal(data.workspaces[0].isOwn, true);
      assert.equal(await defaultWorkspaceOwner(member), undefined);
    });
    await t.test("switching changes workspace but preserves the identity", async () => {
      assert.equal((await call("/api/workspaces/active", { workspaceId: member }, cookie)).status, 200);
      assert.deepEqual(await (await call("/fixture/context", undefined, cookie)).json(), { actor: member, owner: member });
      assert.equal((await call("/api/workspaces/active", { workspaceId: ownerB }, cookie)).status, 200);
      assert.deepEqual(await (await call("/fixture/context", undefined, cookie)).json(), { actor: member, owner: ownerB });
    });
    await t.test("uninvited owners, forged origins, malformed requests and anonymous switching are rejected", async () => {
      assert.equal((await call("/api/workspaces/active", { workspaceId: stranger }, cookie)).status, 403);
      assert.equal((await call("/api/workspaces/active", { workspaceId: member }, cookie, "https://evil.example")).status, 403);
      assert.equal((await call("/api/workspaces/active", { workspaceId: member }, cookie, "not-a-url")).status, 403);
      assert.equal((await call("/api/workspaces/active", { workspaceId: "bad" }, cookie)).status, 400);
      assert.equal((await call("/api/workspaces/active", { workspaceId: member })).status, 401);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/projects/abc/tasks"), true);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/tasks/abc/attachments"), true);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/account/notification-preferences"), true);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/mcp/connections"), true);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/link-vault"), false);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/funnels"), false);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/lessons/abc"), false);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/tasks-malicious"), false);
    });
    await t.test("membership loss removes a shared workspace but leaves other choices available", async () => {
      await pool.query("UPDATE users SET cf_enrolled=false, cf_revoked_at=now() WHERE id=$1", [ownerB]);
      assert.equal((await call("/api/workspaces/active", { workspaceId: ownerB }, cookie)).status, 403);
      const data = await (await call("/api/workspaces", undefined, cookie)).json();
      assert.equal(data.activeWorkspaceId, ownerB);
      assert.deepEqual(new Set(data.workspaces.map((w: { id: string }) => w.id)), new Set([member, ownerA]));
      assert.equal((await call("/api/workspaces/active", { workspaceId: member }, cookie)).status, 200);
    });
    await t.test("revocation removes access immediately", async () => {
      await storage.revokeWorkspaceInvite(invitation.id, ownerA);
      assert.equal((await call("/api/workspaces/active", { workspaceId: ownerA }, cookie)).status, 403);
      assert.equal((await listAvailableWorkspaces(member)).some((w) => w.id === ownerA), false);
    });
    await t.test("social-only existing accounts get recovery guidance, not a new password", async () => {
      const social = await invite(ownerA, email(socialMember));
      const info = await (await call(`/api/workspace/invite/info?token=${social.inviteToken}`)).json();
      assert.equal(info.accountExists, true); assert.equal(info.hasPassword, false);
      const response = await call("/api/workspace/invite/accept", { token: social.inviteToken, password });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "existing_account_no_password");
      assert.equal((await storage.getUser(socialMember))?.passwordHash, null);
    });
    await t.test("new teammates create one personal account with shared access only", async () => {
      const freshEmail = `workspace-new-${randomUUID()}@example.invalid`;
      const fresh = await invite(ownerA, freshEmail);
      assert.equal((await (await call(`/api/workspace/invite/info?token=${fresh.inviteToken}`)).json()).accountExists, false);
      assert.equal((await call("/api/workspace/invite/accept", { token: fresh.inviteToken, password: "short" })).status, 400);
      const response = await call("/api/workspace/invite/accept", { token: fresh.inviteToken, password });
      assert.equal(response.status, 200);
      const data = await response.json(); extraUserIds.push(data.userId);
      assert.deepEqual((await listAvailableWorkspaces(data.userId)).map((w) => w.id), [ownerA]);
      assert.equal(await defaultWorkspaceOwner(data.userId), ownerA);
      assert.equal(await bcrypt.compare(password, (await storage.getUser(data.userId))!.passwordHash!), true);
      assert.equal((await call("/api/workspace/invite/accept", { token: fresh.inviteToken, password })).status, 409);
    });
    await t.test("disabled accounts and impersonating sessions cannot join or switch", async () => {
      const disabledInvite = await invite(ownerA, email(disabledMember));
      assert.equal((await call("/api/workspace/invite/accept", { token: disabledInvite.inviteToken, password })).status, 403);
      assert.equal((await call("/api/workspaces", undefined, await login(disabledMember))).status, 403);
      const impersonating = await login(member, true);
      assert.equal((await call("/api/workspaces", undefined, impersonating)).status, 403);
      assert.equal((await call("/api/workspaces/active", { workspaceId: member }, impersonating)).status, 403);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.query("DELETE FROM workspace_invites WHERE id=ANY($1::varchar[])", [inviteIds]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [[...ids, ...extraUserIds]]);
    await pool.end();
  }
});
