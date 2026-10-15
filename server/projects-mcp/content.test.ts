import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { before, after, test } from "node:test";
import express from "express";
import session from "express-session";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { pool } from "../db";
import { storage } from "../storage";
import { registerProjectsMcpRoutes } from "./routes";
import { ensureMcpDatabase } from "./database";
import { hashToken, validMcpScopes } from "./oauth";
import { executeProjectTool, inspectInterruptedDeletion, type ToolContext } from "./tools";
import { scriptJsonSchema } from "../../shared/schema";
import { readContent, readContentItems, updateContentFromBrowser } from "./content";

const users = [randomUUID(), randomUUID()];
const scopes = ["scripts:read", "scripts:write", "links:read", "links:write"];
let server: any, origin: string, clientId: string, sdk: Client, context: ToolContext;
let script: any, link: any;
before(async () => {
  await ensureMcpDatabase();
  for (const user of users) await pool.query(
    "INSERT INTO users(id,email,cf_enrolled,is_admin,is_disabled) VALUES($1,$2,true,false,false)", [user, `content-mcp-${user}@example.invalid`]);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: randomBytes(32).toString("hex"), resave: false, saveUninitialized: false }));
  // Isolated test server only; never installed into the application.
  app.post("/fixture-login", (req, res) => { req.session.userId = users[0]; res.json({ ok: true }); });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  registerProjectsMcpRoutes(app, (req, res, next) => { if (!req.session.userId) { res.sendStatus(401); return; } next(); }, { origin });
  const registered = await fetch(`${origin}/api/mcp/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Content SDK fixture", redirect_uris: ["https://ai.example.invalid/callback"],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  assert.equal(registered.status, 201);
  const client = await registered.json(); clientId = client.client_id;
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: client.redirect_uris[0],
    scope: scopes.join(" "), resource: `${origin}/mcp/agent`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const auth = await fetch(`${origin}/api/mcp/oauth/authorize?${params}`, { redirect: "manual" });
  const requestId = new URL(auth.headers.get("location")!, origin).searchParams.get("request");
  const login = await fetch(`${origin}/fixture-login`, { method: "POST" });
  const headers = { "Content-Type": "application/json", Cookie: login.headers.get("set-cookie")!.split(";")[0], Origin: origin };
  const consent = await (await fetch(`${origin}/api/mcp/consent/${requestId}`, { headers })).json();
  assert.deepEqual(consent.scopes, scopes);
  const approval = await fetch(`${origin}/api/mcp/consent/${requestId}`, { method: "POST", headers,
    body: JSON.stringify({ decision: "approve", scopes, csrfToken: consent.csrfToken }) });
  assert.equal(approval.status, 200);
  const redirect = new URL((await approval.json()).redirectTo);
  const tokenResponse = await fetch(`${origin}/api/mcp/oauth/token`, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
      grant_type: "authorization_code", client_id: clientId, code: redirect.searchParams.get("code")!,
      code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: `${origin}/mcp/agent`,
    }) });
  assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  const { rows: [grant] } = await pool.query("SELECT grant_id FROM project_mcp_tokens WHERE hash=$1", [hashToken(token.access_token)]);
  context = { userId: users[0], workspaceId: users[0], grantId: grant.grant_id, scopes, origin };
  sdk = new Client({ name: "Content tests", version: "1.0" });
  await sdk.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp/agent`),
    { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }));
});
after(async () => {
  await sdk?.close().catch(() => {});
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  if (clientId) await pool.query("DELETE FROM project_mcp_clients WHERE id=$1", [clientId]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [users]);
  await pool.end();
});
async function call(name: string, args: any = {}) {
  const result: any = await sdk.callTool({ name, arguments: args });
  const body = JSON.parse(result.content[0].text);
  assert.ok(!result.isError, JSON.stringify(body));
  return body;
}
const run = (name: string, args: any, c = context) => executeProjectTool(name, args, c);
const uuid = () => randomUUID();

test("Scripts/Link Vault-only OAuth and SDK discovery do not grant Projects or Funnel Grid", async () => {
  assert.equal(validMcpScopes(["scripts:read"]), true);
  assert.equal(validMcpScopes(["links:read", "links:write"]), true);
  assert.equal(validMcpScopes(["scripts:write", "links:read"]), false);
  assert.equal(validMcpScopes(["scripts:read", "unknown:read"]), false);
  const names = (await sdk.listTools()).tools.map((tool) => tool.name);
  for (const name of ["list_scripts", "create_script", "update_script", "delete_script",
    "list_vault_links", "get_vault_link", "create_vault_link", "list_vault_categories", "confirm_deletion"]) assert.ok(names.includes(name), name);
  assert.ok(!names.includes("list_projects"));
  assert.ok(!names.includes("list_funnels"));
});
test("AI-written scripts save in the actual browser editor format and retry without duplicates", async () => {
  const args = { request_id: uuid(), title: "Webinar introduction", notes: "Offer: free webinar",
    script_json: { fullScript: { hook: { text: "What if you could simplify this?", duration: "10 seconds" },
      content: { text: "Main points", sections: [{ title: "Step one", content: "Choose one goal" }] } }, shortsScript: "A short version" } };
  script = await call("create_script", args);
  assert.equal(script.userId, users[0]);
  assert.equal(script.editorUrl, `${origin}/video-studio/scripts/${script.id}`);
  scriptJsonSchema.parse(script.scriptJson);
  assert.equal(script.scriptJson.fullScript.hook.text, args.script_json.fullScript.hook.text);
  assert.equal(script.scriptJson.fullScript.finalCTA.text, "");
  assert.equal(script.teleprompterScriptId, null);
  assert.equal((await call("create_script", args)).id, script.id);
  assert.equal((await storage.getScript(script.id))?.scriptJson?.fullScript.hook.text, args.script_json.fullScript.hook.text);
  assert.equal((await call("list_scripts", { query: "Webinar", limit: 1 })).items[0].id, script.id);
});
test("partial revisions preserve sections; browser edits invalidate an old AI version", async () => {
  const args = { request_id: uuid(), script_id: script.id, expected_version: script.version,
    changes: { script_json: { fullScript: { hook: { text: "An improved opening" } } } } };
  script = await call("update_script", args);
  assert.equal(script.scriptJson.fullScript.hook.duration, "10 seconds");
  assert.equal(script.scriptJson.fullScript.content.sections[0].content, "Choose one goal");
  assert.equal(script.scriptJson.shortsScript, "A short version");
  await storage.updateScript(script.id, users[0], { notes: "New browser notes" });
  await assert.rejects(run("update_script", { ...args, request_id: uuid(), expected_version: script.version }), (e: any) => e.code === "edit_conflict");
  script = await call("get_script", { script_id: script.id });
  assert.equal(script.notes, "New browser notes");
  const duplicate = await call("duplicate_script", { request_id: uuid(), script_id: script.id });
  assert.notEqual(duplicate.id, script.id);
  assert.deepEqual(duplicate.scriptJson, script.scriptJson);
});
test("Link Vault create, search, pagination, categories, updates and duplicate use normal saved entries", async () => {
  const args = { request_id: uuid(), title: "Webinar registration", url: "https://example.invalid/register",
    description: "Live training signup", category: "Webinars", emoji: "🎥" };
  link = await call("create_vault_link", args);
  assert.equal((await call("create_vault_link", args)).id, link.id);
  assert.equal(link.editorUrl, `${origin}/links`);
  assert.equal((await storage.getAffiliateLink(link.id, users[0]))?.category, "Webinars");
  assert.deepEqual((await call("list_vault_categories")).categories, ["Webinars"]);
  link = await call("update_vault_link", { request_id: uuid(), link_id: link.id, expected_version: link.version,
    changes: { category: "Resources", description: "Updated description" } });
  assert.equal(link.url, args.url);
  const duplicate = await call("duplicate_vault_link", { request_id: uuid(), link_id: link.id, title: "Second resource" });
  assert.equal(duplicate.clickCount, 0);
  const first = await call("list_vault_links", { query: "resource", category: "Resources", limit: 1 });
  assert.equal(first.total, 2);
  assert.equal(first.nextOffset, 1);
  assert.equal((await call("list_vault_links", { category: "Resources", limit: 1, offset: 1 })).nextOffset, null);
  await storage.updateAffiliateLink(link.id, users[0], { title: "Browser revised title" });
  await assert.rejects(run("update_vault_link", { request_id: uuid(), link_id: link.id, expected_version: link.version,
    changes: { description: "Stale" } }), (e: any) => e.code === "edit_conflict");
  link = await call("get_vault_link", { link_id: link.id });
});
test("read-only, old grants, other members and shared contexts cannot expose or mutate personal content", async () => {
  const args = { request_id: uuid(), title: "Denied" };
  await assert.rejects(run("create_script", args, { ...context, scopes: ["scripts:read"] }), (e: any) => e.code === "insufficient_scope");
  await assert.rejects(run("list_vault_links", {}, { ...context, scopes: ["projects:read", "projects:write"] }), (e: any) => e.code === "insufficient_scope");
  await assert.rejects(run("list_scripts", {}, { ...context, workspaceId: users[1] }), (e: any) => e.code === "insufficient_scope");
  const { rows: [foreign] } = await pool.query("INSERT INTO scripts(user_id,title) VALUES($1,'Private') RETURNING id", [users[1]]);
  await assert.rejects(run("get_script", { script_id: foreign.id }), (e: any) => e.code === "not_found");
  await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [context.grantId, ["scripts:read", "links:read"]]);
  try { await assert.rejects(run("create_script", args), (e: any) => e.code === "insufficient_scope"); }
  finally { await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [context.grantId, scopes]); }
});
test("invalid URLs, ownership overrides, empty edits and oversized scripts fail explicitly", async () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,bad"]) {
    await assert.rejects(run("create_vault_link", { request_id: uuid(), title: "Bad", url }));
  }
  await assert.rejects(run("create_script", { request_id: uuid(), title: "Bad", userId: users[1] }));
  await assert.rejects(run("create_script", { request_id: uuid(), title: "Large", script_json: { expandedScript: "a".repeat(200001) } }));
  await assert.rejects(run("update_script", { request_id: uuid(), script_id: script.id, expected_version: script.version, changes: {} }), /at least one change/);
});
test("browser saves also reject stale AI edits and missing versions; list versions match get versions", async () => {
  const c = { userId: users[0], origin: "" };
  const browserScript = await readContent("scripts", script.id, c);
  script = await call("update_script", { request_id: uuid(), script_id: script.id, expected_version: browserScript.version,
    changes: { script_json: { description: { summary: "Useful summary" } } } });
  assert.equal(script.scriptJson.description.tags.length, 0);
  await assert.rejects(updateContentFromBrowser("scripts", script.id, browserScript.version, { title: "Stale browser" }, users[0]),
    (e: any) => e.code === "edit_conflict");
  script = await updateContentFromBrowser("scripts", script.id, script.version, { title: "Browser saved script" }, users[0]);
  const [browserLink] = await readContentItems("links", [link.id], c);
  assert.equal(browserLink.version, link.version);
  link = await call("update_vault_link", { request_id: uuid(), link_id: link.id, expected_version: link.version, changes: { category: null } });
  await assert.rejects(updateContentFromBrowser("links", link.id, browserLink.version, { title: "Stale" }, users[0]),
    (e: any) => e.code === "edit_conflict");
  await assert.rejects(updateContentFromBrowser("links", link.id, undefined, { title: "Unversioned" }, users[0]),
    (e: any) => e.code === "edit_conflict");
  link = await updateContentFromBrowser("links", link.id, link.version, { title: "Browser saved link", category: "Resources" }, users[0]);
  assert.equal(link.title, "Browser saved link");
});
test("script and link deletion stays in the AI app, is cancellable and rejects changed previews", async () => {
  for (const [kind, record, get, remove, field] of [
    ["scripts", script, "get_script", "delete_script", "script_id"],
    ["links", link, "get_vault_link", "delete_vault_link", "link_id"],
  ] as const) {
    let current = await call(get, { [field]: record.id });
    let preview = await call(remove, { request_id: uuid(), [field]: record.id, expected_version: current.version });
    assert.ok(preview.approvalId);
    assert.equal((await call(get, { [field]: record.id })).id, record.id);
    await call("cancel_deletion", { request_id: uuid(), approval_id: preview.approvalId });
    await assert.rejects(run("confirm_deletion", { request_id: uuid(), approval_id: preview.approvalId, confirmed: true }));
    preview = await call(remove, { request_id: uuid(), [field]: record.id, expected_version: current.version });
    if (kind === "scripts") await storage.updateScript(record.id, users[0], { title: "Changed after preview" });
    else await storage.updateAffiliateLink(record.id, users[0], { title: "Changed after preview" });
    await assert.rejects(run("confirm_deletion", { request_id: uuid(), approval_id: preview.approvalId, confirmed: true }),
      (e: any) => e.code === "stale_approval");
    current = await call(get, { [field]: record.id });
    preview = await call(remove, { request_id: uuid(), [field]: record.id, expected_version: current.version });
    const confirmation = { request_id: uuid(), approval_id: preview.approvalId, confirmed: true };
    const result = await call("confirm_deletion", confirmation);
    assert.deepEqual(await call("confirm_deletion", confirmation), result);
    await assert.rejects(run(get, { [field]: record.id }), (e: any) => e.code === "not_found");
    assert.equal((await inspectInterruptedDeletion({ tool_name: remove, args: { [field]: record.id } }, context)).outcome, "target_absent");
  }
});
