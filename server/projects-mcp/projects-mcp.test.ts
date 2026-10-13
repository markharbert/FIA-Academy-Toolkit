import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { before, after, test } from "node:test";
import express from "express";
import session from "express-session";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { pool } from "../db";
import { storage } from "../storage";
import { insertProjectSchema } from "../../shared/schema";
import { registerProjectsMcpRoutes } from "./routes";
import { ensureMcpDatabase } from "./database";
import { hashToken, MCP_SCOPES } from "./oauth";
import { executeProjectTool, inspectInterruptedDeletion, projectTools, type ToolContext } from "./tools";
import { withDeletionLock } from "./recovery";
import { ObjectNotFoundError, ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import type { Pool } from "pg";
import { Storage } from "@google-cloud/storage";
import { deleteUnchangedTarget, type DeletionKind } from "../project-deletion";
import { ensureProjectDeletionConstraints } from "../project-deletion-constraints";

// Isolated test-only HTTP server. No test login/bypass is registered in the app.
const members = [randomUUID(), randomUUID(), randomUUID()];
let server: ReturnType<express.Express["listen"]>;
let base: string;
const clients: Client[] = [];
const refresh = new Map<string, string>();
const cookies = new Map<string, string>();
let foreignProject: string;
let foreignSection: string;

before(async () => {
  await ensureMcpDatabase();
  await ensureProjectDeletionConstraints(pool);
  await pool.query(`INSERT INTO users(id,email,cf_enrolled,is_admin,is_disabled) VALUES
    ($1,$2,true,false,false),($3,$4,true,false,false),($5,$6,false,false,false)`,
  members.flatMap((id) => [id, `mcp-fixture-${id}@example.invalid`]));
  await pool.query(`INSERT INTO workspace_invites(owner_id,invite_email,invite_token,status,member_id,accepted_at)
    VALUES($1,$2,$3,'accepted',$4,NOW())`, [members[0], `mcp-fixture-${members[2]}@example.invalid`, randomUUID(), members[2]]);
  const foreign = await storage.createProject(members[1], insertProjectSchema.parse({ name: "Other member's private project" }));
  foreignProject = foreign.id;
  foreignSection = (await storage.createColumn(members[1], foreign.id, { name: "Private section" })).id;
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: randomBytes(32).toString("hex"), resave: false, saveUninitialized: false }));
  app.post("/test-session", (req, res) => {
    if (!members.includes(req.body.userId)) { res.sendStatus(403); return; }
    req.session.userId = req.body.userId;
    if (req.body.userId === members[2]) req.session.workspaceOwnerId = members[0];
    res.json({ ok: true });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  registerProjectsMcpRoutes(app, (req, res, next) => {
    if (!req.session.userId) { res.sendStatus(401); return; }
    next();
  }, { origin: base });
});

after(async () => {
  for (const client of clients) await client.close().catch(() => {});
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
async function authorize(scopes = MCP_SCOPES, userId = members[0], endpointPath = "/mcp/projects") {
  const registration = await fetch(`${base}/api/mcp/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "SDK test assistant", redirect_uris: ["https://ai.example.invalid/oauth/callback"],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  assert.equal(registration.status, 201);
  const info = await registration.json();
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
async function connection(scopes = MCP_SCOPES, userId = members[0], endpointPath = "/mcp/projects") {
  const auth = await authorize(scopes, userId, endpointPath);
  const response = await auth.exchange();
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.ok(typeof tokens.access_token === "string" && typeof tokens.refresh_token === "string");
  const { rows: [grant] } = await pool.query("SELECT grant_id FROM project_mcp_tokens WHERE hash=$1", [hashToken(tokens.access_token)]);
  refresh.set(grant.grant_id, tokens.refresh_token);
  const client = new Client({ name: "academy-projects-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}${endpointPath}`),
    { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
  return { ...auth, ...tokens, client, grantId: grant.grant_id };
}
async function tool(client: Client, name: string, args: Record<string, unknown> = {}, expectError = false) {
  const response: any = await client.callTool({ name, arguments: args });
  let value: any;
  try { value = JSON.parse(response.content[0].text); }
  catch (error) {
    if (!response.isError || !expectError) throw error;
    value = { message: response.content[0].text };
  }
  assert.equal(!!response.isError, expectError, expectError ? "Expected a denied tool call" : value.message || "Tool should succeed");
  return value;
}
const mutation = () => randomUUID();
async function createProject(client: Client, name = "Launch fixture") {
  return tool(client, "create_project", { request_id: mutation(), project: { name } });
}
async function confirmDeletion(client: Client, preview: any) {
  const result = await tool(client, "confirm_deletion", {
    request_id: mutation(), approval_id: preview.approvalId, confirmed: true,
  });
  assert.equal(result.status, "completed");
  return result;
}
async function assertDeletionToolsListed(client: Client) {
  const { tools } = await client.listTools();
  const confirm = tools.find((t) => t.name === "confirm_deletion");
  const cancel = tools.find((t) => t.name === "cancel_deletion");
  assert.ok(confirm, "tools/list must advertise confirm_deletion to every MCP client");
  assert.ok(cancel, "tools/list must advertise cancel_deletion to every MCP client");
  assert.deepEqual([...(confirm.inputSchema.required || [])].sort(), ["approval_id", "confirmed", "request_id"]);
  assert.equal((confirm.inputSchema.properties?.confirmed as any)?.const, true);
  assert.deepEqual(cancel.inputSchema.required, ["approval_id"]);
  for (const name of ["delete_project", "delete_task", "delete_section", "delete_template",
    "delete_template_task", "delete_comment", "delete_attachment"]) {
    assert.match(tools.find((t) => t.name === name)?.description || "", /only after they explicitly say yes in the conversation/);
  }
}

test("FIA Toolkit agent endpoint supports discovery, OAuth, tools, and existing project connections", async () => {
  const metadata = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp/agent`)).json();
  assert.equal(metadata.resource, `${base}/mcp/agent`);
  assert.equal(metadata.resource_name, "FIA Toolkit");
  assert.equal(metadata.resource_logo_uri, `${base}/lion-logo.png`);
  for (const suffix of ["", "/mcp/projects"]) {
    const discovery = await fetch(`${base}/.well-known/oauth-protected-resource${suffix}`,
      { headers: { Origin: "https://ai-client.example" } });
    assert.equal(discovery.headers.get("access-control-allow-origin"), "*");
    const info = await discovery.json();
    assert.equal(info.resource_name, "FIA Toolkit");
    assert.equal(info.resource_logo_uri, `${base}/lion-logo.png`);
    assert.equal(info.resource, `${base}/mcp/${suffix ? "projects" : "agent"}`);
  }
  const actor = await connection(MCP_SCOPES, members[0], "/mcp/agent");
  assert.equal(actor.client.getServerVersion()?.name, "fia-toolkit");
  assert.equal(actor.client.getServerVersion()?.version, "1.1.0");
  assert.equal(actor.client.getServerVersion()?.title, "FIA Toolkit");
  assert.equal(actor.client.getServerVersion()?.websiteUrl, `${base}/`);
  assert.deepEqual(actor.client.getServerVersion()?.icons,
    [{ src: `${base}/lion-logo.png`, mimeType: "image/png", sizes: ["540x540"] }]);
  await assertDeletionToolsListed(actor.client);
  // Simulate a grant issued before the URL rename, without changing its scope.
  await pool.query("UPDATE project_mcp_grants SET resource=$1 WHERE id=$2", [`${base}/mcp/projects`, actor.grantId]);
  await assertDeletionToolsListed(actor.client);
  const legacy = new Client({ name: "legacy-fixture", version: "1.0.0" });
  clients.push(legacy);
  await legacy.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/projects`),
    { requestInit: { headers: { Authorization: `Bearer ${actor.access_token}` } } }));
  await assertDeletionToolsListed(legacy);
  // The alias must not broaden the audience check to other origins.
  await pool.query("UPDATE project_mcp_grants SET resource=$1 WHERE id=$2", ["https://other.example.invalid/mcp/agent", actor.grantId]);
  await assert.rejects(() => actor.client.listTools());
});

test("OAuth discovery, PKCE, one-use codes, consent binding, and hashed token storage", async () => {
  const metadata = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
  assert.equal(metadata.token_endpoint, `${base}/api/mcp/oauth/token`);
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp/projects`)).json();
  assert.equal(resource.resource, `${base}/mcp/projects`);
  assert.deepEqual(resource.scopes_supported, MCP_SCOPES);
  const noAuth = await fetch(`${base}/mcp/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(noAuth.status, 401);
  assert.ok(noAuth.headers.get("www-authenticate")?.includes("oauth-protected-resource/mcp/projects"));
  assert.ok(noAuth.headers.get("www-authenticate")?.includes("projects:write"));
  const auth = await authorize();
  assert.equal((await auth.exchange("incorrect-verifier")).status, 400);
  const response = await auth.exchange();
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.equal((await auth.exchange()).status, 400);
  const replayConsent = await browser(`/api/mcp/consent/${auth.requestId}`, "POST", { csrfToken: auth.details.csrfToken, decision: "approve", scopes: MCP_SCOPES });
  assert.equal(replayConsent.status, 403);
  const { rows } = await pool.query("SELECT hash FROM project_mcp_tokens WHERE hash=$1", [hashToken(tokens.access_token)]);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].hash !== tokens.access_token);
});

test("SDK transport, project/task/subtask management, idempotency, version conflicts, and ownership", async () => {
  const { client } = await connection();
  const list = await client.listTools();
  assert.equal(list.tools.length, Object.keys(projectTools).length);
  assert.ok(list.tools.length >= 40);
  const p = await createProject(client);
  const sameId = mutation();
  const args = { request_id: sameId, project_id: p.id, task: { title: "Parent task", notes: "<script>never execute</script>", priority: "high" } };
  const t = await tool(client, "create_task", args);
  const retry = await tool(client, "create_task", args);
  assert.equal(retry.id, t.id);
  assert.ok(t.notes.includes("&lt;script&gt;"));
  await tool(client, "create_task", { ...args, task: { title: "Different mutation" } }, true);
  const child = await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Subtask", parentTaskId: t.id } });
  await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Too deep", parentTaskId: child.id } }, true);
  await tool(client, "get_project", { project_id: foreignProject }, true);
  await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Wrong section", columnId: foreignSection } }, true);
  await tool(client, "create_project", { request_id: mutation(), project: { name: "Spoof", userId: members[1] } }, true);
  const moved = await tool(client, "update_task", { request_id: mutation(), task_id: t.id, expected_version: t.version, changes: { status: "done" } });
  assert.equal(moved.status, "done");
  assert.ok(moved.completedAt);
  await tool(client, "update_task", { request_id: mutation(), task_id: t.id, expected_version: t.version, changes: { title: "Stale edit" } }, true);
  const current = await tool(client, "get_project", { project_id: p.id });
  const edits = await Promise.all([
    client.callTool({ name: "update_project", arguments: { request_id: mutation(), project_id: p.id, expected_version: current.project.version, changes: { name: "Concurrent A" } } }),
    client.callTool({ name: "update_project", arguments: { request_id: mutation(), project_id: p.id, expected_version: current.project.version, changes: { name: "Concurrent B" } } }),
  ]);
  assert.equal(edits.filter((result: any) => !result.isError).length, 1);
  const state = await tool(client, "list_tasks", { project_id: p.id });
  assert.equal(state.total, 2);
  assert.equal(state.items.filter((item: any) => item.id === t.id).length, 1);
  const activity = await tool(client, "task_activity", { task_id: t.id });
  assert.ok(activity.total >= 2);
  const summary = await tool(client, "project_overview");
  assert.ok(summary.totalActive >= 1);
});

test("section, comment, and template workflows use the existing project data", async () => {
  const { client } = await connection();
  const p = await createProject(client, "Template fixture");
  const section = await tool(client, "create_section", { request_id: mutation(), project_id: p.id, section: { name: "Review" } });
  const renamed = await tool(client, "update_section", { request_id: mutation(), section_id: section.id, expected_version: section.version, changes: { name: "Ready", sortOrder: 4 } });
  assert.equal(renamed.name, "Ready");
  const t = await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Review task", columnId: section.id } });
  const comment = await tool(client, "add_comment", { request_id: mutation(), task_id: t.id, body: "Review notes" });
  const edited = await tool(client, "update_comment", { request_id: mutation(), task_id: t.id, comment_id: comment.id, body: "Updated review notes" });
  assert.equal(edited.body, "Updated review notes");
  const comments = await tool(client, "list_comments", { task_id: t.id });
  assert.equal(comments.total, 1);
  const tpl = await tool(client, "save_project_as_template", { request_id: mutation(), project_id: p.id, name: "Reusable launch" });
  const saved = await tool(client, "get_template", { template_id: tpl.id });
  assert.equal(saved.totalTasks, 1);
  const templateTask = await tool(client, "create_template_task", { request_id: mutation(), template_id: tpl.id, task: { title: "Extra template task" } });
  const changed = await tool(client, "update_template_task", { request_id: mutation(), template_task_id: templateTask.id, expected_version: templateTask.version, changes: { priority: "urgent" } });
  assert.equal(changed.priority, "urgent");
  const copied = await tool(client, "duplicate_template", { request_id: mutation(), template_id: tpl.id });
  const instantiated = await tool(client, "create_project", { request_id: mutation(), project: { name: "From template" }, template_id: copied.id });
  assert.equal((await tool(client, "list_tasks", { project_id: instantiated.id })).total, 2);
});

test("read-only grants, renewal, credential revocation, and immediate membership changes", async () => {
  const readonly = await connection(["projects:read"]);
  await assertDeletionToolsListed(readonly.client);
  await tool(readonly.client, "list_projects");
  await tool(readonly.client, "create_project", { request_id: mutation(), project: { name: "Not allowed" } }, true);
  const renewal = await fetch(`${base}/api/mcp/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: readonly.info.client_id, refresh_token: readonly.refresh_token, resource: `${base}/mcp/projects` }) });
  assert.equal(renewal.status, 200);
  const renewed = await renewal.json();
  assert.ok(renewed.access_token !== readonly.access_token);
  const rpc = (token: string) => fetch(`${base}/mcp/projects`, { method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "tools/list" }) });
  assert.equal((await rpc(readonly.access_token)).status, 401);
  assert.equal((await rpc(renewed.access_token)).status, 200);
  const replay = await fetch(`${base}/api/mcp/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: readonly.info.client_id, refresh_token: readonly.refresh_token }) });
  assert.equal(replay.status, 400);
  await pool.query("UPDATE users SET cf_enrolled=false WHERE id=$1", [members[0]]);
  try { assert.equal((await rpc(renewed.access_token)).status, 401); }
  finally { await pool.query("UPDATE users SET cf_enrolled=true WHERE id=$1", [members[0]]); }
  assert.equal((await browser(`/api/mcp/connections/${readonly.grantId}`, "DELETE", undefined, members[0], "https://attacker.example.invalid")).status, 403);
  assert.equal((await browser(`/api/mcp/connections/${readonly.grantId}`, "DELETE", undefined, members[1])).status, 404);
  assert.equal((await browser(`/api/mcp/connections/${readonly.grantId}`, "DELETE")).status, 200);
  assert.equal((await rpc(renewed.access_token)).status, 401);
});

test("retired website approvals cannot execute or cancel a deletion", async () => {
  const { client, access_token } = await connection();
  const p = await createProject(client, "Deletion fixture");
  await tool(client, "delete_project", { request_id: mutation(), project_id: p.id, approved: true }, true);
  const pending = await tool(client, "delete_project", { request_id: mutation(), project_id: p.id });
  assert.equal(pending.status, "approval_required");
  assert.ok(await storage.getProject(p.id, members[0]));
  const tokenOnly = await fetch(`${base}/api/mcp/approvals/${pending.approvalId}`, { method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ decision: "approve" }) });
  assert.equal(tokenOnly.status, 401);
  for (const decision of ["approve", "deny"]) {
    assert.equal((await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision })).status, 410);
    assert.ok(await storage.getProject(p.id, members[0]));
    assert.equal((await tool(client, "get_approval", { approval_id: pending.approvalId })).status, "pending");
  }
  assert.equal((await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision: "approve" }, members[1])).status, 410);
  await confirmDeletion(client, pending);
  assert.equal(await storage.getProject(p.id, members[0]), undefined);
  assert.equal((await tool(client, "get_approval", { approval_id: pending.approvalId })).status, "completed");
  assert.equal((await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision: "approve" })).status, 410);
});

test("in-agent deletion requires explicit confirmation and preserves idempotent results", async () => {
  const { client } = await connection();
  const p = await createProject(client, "In-agent deletion");
  const parent = await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Throwaway parent" } });
  const child = await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Throwaway child", parentTaskId: parent.id } });
  const args = { request_id: mutation(), project_id: p.id };
  const preview = await tool(client, "delete_project", args);
  assert.equal(preview.confirmationTool, "confirm_deletion");
  assert.equal(preview.approvalUrl, undefined);
  assert.ok(preview.summary.includes(p.name));
  assert.ok(await storage.getProject(p.id, members[0]));
  const tools = (await client.listTools()).tools;
  assert.equal(tools.find((t) => t.name === "delete_project")?.annotations?.readOnlyHint, true);
  assert.equal(tools.find((t) => t.name === "confirm_deletion")?.annotations?.destructiveHint, true);
  await tool(client, "confirm_deletion", { request_id: mutation(), approval_id: preview.approvalId }, true);
  await tool(client, "confirm_deletion", { request_id: mutation(), approval_id: preview.approvalId, confirmed: false }, true);
  assert.ok(await storage.getProject(p.id, members[0]));
  const confirm = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
  const completed = await tool(client, "confirm_deletion", confirm);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.projectId, p.id);
  assert.deepEqual(completed.result.counts, { projects: 1, tasks: 2 });
  assert.equal(await storage.getProject(p.id, members[0]), undefined);
  assert.equal(await storage.getTask(parent.id, members[0]), undefined);
  assert.equal(await storage.getTask(child.id, members[0]), undefined);
  assert.deepEqual(await tool(client, "confirm_deletion", confirm), completed);
  const repeated = await tool(client, "confirm_deletion", { ...confirm, request_id: mutation() }, true);
  assert.equal(repeated.error, "confirmation_already_completed");
  assert.equal((await tool(client, "get_approval", { approval_id: preview.approvalId })).status, "completed");
  // Existing cached previews must not keep sending an upgraded client to the website.
  await pool.query("UPDATE project_mcp_operations SET result=$3 WHERE grant_id=$1 AND request_id=$2",
    [(await pool.query("SELECT grant_id FROM project_mcp_approvals WHERE id=$1", [preview.approvalId])).rows[0].grant_id,
      args.request_id, JSON.stringify({ ...preview, approvalUrl: `${base}/projects/ai`, message: "Open the website" })]);
  const retry = await tool(client, "delete_project", args);
  assert.equal(retry.approvalUrl, undefined);
  assert.equal(retry.confirmationTool, "confirm_deletion");
});

test("in-agent confirmations are bound to the connection and reject read-only, stale, expired, and denied previews", async () => {
  const actor = await connection();
  const otherConnection = await connection();
  const foreign = await connection(MCP_SCOPES, members[1]);
  const readonly = await connection(["projects:read"]);
  const p = await createProject(actor.client, "Confirmation guard fixture");
  const pending = await tool(actor.client, "delete_project", { request_id: mutation(), project_id: p.id });
  for (const other of [otherConnection, foreign, readonly]) {
    await tool(other.client, "confirm_deletion", { request_id: mutation(), approval_id: pending.approvalId, confirmed: true }, true);
    await tool(other.client, "cancel_deletion", { request_id: mutation(), approval_id: pending.approvalId }, true);
  }
  assert.equal((await tool(actor.client, "get_approval", { approval_id: pending.approvalId })).status, "pending");
  const cancelled = await tool(actor.client, "cancel_deletion", { approval_id: pending.approvalId });
  assert.equal(cancelled.status, "denied");
  assert.deepEqual(await tool(actor.client, "cancel_deletion", { approval_id: pending.approvalId }), cancelled);
  await tool(actor.client, "confirm_deletion", { request_id: mutation(), approval_id: pending.approvalId, confirmed: true }, true);
  const expired = await tool(actor.client, "delete_project", { request_id: mutation(), project_id: p.id });
  await pool.query("UPDATE project_mcp_approvals SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expired.approvalId]);
  const expiry = await tool(actor.client, "confirm_deletion", { request_id: mutation(), approval_id: expired.approvalId, confirmed: true }, true);
  assert.equal(expiry.error, "confirmation_expired");
  const stale = await tool(actor.client, "delete_project", { request_id: mutation(), project_id: p.id });
  await tool(actor.client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Added after preview" } });
  const changed = await tool(actor.client, "confirm_deletion", { request_id: mutation(), approval_id: stale.approvalId, confirmed: true }, true);
  assert.equal(changed.error, "stale_approval");
  assert.equal((await tool(actor.client, "get_approval", { approval_id: stale.approvalId })).status, "failed");
  assert.ok(await storage.getProject(p.id, members[0]));
});

test("concurrent in-agent confirmations execute a deletion only once", async () => {
  const { client } = await connection();
  const p = await createProject(client, "Concurrent confirmations");
  const preview = await tool(client, "delete_project", { request_id: mutation(), project_id: p.id });
  const original = projectTools.delete_project.run;
  let calls = 0;
  projectTools.delete_project.run = async (a, c) => { calls++; return original(a, c); };
  try {
    const results = await Promise.all([mutation(), mutation()].map((request_id) =>
      client.callTool({ name: "confirm_deletion", arguments: { request_id, approval_id: preview.approvalId, confirmed: true } })));
    assert.ok(results.some((result) => !result.isError));
    assert.equal(calls, 1);
    assert.equal(await storage.getProject(p.id, members[0]), undefined);
  } finally { projectTools.delete_project.run = original; }
});

test("writes during cloud cleanup preparation survive and require fresh in-client consent", { timeout: 30000 }, async () => {
  const c = await getRecoveryContext();
  const getFile = ObjectStorageService.prototype.getObjectEntityFile;
  const deleteFile = ObjectStorageService.prototype.deleteObject;
  const files = new Set<string>();
  let deletes = 0;
  try {
    for (const scenario of ["project", "task", "attachment"] as const) {
      const p = await storage.createProject(c.workspaceId, { name: `Cleanup race ${scenario}` });
      const t = await storage.createTask(c.workspaceId, p.id, { title: "Approved task" });
      const path = `/objects/uploads/${mutation()}`;
      files.add(path);
      const att = await storage.createTaskAttachment(t.id, c.workspaceId,
        { objectPath: path, filename: "approved.txt", mimeType: "text/plain", size: 5 });
      const name = `delete_${scenario}`;
      const target = scenario === "project" ? { project_id: p.id }
        : scenario === "task" ? { task_id: t.id } : { attachment_id: att.id };
      const preview = await executeProjectTool(name, { request_id: mutation(), ...target }, c);
      let entered!: () => void;
      let resume!: () => void;
      const paused = new Promise<void>((resolve) => { entered = resolve; });
      const gate = new Promise<void>((resolve) => { resume = resolve; });
      let first = true;
      ObjectStorageService.prototype.getObjectEntityFile = async (objectPath) => {
        if (first) { first = false; entered(); await gate; }
        if (!files.has(objectPath)) throw new ObjectNotFoundError();
        return {} as any;
      };
      ObjectStorageService.prototype.deleteObject = async (objectPath) => {
        // Irreversible cleanup must be after the database target disappears.
        const remaining = scenario === "project" ? await storage.getProject(p.id, c.workspaceId)
          : scenario === "task" ? await storage.getTask(t.id, c.workspaceId)
            : await storage.getTaskAttachment(att.id, c.workspaceId);
        assert.equal(remaining, undefined);
        deletes++;
        files.delete(objectPath);
      };
      const args = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
      const attempt = executeProjectTool("confirm_deletion", args, c);
      const rejected = assert.rejects(attempt, (error: any) => {
        assert.equal(error.code, "stale_approval");
        assert.match(error.message, /Nothing was deleted/);
        assert.match(error.message, /fresh deletion preview/);
        assert.match(error.message, /explicit confirmation inside the AI client/);
        return true;
      });
      let added: any;
      let child: any;
      let newAttachment: any;
      const beforeDeletes = deletes;
      await paused;
      try {
        // Independent pooled SQL writer: no MCP-specific lock or version protocol.
        if (scenario === "project") {
          added = await storage.createTask(c.workspaceId, p.id, { title: "New website task" });
          await pool.query("UPDATE projects SET description='New website edit' WHERE id=$1", [p.id]);
          await storage.createColumn(c.workspaceId, p.id, { name: "New board section" });
        } else if (scenario === "task") {
          await pool.query("UPDATE project_tasks SET notes='New website notes' WHERE id=$1", [t.id]);
          child = await storage.createTask(c.workspaceId, p.id, { title: "New subtask", parentTaskId: t.id });
          const newPath = `/objects/uploads/${mutation()}`;
          files.add(newPath);
          newAttachment = await storage.createTaskAttachment(child.id, c.workspaceId,
            { objectPath: newPath, filename: "new.txt", mimeType: "text/plain", size: 3 });
          await storage.addTaskComment(t.id, c.workspaceId, "New website comment");
        } else {
          await pool.query("UPDATE task_attachments SET filename='new-name.txt' WHERE id=$1", [att.id]);
        }
      } finally { resume(); }
      await rejected;
      assert.equal(deletes, beforeDeletes, "A changed target must retain every stored file");
      assert.ok(files.has(path));
      assert.ok(await storage.getProject(p.id, c.workspaceId));
      assert.ok(await storage.getTask(t.id, c.workspaceId));
      assert.ok(await storage.getTaskAttachment(att.id, c.workspaceId));
      if (added) assert.ok(await storage.getTask(added.id, c.workspaceId));
      if (child) {
        assert.equal((await storage.getTask(t.id, c.workspaceId))?.notes, "New website notes");
        assert.ok(await storage.getTask(child.id, c.workspaceId));
        assert.ok(await storage.getTaskAttachment(newAttachment.id, c.workspaceId));
        assert.equal((await storage.getTaskComments(t.id, c.workspaceId)).length, 1);
      }
      if (scenario === "attachment") assert.equal((await storage.getTaskAttachment(att.id, c.workspaceId))?.filename, "new-name.txt");
      assert.equal((await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c)).status, "failed");
      const retry = await executeProjectTool("confirm_deletion", args, c);
      assert.equal(retry.status, "failed");
      assert.match(retry.error, /changed during deletion preparation/);
      await assert.rejects(() => executeProjectTool("confirm_deletion", { ...args, request_id: mutation() }, c));
      assert.equal(deletes, beforeDeletes);
      const fresh = await executeProjectTool(name, { request_id: mutation(), ...target }, c);
      assert.equal(deletes, beforeDeletes, "A fresh preview is not consent");
      const completed = await executeProjectTool("confirm_deletion",
        { request_id: mutation(), approval_id: fresh.approvalId, confirmed: true }, c);
      assert.equal(completed.status, "completed");
      assert.equal(completed.result.counts[scenario === "project" ? "tasks" : scenario === "task" ? "tasks" : "attachments"],
        scenario === "attachment" ? 1 : 2);
      assert.ok(!files.has(path));
      if (newAttachment) assert.ok(!files.has(newAttachment.objectPath));
    }
  } finally {
    ObjectStorageService.prototype.getObjectEntityFile = getFile;
    ObjectStorageService.prototype.deleteObject = deleteFile;
  }
});

async function waitForBlockedWriter(blockerPid: number, waiterPid?: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await pool.query(
      "SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND ($2::int IS NULL OR pid=$2)",
      [blockerPid, waiterPid ?? null]);
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Expected an independent PostgreSQL writer to be blocked by the target's row locks");
}

// Pause with real PostgreSQL locks held, immediately before the final snapshot.
// Only the deletion's connection is wrapped; every competing writer is plain SQL.
async function withPausedConditionalDeletion(
  kind: DeletionKind, id: string, owner: string, whileLocked: (pid: number) => Promise<void>,
) {
  const snapshot = await storage.getDeletionSnapshot(kind, id, owner);
  let resume!: () => void;
  let reached!: (pid: number) => void;
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  const paused = new Promise<number>((resolve) => { reached = resolve; });
  const controlledPool = {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (text: string, values?: any[]) => {
          if (text.includes("WITH root AS")) {
            const { rows: [backend] } = await client.query("SELECT pg_backend_pid() AS pid");
            reached(backend.pid);
            await gate;
          }
          return client.query(text, values);
        },
        release: () => client.release(),
      };
    },
  } as unknown as Pool;
  const deletion = deleteUnchangedTarget(controlledPool, kind, id, owner, hashToken(JSON.stringify(snapshot)));
  // Observe failures immediately, rather than leaving a dangling rejected promise.
  const result = deletion.then((value) => ({ value }), (error) => ({ error }));
  try {
    const pid = await Promise.race([paused, result.then((r) => { throw "error" in r ? r.error : new Error("Deletion did not pause"); })]);
    await whileLocked(pid);
  } finally {
    resume();
    const completed = await result;
    if ("error" in completed) throw completed.error;
  }
  return deletion;
}

test("final conditional deletion waits for an uncommitted writer and preserves its new content", { timeout: 15000 }, async () => {
  const c = await getRecoveryContext();
  const p = await storage.createProject(c.workspaceId, { name: "Final database race" });
  const snapshot = await storage.getDeletionSnapshot("project", p.id, c.workspaceId);
  const writer = await pool.connect();
  try {
    await writer.query("BEGIN");
    const { rows: [t] } = await writer.query(
      "INSERT INTO project_tasks(user_id,project_id,title) VALUES($1,$2,'Concurrent uncommitted task') RETURNING id",
      [c.workspaceId, p.id]);
    const deletion = storage.deleteUnchangedTarget("project", p.id, c.workspaceId, hashToken(JSON.stringify(snapshot)));
    const { rows: [backend] } = await writer.query("SELECT pg_backend_pid() AS pid");
    await waitForBlockedWriter(backend.pid);
    await writer.query("COMMIT");
    assert.equal(await deletion, false);
    assert.ok(await storage.getProject(p.id, c.workspaceId));
    assert.ok(await storage.getTask(t.id, c.workspaceId));
  } finally {
    await writer.query("ROLLBACK");
    writer.release();
  }
});

test("unrelated SQL edits stay responsive while each deletion kind holds its locks", { timeout: 15000 }, async () => {
  for (const kind of ["project", "task", "attachment"] as const) {
    const p = await storage.createProject(members[0], { name: "Locked deletion" });
    const t = await storage.createTask(members[0], p.id, { title: "Locked task" });
    const att = await storage.createTaskAttachment(t.id, members[0],
      { objectPath: `/objects/uploads/${mutation()}`, filename: "locked.txt", mimeType: "text/plain", size: 1 });
    const metrics: any[] = [];
    const info = console.info;
    console.info = (...args) => {
      if (args[0] === "[project-deletion] lock timing") metrics.push(args[1]);
      info(...args);
    };
    try {
      assert.equal(await withPausedConditionalDeletion(kind, kind === "project" ? p.id : kind === "task" ? t.id : att.id,
        members[0], async (pid) => {
          const broadLocks = await pool.query(`SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='relation'
            AND mode IN ('ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')`, [pid]);
          assert.equal(broadLocks.rows.length, 0, "Normal deletion must not acquire table-level writer locks");
          // Both a different project in the same workspace and a different
          // workspace must remain writable, including every protected table.
          for (const owner of [members[0], members[1]]) {
            const writer = await pool.connect();
            try {
              await writer.query("BEGIN");
              await writer.query("SET LOCAL lock_timeout = '500ms'");
              const { rows: [other] } = await writer.query(
                "INSERT INTO projects(user_id,name) VALUES($1,'Unrelated') RETURNING id", [owner]);
              const { rows: [task] } = await writer.query(
                "INSERT INTO project_tasks(user_id,project_id,title) VALUES($1,$2,'Unrelated task') RETURNING id", [owner, other.id]);
              await writer.query("UPDATE projects SET name='Still editable' WHERE id=$1", [other.id]);
              await writer.query("UPDATE project_tasks SET notes='Independent edit' WHERE id=$1", [task.id]);
              await writer.query("INSERT INTO project_columns(user_id,project_id,name) VALUES($1,$2,'Unrelated column')", [owner, other.id]);
              await writer.query("INSERT INTO task_comments(user_id,task_id,body) VALUES($1,$2,'Unrelated comment')", [owner, task.id]);
              await writer.query(`INSERT INTO task_attachments(user_id,task_id,object_path,filename,mime_type,size)
                VALUES($1,$2,'/objects/unrelated','unrelated.txt','text/plain',1)`, [owner, task.id]);
              await writer.query("UPDATE project_columns SET name='Edited' WHERE project_id=$1", [other.id]);
              await writer.query("UPDATE task_comments SET body='Edited' WHERE task_id=$1", [task.id]);
              await writer.query("UPDATE task_attachments SET filename='edited.txt' WHERE task_id=$1", [task.id]);
              await writer.query("DELETE FROM projects WHERE id=$1", [other.id]);
              await writer.query("COMMIT");
            } finally {
              await writer.query("ROLLBACK");
              writer.release();
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }), true);
      assert.equal(metrics.length, 1);
      assert.equal(metrics[0].outcome, "deleted");
      assert.ok(metrics[0].holdMs >= 100);
      assert.ok(metrics[0].totalMs >= metrics[0].holdMs);
      assert.ok(metrics[0].acquireMs >= 0);
    } finally {
      console.info = info;
      await pool.query("DELETE FROM projects WHERE id=$1", [p.id]);
    }
  }
});

// All insert and incoming-move predicates, plus edits to existing contents.
// An earlier writer invalidates consent; a later writer waits and cannot create
// an orphan or add an unapproved stored-file reference to a deleted target.
const raceCases = [
  { kind: "project", change: "task insert" },
  { kind: "project", change: "task move" },
  { kind: "project", change: "column insert" },
  { kind: "project", change: "column move" },
  { kind: "task", change: "child insert" },
  { kind: "task", change: "child move" },
  { kind: "task", change: "comment insert" },
  { kind: "task", change: "comment move" },
  { kind: "task", change: "attachment insert" },
  { kind: "task", change: "attachment move" },
  { kind: "task", change: "child attachment insert" },
  { kind: "project", change: "project edit" },
  { kind: "task", change: "task edit" },
  { kind: "task", change: "comment edit" },
  { kind: "attachment", change: "attachment edit" },
] as const;

async function raceFixture(kind: DeletionKind, change: string) {
  const owner = members[0];
  const p = await storage.createProject(owner, { name: "Race target" });
  const other = await storage.createProject(owner, { name: "Move source" });
  const t = await storage.createTask(owner, p.id, { title: "Race task" });
  const child = await storage.createTask(owner, p.id, { title: "Existing child", parentTaskId: t.id });
  const source = await storage.createTask(owner, other.id, { title: "Incoming task" });
  const att = await storage.createTaskAttachment(t.id, owner,
    { objectPath: `/objects/uploads/${mutation()}`, filename: "existing.txt", mimeType: "text/plain", size: 1 });
  const sourceAtt = await storage.createTaskAttachment(source.id, owner,
    { objectPath: `/objects/uploads/${mutation()}`, filename: "incoming.txt", mimeType: "text/plain", size: 1 });
  const comment = await storage.addTaskComment(t.id, owner, "Existing comment");
  const sourceComment = await storage.addTaskComment(source.id, owner, "Incoming comment");
  const column = await storage.createColumn(owner, other.id, { name: "Incoming column" });
  const statements: Record<string, [string, any[]]> = {
    "task insert": ["INSERT INTO project_tasks(user_id,project_id,title) VALUES($1,$2,'Phantom task')", [owner, p.id]],
    "task move": ["UPDATE project_tasks SET project_id=$1 WHERE id=$2", [p.id, source.id]],
    "column insert": ["INSERT INTO project_columns(user_id,project_id,name) VALUES($1,$2,'Phantom column')", [owner, p.id]],
    "column move": ["UPDATE project_columns SET project_id=$1 WHERE id=$2", [p.id, column.id]],
    "child insert": ["INSERT INTO project_tasks(user_id,project_id,parent_task_id,title) VALUES($1,$2,$3,'Phantom child')", [owner, p.id, t.id]],
    "child move": ["UPDATE project_tasks SET parent_task_id=$1 WHERE id=$2", [t.id, source.id]],
    "comment insert": ["INSERT INTO task_comments(user_id,task_id,body) VALUES($1,$2,'Phantom comment')", [owner, t.id]],
    "comment move": ["UPDATE task_comments SET task_id=$1 WHERE id=$2", [t.id, sourceComment.id]],
    "attachment insert": [`INSERT INTO task_attachments(user_id,task_id,object_path,filename,mime_type,size)
      VALUES($1,$2,'/objects/phantom','new.txt','text/plain',1)`, [owner, t.id]],
    "attachment move": ["UPDATE task_attachments SET task_id=$1 WHERE id=$2", [t.id, sourceAtt.id]],
    "child attachment insert": [`INSERT INTO task_attachments(user_id,task_id,object_path,filename,mime_type,size)
      VALUES($1,$2,'/objects/phantom-child','new.txt','text/plain',1)`, [owner, child.id]],
    "project edit": ["UPDATE projects SET name='Independent edit' WHERE id=$1", [p.id]],
    "task edit": ["UPDATE project_tasks SET notes='Independent edit' WHERE id=$1", [child.id]],
    "comment edit": ["UPDATE task_comments SET body='Independent edit' WHERE id=$1", [comment.id]],
    "attachment edit": ["UPDATE task_attachments SET filename='edited.txt' WHERE id=$1", [att.id]],
  };
  return { owner, projects: [p.id, other.id], id: kind === "project" ? p.id : kind === "task" ? t.id : att.id, statement: statements[change] };
}

test("earlier independent insert, move, and edit writers invalidate the deletion snapshot", { timeout: 30000 }, async () => {
  for (const { kind, change } of raceCases) {
    const f = await raceFixture(kind, change);
    const snapshot = await storage.getDeletionSnapshot(kind, f.id, f.owner);
    const writer = await pool.connect();
    let deletion: Promise<boolean> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query(...f.statement);
      const { rows: [backend] } = await writer.query("SELECT pg_backend_pid() AS pid");
      deletion = storage.deleteUnchangedTarget(kind, f.id, f.owner, hashToken(JSON.stringify(snapshot)));
      // Attach the rejection observer before waiting for the real lock.
      deletion.catch(() => {});
      await waitForBlockedWriter(backend.pid);
      await writer.query("COMMIT");
      assert.equal(await deletion, false, `${kind}: ${change}`);
      assert.ok(await storage.getDeletionSnapshot(kind, f.id, f.owner), change);
    } finally {
      await writer.query("ROLLBACK");
      writer.release();
      await deletion?.catch(() => {});
      await pool.query("DELETE FROM projects WHERE id=ANY($1::varchar[])", [f.projects]);
    }
  }
});

test("later independent insert, move, and edit writers cannot enter a locked deletion scope", { timeout: 30000 }, async () => {
  for (const { kind, change } of raceCases) {
    const f = await raceFixture(kind, change);
    const writer = await pool.connect();
    let write: Promise<any> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout = '5s'");
      const { rows: [backend] } = await writer.query("SELECT pg_backend_pid() AS pid");
      assert.equal(await withPausedConditionalDeletion(kind, f.id, f.owner, async (pid) => {
        write = writer.query(...f.statement).then((result) => ({ result }), (error) => ({ error }));
        await waitForBlockedWriter(pid, backend.pid);
      }), true, change);
      const result = await write!;
      if (change.endsWith("edit")) {
        assert.equal(result.error, undefined, change);
        assert.equal(result.result.rowCount, 0, "A late edit must not update a deleted row");
      } else {
        assert.equal(result.error?.code, "23503", `${change} must fail its database FK check after deletion`);
      }
      await writer.query("ROLLBACK");
      assert.equal(await storage.getDeletionSnapshot(kind, f.id, f.owner), undefined);
    } finally {
      await writer.query("ROLLBACK");
      writer.release();
      await pool.query("DELETE FROM projects WHERE id=ANY($1::varchar[])", [f.projects]);
    }
  }
});

test("missing immediate relationship checks fail closed before deletion and can be rechecked after schema setup", async () => {
  let count = 4;
  const queries: string[] = [];
  const unreadyPool = {
    connect: async () => ({
      query: async (text: string) => { queries.push(text); return { rows: [{ count }] }; },
      release: () => {},
    }),
  } as unknown as Pool;
  await assert.rejects(() => deleteUnchangedTarget(unreadyPool, "task", randomUUID(), members[0], "unused"),
    /requires immediate database relationship constraints/);
  assert.equal(queries.length, 1);
  assert.ok(!queries[0].includes("DELETE"));
  count = 5;
  await ensureProjectDeletionConstraints(unreadyPool);
  assert.equal(queries.length, 2, "A failed readiness check must not be cached permanently");
});

test("the parent constraint refuses unpreviewed recursive cascades and rolls back the entire task deletion", async () => {
  const p = await storage.createProject(members[0], { name: "Legacy deep tree safety" });
  try {
    const t = await storage.createTask(members[0], p.id, { title: "Approved root" });
    const child = await storage.createTask(members[0], p.id, { title: "Approved child", parentTaskId: t.id });
    // The website disallows deeper nesting; independent SQL can still create
    // it. A new FK must not silently expand the existing one-level preview.
    const { rows: [grandchild] } = await pool.query(`INSERT INTO project_tasks(user_id,project_id,parent_task_id,title)
      VALUES($1,$2,$3,'Not in the task preview') RETURNING id`, [members[0], p.id, child.id]);
    const attachment = await storage.createTaskAttachment(child.id, members[0],
      { objectPath: `/objects/uploads/${mutation()}`, filename: "preserved.txt", mimeType: "text/plain", size: 1 });
    const snapshot = await storage.getDeletionSnapshot("task", t.id, members[0]);
    assert.ok(!snapshot?.tasks.some((task: any) => task.id === grandchild.id));
    await assert.rejects(() => storage.deleteUnchangedTarget("task", t.id, members[0], hashToken(JSON.stringify(snapshot))),
      (error: any) => error.code === "23503");
    for (const id of [t.id, child.id, grandchild.id]) assert.ok(await storage.getTask(id, members[0]));
    assert.ok(await storage.getTaskAttachment(attachment.id, members[0]));
  } finally {
    await pool.query("DELETE FROM projects WHERE id=$1", [p.id]);
  }
});

// Fail the shared DB interface at a precise crash boundary, including all
// subsequent error/result writes. The durable rows are exactly those a new
// process sees; the real PostgreSQL session lock is released on unwind.
async function crashConfirmation(context: ToolContext, args: any, boundary: "claimed" | "deleted" | "approved") {
  const query = pool.query;
  let disconnected = false;
  (pool as any).query = async (...parameters: any[]) => {
    if (disconnected) throw new Error("Injected process exit");
    const sql = String(parameters[0]);
    if (boundary === "deleted" && sql.includes("SET status='approved'")) {
      disconnected = true;
      throw new Error("Injected exit before result persistence");
    }
    const result = await (query as any).apply(pool, parameters);
    if ((boundary === "claimed" && sql.includes("SET status='executing'")) ||
        (boundary === "approved" && sql.includes("SET status='approved'"))) {
      disconnected = true;
      throw new Error("Injected process exit");
    }
    return result;
  };
  try {
    await assert.rejects(() => executeProjectTool("confirm_deletion", args, context), /Injected/);
    assert.ok(disconnected, "fault boundary must actually be reached");
  } finally { pool.query = query; }
}

let recoveryContext: ToolContext | undefined;
async function getRecoveryContext() {
  // Reuse one real authorized grant; expanded fault cases must not weaken or
  // exhaust the production OAuth registration limiter.
  if (!recoveryContext) {
    const actor = await connection();
    recoveryContext = { userId: members[0], workspaceId: members[0], grantId: actor.grantId, scopes: MCP_SCOPES, origin: base };
  }
  return recoveryContext;
}

test("deletion snapshots independently detect every cascading content change without timestamp updates", async () => {
  const c = await getRecoveryContext();
  for (const change of ["project", "task", "child", "comment", "attachment", "column"] as const) {
    const p = await storage.createProject(c.workspaceId, { name: "Snapshot content" });
    const t = await storage.createTask(c.workspaceId, p.id, { title: "Snapshot task" });
    const snapshot = await storage.getDeletionSnapshot("project", p.id, c.workspaceId);
    if (change === "project") await pool.query("UPDATE projects SET name='Changed' WHERE id=$1", [p.id]);
    if (change === "task") await pool.query("UPDATE project_tasks SET title='Changed' WHERE id=$1", [t.id]);
    if (change === "child") await storage.createTask(c.workspaceId, p.id, { title: "New child", parentTaskId: t.id });
    if (change === "comment") await storage.addTaskComment(t.id, c.workspaceId, "New comment");
    if (change === "attachment") await storage.createTaskAttachment(t.id, c.workspaceId,
      { objectPath: `/objects/uploads/${mutation()}`, filename: "new.txt", mimeType: "text/plain", size: 3 });
    if (change === "column") await storage.createColumn(c.workspaceId, p.id, { name: "New column" });
    assert.equal(await storage.deleteUnchangedTarget("project", p.id, c.workspaceId, hashToken(JSON.stringify(snapshot))), false, change);
    assert.ok(await storage.getProject(p.id, c.workspaceId));
    assert.ok(await storage.getTask(t.id, c.workspaceId));
  }
});

test("post-commit cloud failure reports partial deletion and read-only recovery never repeats cleanup", async () => {
  const c = await getRecoveryContext();
  const p = await storage.createProject(c.workspaceId, { name: "Post-commit cleanup failure" });
  const t = await storage.createTask(c.workspaceId, p.id, { title: "Task with file" });
  const att = await storage.createTaskAttachment(t.id, c.workspaceId,
    { objectPath: `/objects/uploads/${mutation()}`, filename: "leftover.txt", mimeType: "text/plain", size: 5 });
  const getFile = ObjectStorageService.prototype.getObjectEntityFile;
  const deleteFile = ObjectStorageService.prototype.deleteObject;
  let attempts = 0;
  ObjectStorageService.prototype.getObjectEntityFile = async () => ({} as any);
  ObjectStorageService.prototype.deleteObject = async () => {
    attempts++;
    assert.equal(await storage.getTask(t.id, c.workspaceId), undefined);
    throw new Error("Cloud cleanup unavailable");
  };
  try {
    const preview = await executeProjectTool("delete_task", { request_id: mutation(), task_id: t.id }, c);
    const args = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
    await assert.rejects(() => executeProjectTool("confirm_deletion", args, c));
    assert.equal(await storage.getTaskAttachment(att.id, c.workspaceId), undefined);
    const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
    assert.equal(status.status, "interrupted");
    assert.equal(status.result.outcome, "partial");
    assert.equal(status.result.target, "target_absent");
    assert.equal(status.result.storage, "present");
    const retry = await executeProjectTool("confirm_deletion", args, c);
    assert.equal(retry.status, "interrupted");
    assert.equal(attempts, 1);
  } finally {
    ObjectStorageService.prototype.getObjectEntityFile = getFile;
    ObjectStorageService.prototype.deleteObject = deleteFile;
  }
});

test("restart recovery before execution never retries and preserves changed targets, ownership and expiry", async () => {
  const c = await getRecoveryContext();
  const p = await executeProjectTool("create_project", { request_id: mutation(), project: { name: "Before execution" } }, c);
  const preview = await executeProjectTool("delete_project", { request_id: mutation(), project_id: p.id }, c);
  const args = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
  await crashConfirmation(c, args, "claimed");
  await storage.updateProject(p.id, members[0], { name: "Newer content must survive" });
  await assert.rejects(() => executeProjectTool("get_approval", { approval_id: preview.approvalId }, { ...c, workspaceId: members[1] }));
  const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
  assert.equal(status.status, "interrupted");
  assert.equal(status.result.outcome, "target_changed");
  assert.equal(status.result.deletionRepeated, false);
  assert.ok(!JSON.stringify(status).includes("approvalUrl"));
  const retry = await executeProjectTool("confirm_deletion", args, c);
  assert.equal(retry.status, "interrupted");
  await assert.rejects(() => executeProjectTool("confirm_deletion", { ...args, request_id: mutation() }, c));
  assert.equal((await storage.getProject(p.id, members[0]))?.name, "Newer content must survive");
  const expired = await executeProjectTool("delete_project", { request_id: mutation(), project_id: p.id }, c);
  await pool.query("UPDATE project_mcp_approvals SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expired.approvalId]);
  assert.equal((await executeProjectTool("get_approval", { approval_id: expired.approvalId }, c)).status, "expired");
});

test("restart after deletion or approval persistence recovers the exact retry without another delete", async () => {
  const c = await getRecoveryContext();
  for (const boundary of ["claimed", "deleted", "approved"] as const) {
    const p = await executeProjectTool("create_project", { request_id: mutation(), project: { name: boundary } }, c);
    const preview = await executeProjectTool("delete_project", { request_id: mutation(), project_id: p.id }, c);
    const args = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
    const run = projectTools.delete_project.run;
    let calls = 0;
    projectTools.delete_project.run = async (...params) => { calls++; return run(...params); };
    try {
      await crashConfirmation(c, args, boundary);
      const recovered = await executeProjectTool("confirm_deletion", args, c);
      assert.equal(recovered.status, boundary === "approved" ? "completed" : "interrupted");
      if (boundary !== "approved") {
        assert.equal(recovered.result.outcome, boundary === "claimed" ? "target_unchanged" : "target_absent");
      } else assert.equal(recovered.result.projectId, p.id);
      assert.equal(calls, boundary === "claimed" ? 0 : 1);
      assert.deepEqual(await executeProjectTool("confirm_deletion", args, c), recovered);
      await assert.rejects(() => executeProjectTool("confirm_deletion", { ...args, approval_id: randomUUID() }, c), /different arguments/);
      const { rows: [operation] } = await pool.query("SELECT status FROM project_mcp_operations WHERE grant_id=$1 AND request_id=$2", [c.grantId, args.request_id]);
      assert.equal(operation.status, "done");
    } finally { projectTools.delete_project.run = run; }
  }
});

test("recovery waits for live execution and treats a pre-claim running operation as not started", async () => {
  const c = await getRecoveryContext();
  const p = await executeProjectTool("create_project", { request_id: mutation(), project: { name: "Live attempt" } }, c);
  const preview = await executeProjectTool("delete_project", { request_id: mutation(), project_id: p.id }, c);
  await withDeletionLock(preview.approvalId, () => { throw new Error("Lock unavailable"); }, async () => {
    const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
    assert.equal(status.status, "executing");
    assert.equal((await pool.query("SELECT status FROM project_mcp_approvals WHERE id=$1", [preview.approvalId])).rows[0].status, "pending");
  });
  const args = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
  await pool.query(`INSERT INTO project_mcp_operations(id,grant_id,request_id,tool_name,args_hash,status,approval_id)
    VALUES($1,$2,$3,'confirm_deletion',$4,'running',$5)`,
    [mutation(), c.grantId, args.request_id, hashToken(JSON.stringify(args)), null]);
  const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
  assert.equal(status.status, "interrupted");
  assert.equal(status.result.outcome, "not_started");
  assert.ok(await storage.getProject(p.id, members[0]));
});

test("recovery is bounded, handles failed observations conservatively, and rechecks grant access", async () => {
  const c = await getRecoveryContext();
  const p = await executeProjectTool("create_project", { request_id: mutation(), project: { name: "Bounded recovery" } }, c);
  const preview = await executeProjectTool("delete_project", { request_id: mutation(), project_id: p.id }, c);
  const args = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
  await crashConfirmation(c, args, "claimed");
  await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [c.grantId, ["projects:write"]]);
  await assert.rejects(() => executeProjectTool("get_approval", { approval_id: preview.approvalId }, c), /access has been removed/);
  assert.equal((await pool.query("SELECT status FROM project_mcp_approvals WHERE id=$1", [preview.approvalId])).rows[0].status, "executing");
  await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [c.grantId, MCP_SCOPES]);
  const { rows: [row] } = await pool.query("SELECT * FROM project_mcp_approvals WHERE id=$1", [preview.approvalId]);
  const getFile = ObjectStorageService.prototype.getObjectEntityFile;
  let probes = 0;
  ObjectStorageService.prototype.getObjectEntityFile = async () => {
    probes++;
    return new Promise(() => {}); // Slow/unavailable cloud service.
  };
  try {
    const oversize = await inspectInterruptedDeletion({ ...row, recovery_data: { complete: true, files: Array.from({ length: 101 }, () => ({ path: "/objects/uploads/fixture" })) } }, c);
    assert.equal(oversize.storage, "unknown");
    assert.equal(probes, 0);
    const started = Date.now();
    const result = await inspectInterruptedDeletion({ ...row, recovery_data: { complete: true, files: [{ path: "/objects/uploads/fixture" }] } }, c);
    assert.equal(result.storage, "unknown");
    assert.ok(Date.now() - started < 2000);
  } finally { ObjectStorageService.prototype.getObjectEntityFile = getFile; }
  const query = pool.query;
  (pool as any).query = async (...parameters: any[]) => {
    if (String(parameters[0]).includes("SELECT id FROM projects WHERE")) throw new Error("Observation failure");
    return (query as any).apply(pool, parameters);
  };
  try {
    const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
    assert.equal(status.status, "interrupted");
    assert.equal(status.result.outcome, "unknown");
    assert.equal(status.result.deletionRepeated, false);
  } finally { pool.query = query; }
  assert.ok(await storage.getProject(p.id, members[0]));
});

test("attachment interruption distinguishes storage/database partial outcomes and probe failures without cleanup", async () => {
  const c = await getRecoveryContext();
  const p = await executeProjectTool("create_project", { request_id: mutation(), project: { name: "Partial attachments" } }, c);
  const t = await executeProjectTool("create_task", { request_id: mutation(), project_id: p.id, task: { title: "Files" } }, c);
  const files = new Set<string>();
  const getFile = ObjectStorageService.prototype.getObjectEntityFile;
  const deleteFile = ObjectStorageService.prototype.deleteObject;
  const deleteRow = storage.deleteTaskAttachment;
  let failProbe = false;
  let deletes = 0;
  ObjectStorageService.prototype.getObjectEntityFile = async (path) => {
    if (failProbe) throw new Error("Storage unavailable");
    if (!files.has(path)) throw new ObjectNotFoundError();
    return {} as any;
  };
  ObjectStorageService.prototype.deleteObject = async (path) => { deletes++; files.delete(path); };
  try {
    for (const scenario of ["file_removed", "database_removed", "both_removed", "unknown", "legacy"] as const) {
      const path = `/objects/uploads/recovery-${mutation()}`;
      files.add(path);
      const attachment = await storage.createTaskAttachment(t.id, c.workspaceId, { objectPath: path, filename: "fixture.txt", mimeType: "text/plain", size: 5 });
      const preview = await executeProjectTool("delete_attachment", { request_id: mutation(), attachment_id: attachment.id }, c);
      const args = { request_id: mutation(), approval_id: preview.approvalId, confirmed: true };
      if (scenario === "file_removed") {
        // Historical cloud-first interrupted attempts remain read-only.
        await crashConfirmation(c, args, "claimed");
        files.delete(path);
      } else if (scenario === "both_removed") {
        await crashConfirmation(c, args, "deleted");
      } else {
        await crashConfirmation(c, args, "claimed");
        if (scenario === "database_removed") await deleteRow.call(storage, attachment.id, c.workspaceId);
        if (scenario === "legacy") await pool.query("UPDATE project_mcp_approvals SET recovery_data=NULL WHERE id=$1", [preview.approvalId]);
      }
      failProbe = scenario === "unknown";
      const countBeforeRecovery = deletes;
      const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
      assert.equal(status.status, "interrupted");
      assert.equal(status.result.outcome, ["file_removed", "database_removed"].includes(scenario) ? "partial"
        : scenario === "both_removed" ? "target_absent" : "target_unchanged");
      assert.equal(status.result.storage, ["unknown", "legacy"].includes(scenario) ? "unknown"
        : scenario === "database_removed" ? "present" : "absent");
      assert.equal(deletes, countBeforeRecovery);
      await assert.rejects(() => executeProjectTool("confirm_deletion", { ...args, request_id: mutation() }, c));
      assert.equal(files.has(path), ["database_removed", "unknown", "legacy"].includes(scenario));
      failProbe = false;
    }
  } finally {
    ObjectStorageService.prototype.getObjectEntityFile = getFile;
    ObjectStorageService.prototype.deleteObject = deleteFile;
    storage.deleteTaskAttachment = deleteRow;
  }
});

test("in-agent confirmation completes task, comment, section, template and template-task deletion", async () => {
  // Spread the expanded fixture traffic across real test members rather than
  // weakening the production per-member request limit.
  const { client } = await connection(MCP_SCOPES, members[1]);
  const p = await createProject(client, "All deletion types");
  const section = await tool(client, "create_section", { request_id: mutation(), project_id: p.id, section: { name: "Delete this section" } });
  const task = await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Delete parent", columnId: section.id } });
  const child = await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "Delete child", parentTaskId: task.id } });
  const comment = await tool(client, "add_comment", { request_id: mutation(), task_id: task.id, body: "Delete comment" });
  const template = await tool(client, "create_template", { request_id: mutation(), template: { name: "Delete template" } });
  const templateTask = await tool(client, "create_template_task", { request_id: mutation(), template_id: template.id, task: { title: "Delete template task" } });
  for (const [name, args] of [
    ["delete_comment", { task_id: task.id, comment_id: comment.id }],
    ["delete_section", { section_id: section.id }],
    ["delete_template_task", { template_task_id: templateTask.id }],
    ["delete_template", { template_id: template.id }],
    ["delete_task", { task_id: task.id }],
  ] as const) {
    await confirmDeletion(client, await tool(client, name, { request_id: mutation(), ...args }));
  }
  assert.equal((await tool(client, "list_tasks", { project_id: p.id })).total, 0);
  await tool(client, "get_task", { task_id: task.id }, true);
  await tool(client, "get_task", { task_id: child.id }, true);
  await tool(client, "get_section", { section_id: section.id }, true);
  await tool(client, "get_template_task", { template_task_id: templateTask.id }, true);
  await tool(client, "get_template", { template_id: template.id }, true);
});

test("collaborator access stays tied to the active owner and invite", async () => {
  const collaborator = await connection(MCP_SCOPES, members[2]);
  const result = await tool(collaborator.client, "list_projects");
  assert.ok(result.total >= 1);
  await pool.query("UPDATE workspace_invites SET status='revoked' WHERE member_id=$1", [members[2]]);
  try {
    const response = await fetch(`${base}/mcp/projects`, { method: "POST", headers: { Authorization: `Bearer ${collaborator.access_token}`,
      "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401);
  } finally { await pool.query("UPDATE workspace_invites SET status='accepted' WHERE member_id=$1", [members[2]]); }
});

test("orphan cleanup needs fresh member-owned consent and refuses replaced, linked, legacy, expired or revoked files", async () => {
  const c = await getRecoveryContext();
  const getFile = ObjectStorageService.prototype.getObjectEntityFile;
  const files = new Map<string, string>();
  let deletes = 0, raceReplacement = false, failDelete = false;
  const generation = "9007199254740993123";
  const deleteRequests: string[] = [];
  let replacementRejections = 0;
  // Use the installed SDK against a local HTTP storage fixture, not a mocked
  // File.delete. This verifies the actual wire query and its string precision.
  const cloud = express();
  cloud.all("/storage/v1/b/cleanup-fixtures/o/:object", (req, res) => {
    const path = req.params.object;
    if (req.method === "DELETE") {
      deleteRequests.push(String(req.query.ifGenerationMatch ?? ""));
      if (raceReplacement) { files.set(path, "9007199254740993124"); raceReplacement = false; }
      if (req.query.ifGenerationMatch !== files.get(path)) {
        replacementRejections++;
        res.status(412).json({ error: { code: 412, message: "Precondition failed" } });
        return;
      }
      if (failDelete) {
        res.status(503).json({ error: { code: 503, message: "Storage unavailable" } });
        return;
      }
      deletes++;
      files.delete(path);
      res.sendStatus(204);
      return;
    }
    if (!files.has(path)) { res.status(404).json({ error: { code: 404, message: "Not found" } }); return; }
    res.json({ name: path, bucket: "cleanup-fixtures", generation: files.get(path) });
  });
  const cloudServer = cloud.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => cloudServer.once("listening", resolve));
  const sdk = new Storage({
    projectId: "cleanup-fixtures",
    apiEndpoint: `http://127.0.0.1:${(cloudServer.address() as any).port}`,
    useAuthWithCustomEndpoint: false,
    retryOptions: { autoRetry: false },
  });
  ObjectStorageService.prototype.getObjectEntityFile = async (path) => {
    if (!files.has(path)) throw new ObjectNotFoundError();
    return sdk.bucket("cleanup-fixtures").file(path);
  };
  const p = await storage.createProject(c.workspaceId, insertProjectSchema.parse({ name: "Cleanup fixtures" }));
  const t = await storage.createTask(c.workspaceId, p.id, { title: "Leftovers", projectId: p.id });
  async function orphan() {
    const path = `/objects/uploads/cleanup-${mutation()}`;
    files.set(path, generation);
    const att = await storage.createTaskAttachment(t.id, c.workspaceId,
      { objectPath: path, filename: "leftover.txt", mimeType: "text/plain", size: 5 });
    const preview = await executeProjectTool("delete_attachment", { request_id: mutation(), attachment_id: att.id }, c);
    await pool.query("UPDATE project_mcp_approvals SET status='executing' WHERE id=$1", [preview.approvalId]);
    await storage.deleteTaskAttachment(att.id, c.workspaceId);
    const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
    assert.equal(status.result.outcome, "partial");
    assert.deepEqual(status.result.cleanup.attachmentIds, [att.id]);
    return { path, att, source: preview.approvalId };
  }
  const previewArgs = (o: Awaited<ReturnType<typeof orphan>>) =>
    ({ request_id: mutation(), approval_id: o.source, attachment_id: o.att.id });
  const confirmArgs = (preview: any) => ({ request_id: mutation(), approval_id: preview.approvalId, confirmed: true });
  const otherGrant = mutation();
  try {
    await pool.query(`INSERT INTO project_mcp_grants(id,client_id,user_id,workspace_id,scopes,resource)
      SELECT $1,client_id,user_id,workspace_id,scopes,resource FROM project_mcp_grants WHERE id=$2`, [otherGrant, c.grantId]);
    const o = await orphan();
    const args = previewArgs(o);
    await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", args, { ...c, grantId: otherGrant }), /connection/);
    await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", args, { ...c, userId: members[1] }));
    await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", args, { ...c, workspaceId: members[1] }));
    await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", { ...args, request_id: mutation(), attachment_id: mutation() }, c));
    await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", { ...args, object_path: o.path }, c));
    await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", args, { ...c, scopes: ["projects:read"] }));
    await assert.rejects(() => executeProjectTool("confirm_deletion", { request_id: mutation(), approval_id: o.source, confirmed: true }, c));
    const preview = await executeProjectTool("preview_attachment_cleanup", args, c);
    assert.equal(preview.status, "approval_required");
    assert.ok(preview.summary.includes("leftover.txt"));
    assert.equal(preview.confirmationTool, "confirm_deletion");
    assert.equal(deletes, 0);
    assert.deepEqual(await executeProjectTool("preview_attachment_cleanup", args, c), JSON.parse(JSON.stringify(preview)));
    await executeProjectTool("cancel_deletion", { approval_id: preview.approvalId }, c);
    await assert.rejects(() => executeProjectTool("confirm_deletion", confirmArgs(preview), c));
    assert.equal(files.get(o.path), generation);
    const fresh = await executeProjectTool("preview_attachment_cleanup", previewArgs(o), c);
    await assert.rejects(() => executeProjectTool("confirm_deletion", confirmArgs(fresh), { ...c, grantId: otherGrant }));
    const confirmation = confirmArgs(fresh);
    const completed = await executeProjectTool("confirm_deletion", confirmation, c);
    assert.equal(completed.result.databaseChanged, false);
    assert.equal(files.has(o.path), false);
    assert.deepEqual(await executeProjectTool("confirm_deletion", confirmation, c), completed);
    assert.equal(deletes, 1);

    for (const scenario of ["before_preview", "after_preview", "atomic_race", "expired", "revoked", "scope_removed", "linked", "legacy", "storage_failure"] as const) {
      const o = await orphan();
      if (scenario === "before_preview") {
        files.set(o.path, "2");
        await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", previewArgs(o), c), /replaced/);
        continue;
      }
      if (scenario === "legacy") {
        await pool.query("UPDATE project_mcp_approvals SET recovery_data=$2 WHERE id=$1",
          [o.source, JSON.stringify({ complete: true, files: [{ id: o.att.id, path: o.path }] })]);
        await assert.rejects(() => executeProjectTool("preview_attachment_cleanup", previewArgs(o), c), /evidence/);
        continue;
      }
      const preview = await executeProjectTool("preview_attachment_cleanup", previewArgs(o), c);
      if (scenario === "after_preview") files.set(o.path, "2");
      if (scenario === "atomic_race") raceReplacement = true;
      if (scenario === "expired") await pool.query("UPDATE project_mcp_approvals SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [preview.approvalId]);
      if (scenario === "revoked") await pool.query("UPDATE project_mcp_grants SET revoked_at=NOW() WHERE id=$1", [c.grantId]);
      if (scenario === "scope_removed") await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [c.grantId, ["projects:read"]]);
      if (scenario === "linked") await storage.createTaskAttachment(t.id, c.workspaceId,
        { objectPath: o.path, filename: "linked.txt", mimeType: "text/plain", size: 5 });
      failDelete = scenario === "storage_failure";
      const count = deletes;
      try { await assert.rejects(() => executeProjectTool("confirm_deletion", confirmArgs(preview), c)); }
      finally {
        failDelete = false;
        if (scenario === "revoked") await pool.query("UPDATE project_mcp_grants SET revoked_at=NULL WHERE id=$1", [c.grantId]);
        if (scenario === "scope_removed") await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [c.grantId, MCP_SCOPES]);
      }
      assert.equal(deletes, count);
      assert.equal(files.has(o.path), true);
      if (scenario === "storage_failure") {
        const status = await executeProjectTool("get_approval", { approval_id: preview.approvalId }, c);
        assert.equal(status.status, "interrupted");
        assert.equal(status.result.outcome, "target_unchanged");
        assert.equal(status.result.cleanup.originalApprovalId, o.source);
        const retry = await executeProjectTool("preview_attachment_cleanup", previewArgs(o), c);
        await executeProjectTool("confirm_deletion", confirmArgs(retry), c);
      }
    }
    // Cascading DB removal can leave several independent cloud leftovers.
    // An interrupted cleanup of one file never silently finishes the others.
    const multiTask = await storage.createTask(c.workspaceId, p.id, { title: "Partial cascade", projectId: p.id });
    const attachments = [];
    for (let index = 0; index < 2; index++) {
      const path = `/objects/uploads/cascade-${mutation()}`;
      files.set(path, generation);
      attachments.push(await storage.createTaskAttachment(multiTask.id, c.workspaceId,
        { objectPath: path, filename: `leftover-${index}.txt`, mimeType: "text/plain", size: 5 }));
    }
    const original = await executeProjectTool("delete_task", { request_id: mutation(), task_id: multiTask.id }, c);
    await pool.query("UPDATE project_mcp_approvals SET status='executing' WHERE id=$1", [original.approvalId]);
    await storage.deleteTask(multiTask.id, c.workspaceId);
    await executeProjectTool("get_approval", { approval_id: original.approvalId }, c);
    const first = await executeProjectTool("preview_attachment_cleanup",
      { request_id: mutation(), approval_id: original.approvalId, attachment_id: attachments[0].id }, c);
    const firstConfirmation = confirmArgs(first);
    await crashConfirmation(c, firstConfirmation, "deleted");
    const countAfterDeletion = deletes;
    const recovered = await executeProjectTool("confirm_deletion", firstConfirmation, c);
    assert.equal(recovered.status, "interrupted");
    assert.equal(recovered.result.outcome, "target_absent");
    assert.equal(deletes, countAfterDeletion);
    assert.equal(files.has(attachments[1].objectPath), true);
    const originalRow = (await pool.query("SELECT * FROM project_mcp_approvals WHERE id=$1", [original.approvalId])).rows[0];
    assert.equal((await inspectInterruptedDeletion(originalRow, c)).storage, "partial");
    await assert.rejects(() => executeProjectTool("preview_attachment_cleanup",
      { request_id: mutation(), approval_id: original.approvalId, attachment_id: attachments[0].id }, c), /absent/);
    const second = await executeProjectTool("preview_attachment_cleanup",
      { request_id: mutation(), approval_id: original.approvalId, attachment_id: attachments[1].id }, c);
    assert.equal(deletes, countAfterDeletion);
    await executeProjectTool("confirm_deletion", confirmArgs(second), c);
    assert.equal((await inspectInterruptedDeletion(originalRow, c)).storage, "absent");
    assert.ok(deleteRequests.length > 0);
    assert.ok(deleteRequests.every((value) => value === generation), "Every real SDK DELETE must carry the exact string generation");
    assert.equal(replacementRejections, 1, "The replacement race must be rejected by the HTTP service with 412");
  } finally {
    ObjectStorageService.prototype.getObjectEntityFile = getFile;
    await pool.query("DELETE FROM project_mcp_grants WHERE id=$1", [otherGrant]);
    cloudServer.closeAllConnections();
    await new Promise<void>((resolve) => cloudServer.close(() => resolve()));
  }
});

test("attachments verify task ownership, upload provenance, and real storage round trip", async () => {
  const { client } = await connection();
  const p = await createProject(client, "Attachment fixture");
  const t = await tool(client, "create_task", { request_id: mutation(), project_id: p.id, task: { title: "File task" } });
  await tool(client, "complete_attachment_upload", { request_id: mutation(), task_id: t.id,
    object_path: "/objects/uploads/not-issued", filename: "fixture.txt", mime_type: "text/plain" }, true);
  const bytes = Buffer.from("Academy Projects MCP isolated storage test.\n");
  const attachment = await tool(client, "upload_small_attachment", { request_id: mutation(), task_id: t.id,
    filename: "mcp-fixture.txt", mime_type: "text/plain", content_base64: bytes.toString("base64") });
  try {
    assert.equal((await tool(client, "list_attachments", { task_id: t.id })).items.length, 1);
    const downloaded = await tool(client, "download_attachment", { attachment_id: attachment.id });
    const response = await fetch(downloaded.downloadUrl);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-disposition")?.includes("attachment"));
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(bytes));
    const readonly = await connection(["projects:read"], members[1]);
    await tool(readonly.client, "download_attachment", { attachment_id: attachment.id }, true);
    const pending = await tool(client, "delete_attachment", { request_id: mutation(), attachment_id: attachment.id });
    await confirmDeletion(client, pending);
    assert.equal((await tool(client, "list_attachments", { task_id: t.id })).items.length, 0);
  } finally {
    // Even if a check fails, do not leave a generated cloud fixture behind.
    const { deleteAttachmentObject } = await import("./attachments");
    await deleteAttachmentObject(attachment.objectPath);
  }
});
