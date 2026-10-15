import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { before, after, test } from "node:test";
import express from "express";
import session from "express-session";
import { pool } from "../db";
import { registerProjectsMcpRoutes } from "./routes";
import { ensureMcpDatabase } from "./database";
import { hashToken, MCP_SCOPES, ProjectsOAuthProvider } from "./oauth";
import { requireAuth, createAuthMeHandler } from "../member-auth";

// Isolated HTTP fixture: session helpers never register in the real application.
// No project-deletion or cloud-storage setup is needed to test connection access.
const members = [randomUUID(), randomUUID(), randomUUID()];
let server: ReturnType<express.Express["listen"]>;
let base: string;
const refresh = new Map<string, string>();
const cookies = new Map<string, string>();

before(async () => {
  await ensureMcpDatabase();
  await pool.query(`INSERT INTO users(id,email,cf_enrolled,is_admin,is_disabled) VALUES
    ($1,$2,true,false,false),($3,$4,true,false,false),($5,$6,false,false,false)`,
    members.flatMap((id) => [id, `mcp-fixture-${id}@example.invalid`]));
  await pool.query(`INSERT INTO workspace_invites(owner_id,invite_email,invite_token,status,member_id,accepted_at)
    VALUES($1,$2,$3,'accepted',$4,NOW())`, [members[0], `mcp-fixture-${members[2]}@example.invalid`, randomUUID(), members[2]]);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: randomBytes(32).toString("hex"), resave: false, saveUninitialized: false }));
  app.post("/test-session", (req, res) => {
    if (!members.includes(req.body.userId)) { res.sendStatus(403); return; }
    req.session.userId = req.body.userId;
    if (req.body.userId === members[2]) req.session.workspaceOwnerId = members[0];
    res.json({ ok: true });
  });
  app.post("/test-workspace", (req, res) => {
    if (!req.session.userId || !members.includes(req.body.workspaceId)) { res.sendStatus(403); return; }
    if (req.body.workspaceId === req.session.userId) delete req.session.workspaceOwnerId;
    else req.session.workspaceOwnerId = req.body.workspaceId;
    res.json({ ok: true });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  app.get("/api/auth/me", createAuthMeHandler(true));
  app.get("/api/projects", requireAuth, (_req, res) => res.json({ ok: true }));
  app.get("/api/funnels", requireAuth, (_req, res) => res.json({ ok: true }));
  registerProjectsMcpRoutes(app, requireAuth, { origin: base });
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await pool.query("DELETE FROM project_mcp_clients WHERE id IN (SELECT client_id FROM project_mcp_grants WHERE user_id=ANY($1::varchar[]))", [members]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [members]);
  await pool.end();
});

async function cookieFor(userId = members[0]) {
  if (!cookies.has(userId)) {
    const response = await fetch(`${base}/test-session`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }) });
    cookies.set(userId, response.headers.get("set-cookie")!.split(";")[0]);
  }
  return cookies.get(userId)!;
}
async function browser(path: string, method = "GET", body?: unknown, userId = members[0], origin = base) {
  return fetch(base + path, { method, headers: { Cookie: await cookieFor(userId), Origin: origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
async function prepareAuthorization(scopes = MCP_SCOPES, userId = members[0], endpointPath = "/mcp/projects", existingClient?: any) {
  let info = existingClient;
  if (!info) {
    const registration = await fetch(`${base}/api/mcp/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "SDK test assistant", redirect_uris: ["https://ai.example.invalid/oauth/callback"],
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
    assert.equal(registration.status, 201);
    info = await registration.json();
  }
  const verifier = randomBytes(32).toString("base64url");
  const parameters = new URLSearchParams({ client_id: info.client_id, response_type: "code",
    redirect_uri: info.redirect_uris[0], scope: scopes.join(" "), state: "fixture-state",
    resource: `${base}${endpointPath}`, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const response = await fetch(`${base}/api/mcp/oauth/authorize?${parameters}`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const requestId = new URL(response.headers.get("location")!).searchParams.get("request")!;
  const consent = await browser(`/api/mcp/consent/${requestId}`, "GET", undefined, userId);
  assert.equal(consent.status, 200);
  const details = await consent.json();
  return { info, requestId, details, verifier };
}
async function authorize(scopes = MCP_SCOPES, userId = members[0], endpointPath = "/mcp/projects", existingClient?: any) {
  const { info, requestId, details, verifier } = await prepareAuthorization(scopes, userId, endpointPath, existingClient);
  const approve = await browser(`/api/mcp/consent/${requestId}`, "POST", { decision: "approve", scopes, csrfToken: details.csrfToken }, userId);
  assert.equal(approve.status, 200);
  const redirect = new URL((await approve.json()).redirectTo);
  assert.equal(redirect.searchParams.get("state"), "fixture-state");
  const code = redirect.searchParams.get("code")!;
  const exchange = async (actualVerifier = verifier) => fetch(`${base}/api/mcp/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: info.client_id,
      code, code_verifier: actualVerifier, redirect_uri: info.redirect_uris[0], resource: `${base}${endpointPath}` }),
  });
  return { info, requestId, code, exchange, details };
}
async function connection(scopes = MCP_SCOPES, userId = members[0], endpointPath = "/mcp/projects", existingClient?: any) {
  const auth = await authorize(scopes, userId, endpointPath, existingClient);
  const response = await auth.exchange();
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.ok(typeof tokens.access_token === "string" && typeof tokens.refresh_token === "string");
  const { rows: [grant] } = await pool.query("SELECT grant_id FROM project_mcp_tokens WHERE hash=$1", [hashToken(tokens.access_token)]);
  refresh.set(grant.grant_id, tokens.refresh_token);
  return { ...auth, ...tokens, grantId: grant.grant_id };
}

test("connection metadata distinguishes two workspace grants without retargeting agents and redacts lost access", async () => {
  const userId = members[2], ownerId = members[0];
  const provider = new ProjectsOAuthProvider(base);
  await pool.query("UPDATE users SET cf_enrolled=true,display_name='Personal fixture' WHERE id=$1", [userId]);
  await pool.query("UPDATE users SET display_name='Shared fixture' WHERE id=$1", [ownerId]);
  try {
    await browser("/test-workspace", "POST", { workspaceId: userId }, userId);
    const own = await connection(MCP_SCOPES, userId);
    assert.deepEqual(own.details.workspace, { id: userId, name: "Personal fixture's workspace", kind: "own", accessAvailable: true });
    await browser("/test-workspace", "POST", { workspaceId: ownerId }, userId);
    const shared = await connection(MCP_SCOPES, userId, "/mcp/projects", own.info);
    assert.deepEqual(shared.details.workspace, { id: ownerId, name: "Shared fixture's workspace", kind: "shared", accessAvailable: true });
    const readConnections = async () => {
      const response = await browser("/api/mcp/connections", "GET", undefined, userId);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return response.json();
    };
    for (const selected of [ownerId, userId]) {
      await browser("/test-workspace", "POST", { workspaceId: selected }, userId);
      const data = await readConnections();
      assert.deepEqual(data.connections.find((c: any) => c.id === own.grantId).workspace, own.details.workspace);
      assert.deepEqual(data.connections.find((c: any) => c.id === shared.grantId).workspace, shared.details.workspace);
      assert.equal((await provider.verifyAccessToken(own.access_token)).extra!.workspaceId, userId);
      assert.equal((await provider.verifyAccessToken(shared.access_token)).extra!.workspaceId, ownerId);
    }
    const assertUnavailable = async () => {
      const data = await readConnections();
      assert.deepEqual(data.connections.find((c: any) => c.id === shared.grantId).workspace,
        { id: ownerId, name: null, kind: "shared", accessAvailable: false });
      assert.ok(!JSON.stringify(data).includes("Shared fixture"), "Unauthorized names must not leave the API");
      assert.equal(data.connections.find((c: any) => c.id === own.grantId).workspace.accessAvailable, true);
      await assert.rejects(() => provider.verifyAccessToken(shared.access_token));
      await assert.rejects(() => provider.exchangeRefreshToken(shared.info, refresh.get(shared.grantId)!));
      const response = await fetch(`${base}/mcp/agent`, { method: "POST", headers: {
        Authorization: `Bearer ${shared.access_token}`, "Content-Type": "application/json",
      }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
      assert.equal(response.status, 401);
      await browser("/test-workspace", "POST", { workspaceId: ownerId }, userId);
      assert.equal((await browser(`/api/mcp/consent/${shared.requestId}`, "GET", undefined, userId)).status, 403);
      await browser("/test-workspace", "POST", { workspaceId: userId }, userId);
    };
    for (const status of ["pending", "revoked"]) {
      await pool.query("UPDATE workspace_invites SET status=$1 WHERE member_id=$2 AND owner_id=$3", [status, userId, ownerId]);
      await assertUnavailable();
    }
    await pool.query("UPDATE workspace_invites SET status='accepted' WHERE member_id=$1 AND owner_id=$2", [userId, ownerId]);
    for (const change of ["cf_enrolled=false", "is_disabled=true", "cf_revoked_at=NOW()"]) {
      await pool.query(`UPDATE users SET ${change} WHERE id=$1`, [ownerId]);
      await assertUnavailable();
      await pool.query("UPDATE users SET cf_enrolled=true,is_disabled=false,cf_revoked_at=NULL WHERE id=$1", [ownerId]);
    }
    assert.equal((await browser(`/api/mcp/connections/${own.grantId}`, "DELETE", undefined, members[1])).status, 404);
    await pool.query("UPDATE workspace_invites SET status='revoked' WHERE member_id=$1 AND owner_id=$2", [userId, ownerId]);
    assert.equal((await browser(`/api/mcp/connections/${shared.grantId}`, "DELETE", undefined, userId)).status, 200,
      "Lost workspace access must not prevent removing an actor-owned connection");
  } finally {
    await pool.query("UPDATE workspace_invites SET status='accepted' WHERE member_id=$1 AND owner_id=$2", [userId, ownerId]);
    await pool.query("UPDATE users SET cf_enrolled=true,is_disabled=false,cf_revoked_at=NULL,display_name=NULL WHERE id=$1", [ownerId]);
    await pool.query("UPDATE users SET cf_enrolled=false,display_name=NULL WHERE id=$1", [userId]);
    await browser("/test-workspace", "POST", { workspaceId: ownerId }, userId);
  }
});

test("consent rejects workspace changes and rechecks shared access before granting", async () => {
  const userId = members[0], sharedId = members[1];
  const inviteId = randomUUID();
  await pool.query(`INSERT INTO workspace_invites(id,owner_id,invite_email,invite_token,status,member_id,accepted_at)
    VALUES($1,$2,$3,$4,'accepted',$5,NOW())`, [inviteId, sharedId, `mcp-fixture-${userId}@example.invalid`, randomUUID(), userId]);
  try {
    const pending = await prepareAuthorization(MCP_SCOPES, userId);
    assert.equal(pending.details.workspace.id, userId);
    const { rows: [{ count: beforeCount }] } = await pool.query("SELECT COUNT(*) FROM project_mcp_grants WHERE user_id=$1", [userId]);
    await browser("/test-workspace", "POST", { workspaceId: sharedId }, userId);
    const decision = { csrfToken: pending.details.csrfToken, decision: "approve", scopes: MCP_SCOPES };
    const changed = await browser(`/api/mcp/consent/${pending.requestId}`, "POST", decision, userId);
    assert.equal(changed.status, 409);
    assert.match((await changed.json()).message, /workspace changed/i);
    const reloaded = await browser(`/api/mcp/consent/${pending.requestId}`, "GET", undefined, userId);
    assert.equal(reloaded.status, 200);
    const sharedConsent = await reloaded.json();
    assert.equal(sharedConsent.workspace.id, sharedId);
    assert.equal(sharedConsent.workspace.kind, "shared");
    await pool.query("UPDATE workspace_invites SET status='revoked' WHERE id=$1", [inviteId]);
    assert.equal((await browser(`/api/mcp/consent/${pending.requestId}`, "POST",
      { ...decision, csrfToken: sharedConsent.csrfToken }, userId)).status, 403);
    const { rows: [{ count: afterCount }] } = await pool.query("SELECT COUNT(*) FROM project_mcp_grants WHERE user_id=$1", [userId]);
    assert.equal(afterCount, beforeCount);
    await pool.query("UPDATE workspace_invites SET status='accepted' WHERE id=$1", [inviteId]);
    const accepted = await browser(`/api/mcp/consent/${pending.requestId}`, "POST",
      { ...decision, csrfToken: sharedConsent.csrfToken }, userId);
    assert.equal(accepted.status, 200);
    const { rows: [grant] } = await pool.query("SELECT workspace_id FROM project_mcp_grants WHERE user_id=$1 AND client_id=$2", [userId, pending.info.client_id]);
    assert.equal(grant.workspace_id, sharedId);
  } finally {
    await pool.query("DELETE FROM workspace_invites WHERE id=$1", [inviteId]);
    await browser("/test-workspace", "POST", { workspaceId: userId }, userId);
  }
});

test("production session checks retain invited teammates and allow safe connection management after selected access is revoked", async () => {
  const userId = members[2], ownerId = members[0];
  assert.equal((await fetch(`${base}/api/mcp/connections`)).status, 401);
  assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
  await browser("/test-workspace", "POST", { workspaceId: ownerId }, userId);
  try {
    const me = await browser("/api/auth/me", "GET", undefined, userId);
    assert.equal(me.status, 200, "An accepted teammate does not need their own paid membership");
    const identity = (await me.json()).user;
    assert.equal(identity.id, userId);
    assert.equal(identity.cfEnrolled, false);
    assert.equal(identity.workspaceOwnerId, ownerId);
    assert.equal((await browser("/api/projects", "GET", undefined, userId)).status, 200);
    assert.equal((await browser("/api/funnels", "GET", undefined, userId)).status, 403);
    // A reload after personal sign-in can retain identity based on accepted
    // shared access, even before selecting that workspace.
    await browser("/test-workspace", "POST", { workspaceId: userId }, userId);
    assert.equal((await browser("/api/auth/me", "GET", undefined, userId)).status, 200);
    await browser("/test-workspace", "POST", { workspaceId: ownerId }, userId);
    const grant = await connection(MCP_SCOPES, userId);
    await pool.query("UPDATE workspace_invites SET status='revoked' WHERE member_id=$1 AND owner_id=$2", [userId, ownerId]);
    assert.equal((await browser("/api/auth/me", "GET", undefined, userId)).status, 200,
      "Losing selected workspace access must not erase the identity needed to remove connections");
    assert.equal((await browser("/api/projects", "GET", undefined, userId)).status, 403);
    assert.equal((await browser("/api/mcp/config", "GET", undefined, userId)).status, 200);
    const list = await browser("/api/mcp/connections", "GET", undefined, userId);
    assert.equal(list.status, 200);
    const unavailable = (await list.json()).connections.find((c: any) => c.id === grant.grantId);
    assert.equal(unavailable.workspace.name, null);
    assert.equal(unavailable.workspace.accessAvailable, false);
    assert.equal((await browser(`/api/mcp/consent/${grant.requestId}`, "GET", undefined, userId)).status, 403);
    assert.equal((await browser(`/api/mcp/connections/${grant.grantId}`, "DELETE", undefined, userId)).status, 200);
    await pool.query("UPDATE users SET is_disabled=true WHERE id=$1", [userId]);
    assert.equal((await browser("/api/mcp/connections", "GET", undefined, userId)).status, 403,
      "Disabled identities cannot manage connections");
    assert.equal((await browser("/api/mcp/connections", "GET", undefined, userId)).status, 401);
  } finally {
    await pool.query("UPDATE users SET is_disabled=false WHERE id=$1", [userId]);
    await pool.query("UPDATE workspace_invites SET status='accepted' WHERE member_id=$1 AND owner_id=$2", [userId, ownerId]);
    cookies.delete(userId);
  }
});

test("membership-required session snapshots still reject an unenrolled personal account without shared access", async () => {
  const userId = members[1];
  await pool.query("UPDATE users SET cf_enrolled=false WHERE id=$1", [userId]);
  try {
    const response = await browser("/api/auth/me", "GET", undefined, userId);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "cf_not_enrolled");
    assert.equal((await browser("/api/mcp/connections", "GET", undefined, userId)).status, 401);
  } finally {
    await pool.query("UPDATE users SET cf_enrolled=true WHERE id=$1", [userId]);
    cookies.delete(userId);
  }
});
