import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { pool } from "../server/db";

if (process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev")) {
  throw new Error("Synthetic content smoke tests are for the development site only.");
}
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const userId = randomUUID(), password = randomBytes(24).toString("hex");
let clientId: string | undefined;
const sdk = new Client({ name: "Content smoke fixture", version: "1.0" });
try {
  const email = `content-smoke-${userId}@example.invalid`;
  await pool.query(`INSERT INTO users(id,email,password_hash,is_admin,cf_enrolled,is_disabled,display_name)
    VALUES($1,$2,$3,true,true,false,'Content smoke fixture')`, [userId, email, await bcrypt.hash(password, 10)]);
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  const headers = { "Content-Type": "application/json", Cookie: login.headers.get("set-cookie")!.split(";")[0], Origin: origin };
  const registration = await fetch(`${origin}/api/mcp/oauth/register`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Content smoke fixture",
      redirect_uris: ["https://ai.example.invalid/callback"], token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  assert.equal(registration.status, 201);
  const client = await registration.json(); clientId = client.client_id;
  const scopes = ["scripts:read", "scripts:write", "links:read", "links:write"];
  const verifier = randomBytes(32).toString("base64url");
  const authorization = await fetch(`${origin}/api/mcp/oauth/authorize?${new URLSearchParams({
    client_id: clientId!, response_type: "code", redirect_uri: client.redirect_uris[0], scope: scopes.join(" "),
    resource: `${origin}/mcp/agent`, code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  })}`, { redirect: "manual" });
  const requestId = new URL(authorization.headers.get("location")!, origin).searchParams.get("request");
  const consent = await (await fetch(`${origin}/api/mcp/consent/${requestId}`, { headers })).json();
  assert.deepEqual(consent.scopes, scopes);
  const approved = await fetch(`${origin}/api/mcp/consent/${requestId}`, { method: "POST", headers,
    body: JSON.stringify({ csrfToken: consent.csrfToken, decision: "approve", scopes }) });
  assert.equal(approved.status, 200);
  const redirect = new URL((await approved.json()).redirectTo);
  const tokenResponse = await fetch(`${origin}/api/mcp/oauth/token`, { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
      grant_type: "authorization_code", client_id: clientId!, code: redirect.searchParams.get("code")!,
      code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: `${origin}/mcp/agent`,
    }) });
  assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  await sdk.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp/agent`),
    { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }));
  async function call(name: string, args: any) {
    const result: any = await sdk.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result.content));
    return JSON.parse(result.content[0].text);
  }
  const script = await call("create_script", { request_id: randomUUID(), title: "Synthetic video script",
    script_json: { fullScript: { hook: { text: "An AI-written hook" },
      content: { sections: [{ title: "Step one", content: "A useful first step" }] } } } });
  const link = await call("create_vault_link", { request_id: randomUUID(), title: "Synthetic webinar link",
    url: "https://example.invalid/webinar", category: "Webinars" });
  const browserScript = await (await fetch(`${origin}/api/topic-pulse/scripts/${script.id}`, { headers })).json();
  assert.deepEqual(browserScript.scriptJson, script.scriptJson);
  assert.equal(browserScript.version, script.version);
  const browserLinks = await (await fetch(`${origin}/api/affiliate-links`, { headers })).json();
  assert.equal(browserLinks.links[0].id, link.id);
  assert.equal(browserLinks.links[0].version, link.version);
  for (const [url, initial, body, mcpTool, idField, aiChanges] of [
    [`/api/topic-pulse/scripts/${script.id}`, script, { scriptJson: { ...script.scriptJson, shortsScript: "Browser revision" } },
      "update_script", "script_id", { title: "Stale AI script" }],
    [`/api/affiliate-links/${link.id}`, link, { description: "Browser revision" },
      "update_vault_link", "link_id", { title: "Stale AI link" }],
  ] as const) {
    const saved = await fetch(`${origin}${url}`, { method: "PATCH", headers,
      body: JSON.stringify({ ...body, expectedVersion: initial.version }) });
    assert.equal(saved.status, 200, `Browser saves ${url}`);
    assert.notEqual((await saved.json()).version, initial.version);
    const staleBrowser = await fetch(`${origin}${url}`, { method: "PATCH", headers,
      body: JSON.stringify({ ...body, expectedVersion: initial.version }) });
    assert.equal(staleBrowser.status, 409);
    const staleAI: any = await sdk.callTool({ name: mcpTool, arguments: { request_id: randomUUID(),
      [idField]: initial.id, expected_version: initial.version, changes: aiChanges } });
    assert.ok(staleAI.isError);
    assert.equal(JSON.parse(staleAI.content[0].text).error, "edit_conflict");
  }
  for (const [get, remove, field, record] of [
    ["get_script", "delete_script", "script_id", script],
    ["get_vault_link", "delete_vault_link", "link_id", link],
  ] as const) {
    const current = await call(get, { [field]: record.id });
    const preview = await call(remove, { request_id: randomUUID(), [field]: record.id, expected_version: current.version });
    assert.ok(preview.approvalId);
    await call("confirm_deletion", { request_id: randomUUID(), approval_id: preview.approvalId, confirmed: true });
  }
  console.log("Running-site smoke passed: normal login, OAuth, SDK-created scripts/links visible to browser APIs, browser saves, stale browser/AI refusal, and in-agent deletion confirmation.");
} finally {
  await sdk.close().catch(() => {});
  if (clientId) await pool.query("DELETE FROM project_mcp_clients WHERE id=$1", [clientId]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  await pool.end();
  console.log("Synthetic content fixtures removed.");
}
