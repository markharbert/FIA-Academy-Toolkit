import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import session from "express-session";
import { pool } from "../db";
import { registerProjectsMcpRoutes } from "./routes";
import { buildMcpReference } from "./reference";
import { projectTools } from "./tools";

const admin = randomUUID(), member = randomUUID();
let server: ReturnType<express.Express["listen"]>;
let base: string;
before(async () => {
  await pool.query("INSERT INTO users(id,email,is_admin,is_disabled) VALUES($1,$2,true,false),($3,$4,false,false)",
    [admin, `mcp-guide-${admin}@example.invalid`, member, `mcp-guide-${member}@example.invalid`]);
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(session({ secret: randomUUID(), resave: false, saveUninitialized: false }));
  // Only this isolated test app has this route.
  app.post("/fixture-session", (req, res) => {
    if (![admin, member].includes(req.body.id)) { res.sendStatus(403); return; }
    req.session.userId = req.body.id;
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
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [[admin, member]]);
  await pool.end();
});
async function authenticated(id: string) {
  const response = await fetch(`${base}/fixture-session`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }) });
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return fetch(`${base}/api/admin/mcp/reference`, { headers: { Cookie: cookie } });
}
test("admin reference denies anonymous users and ordinary members", async () => {
  assert.equal((await fetch(`${base}/api/admin/mcp/reference`)).status, 401);
  assert.equal((await authenticated(member)).status, 403);
});
test("enabled admins receive complete current endpoints and tool definitions", async () => {
  const response = await authenticated(admin);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.endpoint, `${base}/mcp/projects`);
  assert.deepEqual(data.tools.map((tool: any) => tool.name).sort(), Object.keys(projectTools).sort());
  assert.ok(data.endpoints.some((entry: any) => entry.path === "/api/mcp/oauth/register"));
  assert.ok(data.endpoints.some((entry: any) => entry.path === "/api/mcp/approvals/:id"));
  const edit = data.tools.find((tool: any) => tool.name === "update_task");
  assert.ok(edit.parameters.some((parameter: any) => parameter.name === "expected_version" && parameter.required));
  assert.equal(data.tools.find((tool: any) => tool.name === "delete_project").destructive, true);
  assert.equal(data.tools.find((tool: any) => tool.name === "list_projects").write, false);
});
test("disabled admins cannot retrieve the reference", async () => {
  await pool.query("UPDATE users SET is_disabled=true WHERE id=$1", [admin]);
  try { assert.equal((await authenticated(admin)).status, 403); }
  finally { await pool.query("UPDATE users SET is_disabled=false WHERE id=$1", [admin]); }
});
test("tool catalogue tracks registry additions without hand-written tool lists", () => {
  projectTools.catalogue_fixture = { description: "Fixture only", schema: projectTools.list_projects.schema,
    run: async () => ({}) };
  try { assert.ok(buildMcpReference(base).tools.some((tool) => tool.name === "catalogue_fixture")); }
  finally { delete projectTools.catalogue_fixture; }
});
