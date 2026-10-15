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
import { executeProjectTool, projectTools, type ToolContext } from "./tools";
import { FUNNEL_NODE_TYPES, funnelMapInput } from "../../shared/funnel-graph";
import { buildFunnelMap } from "./funnels";

const members = [randomUUID(), randomUUID(), randomUUID()];
const clientIds: string[] = [], sdkClients: Client[] = [];
let server: any, origin: string, context: ToolContext, sdk: Client;
let testFunnel: any;
const graph = {
  nodes: FUNNEL_NODE_TYPES.map((type, i) => ({ id: `n${i}`, type,
    data: { label: type, notes: type === "note" ? "<script>no execution</script>\nOffer notes" : "step notes",
      ...(type === "delay" ? { delayAmount: 2, delayUnit: "days" as const, delayDirection: "before" as const, delayReference: "Webinar" } : {}),
      ...(type === "emailNode" ? { emailSubject: "Reminder", emailBody: "See you soon", emailDay: 1 } : {}),
      ...(type === "smsNode" ? { smsBody: "Starting soon", smsDay: 2 } : {}),
      ...(type === "trafficSource" ? { trafficPlatform: "facebook", estimatedTraffic: 100, costPerClick: 1.2 } : {}) } })),
  edges: [{ id: "flow", source: "n0", target: "n1", label: "Register" }],
};
before(async () => {
  await ensureMcpDatabase();
  await pool.query(`INSERT INTO users(id,email,cf_enrolled,is_admin,is_disabled) VALUES
    ($1,$2,true,false,false),($3,$4,true,false,false),($5,$6,false,false,false)`,
  members.flatMap((id) => [id, `funnel-mcp-${id}@example.invalid`]));
  await pool.query(`INSERT INTO workspace_invites(owner_id,invite_email,invite_token,status,member_id,accepted_at)
    VALUES($1,$2,$3,'accepted',$4,NOW())`, [members[0], `funnel-mcp-${members[2]}@example.invalid`, randomUUID(), members[2]]);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: randomBytes(32).toString("hex"), resave: false, saveUninitialized: false }));
  // Only this isolated test app has this route. No main-app authentication bypass.
  app.post("/fixture-login", (req, res) => {
    req.session.userId = members[0]; res.json({ ok: true });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  registerProjectsMcpRoutes(app, (req, res, next) => {
    if (!req.session.userId) { res.sendStatus(401); return; } next();
  }, { origin });
  const registration = await fetch(`${origin}/api/mcp/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Funnel SDK fixture", redirect_uris: ["https://ai.example.invalid/callback"],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  assert.equal(registration.status, 201);
  const client = await registration.json(); clientIds.push(client.client_id);
  const verifier = randomBytes(32).toString("base64url");
  const scopes = ["funnels:read", "funnels:write"];
  const params = new URLSearchParams({ client_id: client.client_id, response_type: "code", redirect_uri: client.redirect_uris[0],
    scope: scopes.join(" "), resource: `${origin}/mcp/agent`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const auth = await fetch(`${origin}/api/mcp/oauth/authorize?${params}`, { redirect: "manual" });
  assert.equal(auth.status, 302);
  const requestId = new URL(auth.headers.get("location")!).searchParams.get("request");
  const login = await fetch(`${origin}/fixture-login`, { method: "POST" });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const headers = { Cookie: cookie, Origin: origin, "Content-Type": "application/json" };
  const consent = await (await fetch(`${origin}/api/mcp/consent/${requestId}`, { headers })).json();
  assert.deepEqual(consent.scopes, scopes);
  const approve = await fetch(`${origin}/api/mcp/consent/${requestId}`, { method: "POST", headers,
    body: JSON.stringify({ decision: "approve", scopes, csrfToken: consent.csrfToken }) });
  assert.equal(approve.status, 200);
  const redirect = new URL((await approve.json()).redirectTo);
  const token = await fetch(`${origin}/api/mcp/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: redirect.searchParams.get("code")!,
      code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: `${origin}/mcp/agent` }) });
  assert.equal(token.status, 200);
  const credentials = await token.json();
  const { rows: [grant] } = await pool.query("SELECT grant_id FROM project_mcp_tokens WHERE hash=$1", [hashToken(credentials.access_token)]);
  context = { userId: members[0], workspaceId: members[0], grantId: grant.grant_id, scopes, origin };
  sdk = new Client({ name: "funnel-tests", version: "1.0" }); sdkClients.push(sdk);
  await sdk.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp/agent`),
    { requestInit: { headers: { Authorization: `Bearer ${credentials.access_token}` } } }));
});
after(async () => {
  for (const client of sdkClients) await client.close().catch(() => {});
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  await pool.query("DELETE FROM project_mcp_clients WHERE id=ANY($1::varchar[])", [clientIds]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [members]);
  await pool.end();
});
async function call(name: string, args: any = {}) {
  const result: any = await sdk.callTool({ name, arguments: args });
  const body = JSON.parse(result.content[0].text);
  assert.ok(!result.isError, JSON.stringify(body));
  return body;
}
const run = (name: string, args: any, c = context) => executeProjectTool(name, args, c);
const mutation = () => randomUUID();

test("Funnel-only OAuth consent and SDK expose every node but not Projects tools", async () => {
  assert.equal(validMcpScopes(["funnels:read", "funnels:write"]), true);
  assert.equal(validMcpScopes(["funnels:write"]), false);
  const names = (await sdk.listTools()).tools.map((t) => t.name);
  assert.ok(names.includes("create_funnel") && names.includes("confirm_deletion"));
  assert.ok(!names.includes("list_projects"));
  assert.deepEqual((await call("funnel_node_catalog")).nodeTypes, [...FUNNEL_NODE_TYPES]);
  const args = { request_id: mutation(), name: "All nodes fixture", map: graph };
  testFunnel = await call("create_funnel", args);
  assert.equal(testFunnel.canvasData.nodes.length, 15);
  assert.deepEqual(new Set(testFunnel.canvasData.nodes.map((n: any) => n.type)), new Set(FUNNEL_NODE_TYPES));
  assert.ok(testFunnel.canvasData.nodes.every((n: any) => n.type === n.data.nodeType && Number.isFinite(n.position.x)));
  assert.equal(testFunnel.canvasData.edges[0].sourceHandle, "right");
  assert.ok(testFunnel.canvasData.nodes.find((n: any) => n.type === "note").data.notes.includes("&lt;script&gt;"));
  assert.equal(testFunnel.canvasData.nodes.find((n: any) => n.type === "delay").data.delayAmount, 2);
  assert.equal(testFunnel.url, `${origin}/funnel-grid/${testFunnel.id}`);
  assert.equal((await call("create_funnel", args)).id, testFunnel.id);
  assert.equal((await call("list_funnels")).items.length, 1);
  const saved = await storage.getFunnel(testFunnel.id, members[0]);
  assert.deepEqual(saved!.canvasData, testFunnel.canvasData);
});

test("validation rejects missing/duplicate endpoints, unsupported types, unsafe URLs and connected notes", () => {
  assert.throws(() => funnelMapInput.parse({ ...graph, edges: [{ id: "bad", source: "n0", target: "missing" }] }));
  assert.throws(() => funnelMapInput.parse({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] }));
  assert.throws(() => funnelMapInput.parse({ nodes: [{ id: "bad", type: "madeUp", data: { label: "Bad" } }], edges: [] }));
  assert.throws(() => buildFunnelMap({ nodes: [{ id: "bad", type: "salesPage", data: { label: "Bad", pageUrl: "javascript:alert(1)" } }], edges: [] }));
  assert.throws(() => funnelMapInput.parse({ ...graph, edges: [{ id: "bad", source: "n0", target: "n13" }] }));
});

test("safe incremental edits, connections, batch additions, layout and duplication", async () => {
  const base = () => ({ request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version });
  testFunnel = await call("update_funnel", { ...base(), changes: { name: "Renamed" } });
  testFunnel = await call("update_funnel_node", { ...base(), node_id: "n13", changes: { data: { notes: "Updated\nnote" }, width: 400 } });
  assert.equal(testFunnel.canvasData.nodes.find((n: any) => n.type === "note").data.notes, "Updated<br>note");
  testFunnel = await call("add_funnel_nodes", { ...base(), map: { nodes: [{ id: "extra", type: "note", data: { label: "New note", notes: "Summary" } }], edges: [] } });
  testFunnel = await call("connect_funnel_nodes", { ...base(), edges: [{ id: "branch", source: "n1", target: "n2", label: "Success" }] });
  testFunnel = await call("layout_funnel", base());
  assert.equal(testFunnel.canvasData.nodes.length, 16);
  const copy = await call("duplicate_funnel", { request_id: mutation(), funnel_id: testFunnel.id });
  assert.notEqual(copy.id, testFunnel.id);
  assert.deepEqual(copy.canvasData, testFunnel.canvasData);
});

test("read-only, foreign-owner, shared-workspace and downgraded grants cannot write or expose maps", async () => {
  const args = { request_id: mutation(), name: "Denied", map: graph };
  await assert.rejects(run("create_funnel", args, { ...context, scopes: ["funnels:read"] }), (e: any) => e.code === "insufficient_scope");
  await assert.rejects(run("get_funnel", { funnel_id: testFunnel.id }, { ...context, userId: members[2] }), (e: any) => e.code === "insufficient_scope");
  const other = await storage.createFunnel(members[1], { name: "Private", canvasData: graph });
  await assert.rejects(run("get_funnel", { funnel_id: other.id }), (e: any) => e.code === "not_found");
  await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [context.grantId, ["funnels:read"]]);
  try { await assert.rejects(run("create_funnel", args), (e: any) => e.code === "insufficient_scope"); }
  finally { await pool.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [context.grantId, context.scopes]); }
});

test("website and AI saves use conditional versions; thumbnails do not invalidate edits", async () => {
  const old = testFunnel;
  const updated = await storage.updateFunnel(old.id, members[0], { name: "Browser edit" }, old.version);
  assert.ok(updated);
  await assert.rejects(run("update_funnel", { request_id: mutation(), funnel_id: old.id, expected_version: old.version, changes: { name: "Stale AI" } }),
    (e: any) => e.code === "edit_conflict");
  assert.equal(await storage.updateFunnel(old.id, members[0], { name: "Stale browser" }, old.version), undefined);
  testFunnel = await call("get_funnel", { funnel_id: old.id });
  await storage.updateFunnel(old.id, members[0], { thumbnailData: "fixture-thumbnail" });
  assert.equal((await call("get_funnel", { funnel_id: old.id })).version, testFunnel.version);
  assert.equal(testFunnel.name, "Browser edit");
});

test("node, connection and map replacement require in-agent confirmation; stale and cancelled approvals cannot execute", async () => {
  let preview = await call("delete_funnel_node", { request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version, node_id: "extra" });
  assert.equal(preview.status, "approval_required");
  assert.equal((await call("get_funnel", { funnel_id: testFunnel.id })).canvasData.nodes.length, 16);
  await call("cancel_deletion", { approval_id: preview.approvalId });
  await assert.rejects(run("confirm_deletion", { request_id: mutation(), approval_id: preview.approvalId, confirmed: true }));
  preview = await call("delete_funnel_node", { request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version, node_id: "extra" });
  await call("confirm_deletion", { request_id: mutation(), approval_id: preview.approvalId, confirmed: true });
  testFunnel = await call("get_funnel", { funnel_id: testFunnel.id });
  assert.equal(testFunnel.canvasData.nodes.length, 15);
  preview = await call("delete_funnel_connection", { request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version, edge_id: "branch" });
  await call("confirm_deletion", { request_id: mutation(), approval_id: preview.approvalId, confirmed: true });
  testFunnel = await call("get_funnel", { funnel_id: testFunnel.id });
  preview = await call("replace_funnel_map", { request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version,
    map: { nodes: [{ id: "new", type: "note", data: { label: "Replacement", notes: "New map" } }], edges: [] } });
  const request_id = mutation();
  const confirmation = { request_id, approval_id: preview.approvalId, confirmed: true };
  const result = await call("confirm_deletion", confirmation);
  assert.deepEqual(await call("confirm_deletion", confirmation), result);
  testFunnel = await call("get_funnel", { funnel_id: testFunnel.id });
  assert.equal(testFunnel.canvasData.nodes.length, 1);
  preview = await call("delete_funnel", { request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version });
  await storage.updateFunnel(testFunnel.id, members[0], { name: "Changed after preview" }, testFunnel.version);
  await assert.rejects(run("confirm_deletion", { request_id: mutation(), approval_id: preview.approvalId, confirmed: true }),
    (e: any) => e.code === "stale_approval");
  assert.ok(await storage.getFunnel(testFunnel.id, members[0]));
});

test("whole-map deletion refuses attached brain files, then deletes only after explicit confirmation", async () => {
  testFunnel = await call("get_funnel", { funnel_id: testFunnel.id });
  await pool.query("INSERT INTO funnel_brain_files(funnel_id,user_id,filename) VALUES($1,$2,'fixture.txt')", [testFunnel.id, members[0]]);
  await assert.rejects(run("delete_funnel", { request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version }), /attached brain files/);
  await pool.query("DELETE FROM funnel_brain_files WHERE funnel_id=$1", [testFunnel.id]);
  const preview = await call("delete_funnel", { request_id: mutation(), funnel_id: testFunnel.id, expected_version: testFunnel.version });
  assert.ok(await storage.getFunnel(testFunnel.id, members[0]));
  await call("confirm_deletion", { request_id: mutation(), approval_id: preview.approvalId, confirmed: true });
  assert.equal(await storage.getFunnel(testFunnel.id, members[0]), undefined);
});

test("every advertised funnel tool shares the correct scope", () => {
  for (const [name, tool] of Object.entries(projectTools)) {
    if (name.includes("funnel")) assert.equal(tool.scope, "funnels", name);
  }
});
