// Development-only smoke check against the running app. Uses synthetic users;
// never sends mail and never changes an existing member.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import bcrypt from "bcrypt";
import { pool } from "../server/db";
import { storage } from "../server/storage";

const statePath = "/tmp/fia-workspace-smoke.json";
if (process.argv[2] === "--cleanup") {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  try {
    await pool.query("DELETE FROM workspace_invites WHERE owner_id=ANY($1::varchar[])", [state.ids]);
    await pool.query("DELETE FROM projects WHERE user_id=ANY($1::varchar[])", [state.ids]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[]) OR email=$2", [state.ids, state.previewEmail]);
    await unlink(statePath);
    console.log("Synthetic workspace smoke fixtures removed.");
  } finally { await pool.end(); }
} else {
  const base = process.argv[2];
  if (!base || !new URL(base).hostname.endsWith(".replit.dev") || process.env.NODE_ENV === "production") {
    throw new Error("Run this check only against this project's development URL.");
  }
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const [admin, member, owner] = ids;
  const emails = ids.map((id) => `workspace-site-smoke-${id}@example.invalid`);
  const previewEmail = `workspace-site-preview-${randomUUID()}@example.invalid`;
  const password = "Synthetic-only-workspace-password";
  let keepForPreview = false;
  const call = (path: string, body?: unknown, cookie?: string) => fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const hash = await bcrypt.hash(password, 10);
    for (let i = 0; i < ids.length; i++) {
      await pool.query(`INSERT INTO users(id,email,display_name,password_hash,cf_enrolled,is_admin,is_disabled)
        VALUES($1,$2,$3,$4,true,$5,false)`, [ids[i], emails[i], i === 2 ? "Demo Workspace Owner" : "Demo Teammate", hash, i === 0]);
    }
    await pool.query("INSERT INTO projects(id,user_id,name) VALUES($1,$2,'Synthetic personal project'),($3,$4,'Synthetic shared project')",
      [randomUUID(), member, randomUUID(), owner]);
    let response = await call("/api/auth/login", { email: emails[0], password });
    assert.equal(response.status, 200, "real email login");
    let cookie = response.headers.get("set-cookie")!.split(";")[0];
    const invitation = await storage.createWorkspaceInvite(owner, emails[1], randomBytes(32).toString("hex"));
    response = await call("/api/workspace/invite/accept", { token: invitation.inviteToken, password }, cookie);
    assert.equal(response.status, 200, "real invitation login");
    const nextCookie = response.headers.get("set-cookie")!.split(";")[0];
    assert.notEqual(nextCookie, cookie);
    cookie = nextCookie;
    response = await call("/api/auth/me", undefined, cookie);
    assert.equal((await response.json()).user.id, member);
    response = await call("/api/projects", undefined, cookie);
    assert.equal(response.status, 200);
    let projects = await response.json();
    assert.deepEqual(projects.map((p: { name: string }) => p.name), ["Synthetic shared project"]);
    response = await call("/api/workspaces", undefined, cookie);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).workspaces.length, 2);
    response = await call("/api/workspaces/active", { workspaceId: member }, cookie);
    assert.equal(response.status, 200, "same-origin switch through development proxy");
    response = await call("/api/projects", undefined, cookie);
    projects = await response.json();
    assert.deepEqual(projects.map((p: { name: string }) => p.name), ["Synthetic personal project"]);
    assert.equal((await call("/api/workspaces/active", { workspaceId: owner }, cookie)).status, 200);
    assert.equal((await call("/api/account", undefined, cookie)).status, 200);
    assert.equal((await call("/api/funnels", undefined, cookie)).status, 403, "shared scope rejects other tools");
    await storage.revokeWorkspaceInvite(invitation.id, owner);
    assert.equal((await call("/api/projects", undefined, cookie)).status, 403);
    assert.equal((await call("/api/workspaces", undefined, cookie)).status, 200, "revocation does not remove the personal login");
    assert.equal((await call("/api/workspaces/active", { workspaceId: member }, cookie)).status, 200);
    assert.equal((await call("/api/projects", undefined, cookie)).status, 200);
    const preview = await storage.createWorkspaceInvite(owner, previewEmail, randomBytes(32).toString("hex"));
    const existingPreview = await storage.createWorkspaceInvite(owner, emails[1], randomBytes(32).toString("hex"));
    await writeFile(statePath, JSON.stringify({
      ids, previewEmail, previewPath: `/workspace/accept?token=${preview.inviteToken}`,
      existingPreviewPath: `/workspace/accept?token=${existingPreview.inviteToken}`,
    }));
    keepForPreview = true;
    console.log("Real-site smoke passed: login, session rotation, isolated projects, switching, scope restrictions, and revocation recovery.");
  } finally {
    if (!keepForPreview) {
      await pool.query("DELETE FROM workspace_invites WHERE owner_id=ANY($1::varchar[])", [ids]);
      await pool.query("DELETE FROM projects WHERE user_id=ANY($1::varchar[])", [ids]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [ids]);
    }
    await pool.end();
  }
}
