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
import { projectTools } from "./tools";

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
async function authorize(scopes = MCP_SCOPES, userId = members[0]) {
  const registration = await fetch(`${base}/api/mcp/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "SDK test assistant", redirect_uris: ["https://ai.example.invalid/oauth/callback"],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  assert.equal(registration.status, 201);
  const info = await registration.json();
  const verifier = randomBytes(32).toString("base64url");
  const parameters = new URLSearchParams({ client_id: info.client_id, response_type: "code",
    redirect_uri: info.redirect_uris[0], scope: scopes.join(" "), state: "fixture-state",
    resource: `${base}/mcp/projects`, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
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
      code, code_verifier: actualVerifier, redirect_uri: info.redirect_uris[0], resource: `${base}/mcp/projects` }),
  });
  return { info, requestId, code, exchange, details };
}
async function connection(scopes = MCP_SCOPES, userId = members[0]) {
  const auth = await authorize(scopes, userId);
  const response = await auth.exchange();
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.ok(typeof tokens.access_token === "string" && typeof tokens.refresh_token === "string");
  const { rows: [grant] } = await pool.query("SELECT grant_id FROM project_mcp_tokens WHERE hash=$1", [hashToken(tokens.access_token)]);
  refresh.set(grant.grant_id, tokens.refresh_token);
  const client = new Client({ name: "academy-projects-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/projects`),
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

test("destructive actions require the member, cannot be spoofed, and reject changed targets", async () => {
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
  assert.equal((await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision: "approve" }, members[1])).status, 409);
  assert.equal((await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision: "approve" }, members[0], "https://attacker.example.invalid")).status, 403);
  const approved = await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision: "approve" });
  assert.equal(approved.status, 200);
  assert.equal(await storage.getProject(p.id, members[0]), undefined);
  assert.equal((await tool(client, "get_approval", { approval_id: pending.approvalId })).status, "approved");
  assert.equal((await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision: "approve" })).status, 409);
  const changed = await createProject(client, "Changed deletion target");
  const stale = await tool(client, "delete_project", { request_id: mutation(), project_id: changed.id });
  await tool(client, "create_task", { request_id: mutation(), project_id: changed.id, task: { title: "Added after deletion request" } });
  assert.equal((await browser(`/api/mcp/approvals/${stale.approvalId}`, "POST", { decision: "approve" })).status, 400);
  assert.ok(await storage.getProject(changed.id, members[0]));
  const expired = await tool(client, "delete_project", { request_id: mutation(), project_id: changed.id });
  await pool.query("UPDATE project_mcp_approvals SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expired.approvalId]);
  assert.equal((await browser(`/api/mcp/approvals/${expired.approvalId}`, "POST", { decision: "approve" })).status, 409);
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
    assert.equal((await browser(`/api/mcp/approvals/${pending.approvalId}`, "POST", { decision: "approve" })).status, 200);
    assert.equal((await tool(client, "list_attachments", { task_id: t.id })).items.length, 0);
  } finally {
    // Even if a check fails, do not leave a generated cloud fixture behind.
    const { deleteAttachmentObject } = await import("./attachments");
    await deleteAttachmentObject(attachment.objectPath);
  }
});
