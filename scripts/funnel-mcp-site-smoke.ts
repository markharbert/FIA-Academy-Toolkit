import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import bcrypt from "bcrypt";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { pool } from "../server/db";
import { FUNNEL_NODE_TYPES } from "../shared/funnel-graph";

const statePath = "/tmp/fia-funnel-mcp-smoke.json";
if (process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev")) {
  throw new Error("Smoke fixtures are for the development site only.");
}
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
if (process.argv.includes("--cleanup")) {
  const fixture = JSON.parse(await readFile(statePath, "utf8"));
  await pool.query("DELETE FROM project_mcp_clients WHERE id=$1", [fixture.clientId]);
  await pool.query("DELETE FROM users WHERE id=$1", [fixture.userId]);
  await unlink(statePath);
  console.log("Synthetic funnel smoke fixtures removed.");
  await pool.end();
} else {
  const userId = randomUUID(), password = randomBytes(24).toString("hex");
  const email = `funnel-smoke-${userId}@example.invalid`;
  let clientId: string | undefined, keep = false;
  const sdk = new Client({ name: "Funnel smoke fixture", version: "1.0" });
  try {
    await pool.query("INSERT INTO users(id,email,password_hash,is_admin,cf_enrolled,is_disabled,display_name) VALUES($1,$2,$3,true,true,false,'Funnel Smoke Fixture')",
      [userId, email, await bcrypt.hash(password, 10)]);
    const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }) });
    assert.equal(login.status, 200, "Real website login");
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const headers = { "Content-Type": "application/json", Cookie: cookie, Origin: origin };
    const registration = await fetch(`${origin}/api/mcp/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Temporary funnel smoke", redirect_uris: ["https://ai.example.invalid/callback"],
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
    assert.equal(registration.status, 201);
    const client = await registration.json(); clientId = client.client_id;
    const verifier = randomBytes(32).toString("base64url");
    const scopes = ["funnels:read", "funnels:write"];
    const params = new URLSearchParams({ client_id: client.client_id, response_type: "code", redirect_uri: client.redirect_uris[0],
      scope: scopes.join(" "), resource: `${origin}/mcp/agent`,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    const auth = await fetch(`${origin}/api/mcp/oauth/authorize?${params}`, { redirect: "manual" });
    assert.equal(auth.status, 302);
    const requestId = new URL(auth.headers.get("location")!).searchParams.get("request");
    const consentResponse = await fetch(`${origin}/api/mcp/consent/${requestId}`, { headers });
    assert.equal(consentResponse.status, 200);
    const consent = await consentResponse.json();
    const approve = await fetch(`${origin}/api/mcp/consent/${requestId}`, { method: "POST", headers,
      body: JSON.stringify({ csrfToken: consent.csrfToken, decision: "approve", scopes }) });
    assert.equal(approve.status, 200);
    const redirect = new URL((await approve.json()).redirectTo);
    const tokenResponse = await fetch(`${origin}/api/mcp/oauth/token`, { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: redirect.searchParams.get("code")!,
        code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: `${origin}/mcp/agent` }) });
    assert.equal(tokenResponse.status, 200);
    const token = await tokenResponse.json();
    await sdk.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp/agent`),
      { requestInit: { headers: { Authorization: `Bearer ${token.access_token}` } } }));
    const result: any = await sdk.callTool({ name: "create_funnel", arguments: { request_id: randomUUID(), name: "All Funnel Grid node types",
      map: { nodes: FUNNEL_NODE_TYPES.map((type, i) => ({ id: `step${i}`, type,
        position: { x: (i % 5) * 290, y: Math.floor(i / 5) * 230 },
        data: { label: type.replace(/([a-z])([A-Z])/g, "$1 $2"),
          ...(type === "note" ? { notes: "Offer: free training\nGoal: leads and sales" } : {}),
          ...(type === "delay" ? { delayAmount: 2, delayUnit: "days" } : {}),
          ...(type === "trafficSource" ? { trafficPlatform: "facebook" } : {}) } })),
        edges: [{ id: "traffic-capture", source: "step0", target: "step1" }] } } });
    assert.ok(!result.isError, "Real MCP create");
    const funnel = JSON.parse(result.content[0].text);
    const browserMap = await (await fetch(`${origin}/api/funnels/${funnel.id}`, { headers })).json();
    assert.deepEqual(browserMap.canvasData, funnel.canvasData);
    assert.ok(browserMap.editVersion);
    const save = await fetch(`${origin}/api/funnels/${funnel.id}`, { method: "PATCH", headers,
      body: JSON.stringify({ name: funnel.name, canvasData: funnel.canvasData, expectedVersion: browserMap.editVersion }) });
    assert.equal(save.status, 200, "Browser save with exact version");
    const saved = await save.json();
    assert.ok(saved.editVersion);
    const stale = await fetch(`${origin}/api/funnels/${funnel.id}`, { method: "PATCH", headers,
      body: JSON.stringify({ name: "Stale browser", expectedVersion: browserMap.editVersion }) });
    assert.equal(stale.status, 409, "Browser rejects stale edits");
    const staleAI: any = await sdk.callTool({ name: "update_funnel", arguments: { request_id: randomUUID(),
      funnel_id: funnel.id, expected_version: funnel.version, changes: { name: "Stale AI" } } });
    assert.ok(staleAI.isError);
    assert.equal(JSON.parse(staleAI.content[0].text).error, "edit_conflict");
    const shareToken = randomBytes(32).toString("hex");
    await pool.query("UPDATE funnels SET share_token=$2 WHERE id=$1", [funnel.id, shareToken]);
    await writeFile(statePath, JSON.stringify({ userId, clientId, funnelId: funnel.id, sharePath: `/funnels/share/${shareToken}` }));
    keep = true;
    console.log("Running-site smoke passed: regular login, OAuth consent, SDK creation of all 15 nodes, browser map parity, and browser/AI stale-edit rejection.");
    console.log(`Preview path: /funnels/share/${shareToken}`);
  } finally {
    await sdk.close().catch(() => {});
    if (!keep) {
      if (clientId) await pool.query("DELETE FROM project_mcp_clients WHERE id=$1", [clientId]);
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    }
    await pool.end();
  }
}
