// Real development-app regression check: no test login route or auth bypass.
// Synthetic users only; every fixture is removed in finally.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { pool } from "../server/db";
import { storage } from "../server/storage";

const base = process.argv[2];
if (!base || !new URL(base).hostname.endsWith(".replit.dev") || process.env.NODE_ENV === "production") {
  throw new Error("Run only against this project's development URL.");
}
const [owner, otherOwner] = [randomUUID(), randomUUID()];
const memberEmail = `calendar-auth-${randomUUID()}@example.invalid`;
const password = "Synthetic-calendar-auth-password";
let memberId: string | undefined;
const ids = [owner, otherOwner];
let cookie: string | undefined;
const call = (path: string, method = "GET", body?: unknown) => fetch(base + path, {
  method,
  headers: { Origin: base, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
try {
  for (const id of ids) {
    await pool.query("INSERT INTO users(id,email,cf_enrolled,is_disabled) VALUES($1,$2,TRUE,FALSE)",
      [id, `calendar-owner-${id}@example.invalid`]);
    await pool.query("INSERT INTO projects(id,user_id,name,due_date) VALUES($1,$2,$3,NOW())",
      [randomUUID(), id, `Synthetic calendar project ${id}`]);
  }
  const invite = await storage.createWorkspaceInvite(owner, memberEmail, randomBytes(32).toString("hex"));
  let response = await call("/api/workspace/invite/accept", "POST", { token: invite.inviteToken, password });
  assert.equal(response.status, 200, "non-enrolled new teammate accepts invitation");
  cookie = response.headers.get("set-cookie")!.split(";")[0];
  memberId = (await response.json()).userId;
  assert.ok(memberId);
  assert.notEqual((await storage.getUser(memberId))?.cfEnrolled, true);

  response = await call("/api/auth/me");
  assert.equal(response.status, 200, "identity refresh must not sign out a non-enrolled shared teammate");
  let identity = (await response.json()).user;
  assert.equal(identity.id, memberId);
  assert.equal(identity.workspaceOwnerId, owner);
  assert.equal(identity.isCollaborator, true);
  response = await call("/api/projects");
  assert.equal(response.status, 200, "teammate can open Projects after identity refresh");
  assert.deepEqual((await response.json()).map((p: { userId: string }) => p.userId), [owner]);
  assert.equal((await call("/api/funnels")).status, 403, "shared access does not confer other tools");
  response = await call(`/api/calendar/ical-url?workspaceId=${owner}`);
  assert.equal(response.status, 200);
  const calendar = await response.json();
  assert.equal(calendar.workspaceId, owner);
  assert.equal(calendar.scope, "projects");
  response = await fetch(calendar.url);
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(`Synthetic calendar project ${owner}`));

  const otherInvite = await storage.createWorkspaceInvite(otherOwner, memberEmail, randomBytes(32).toString("hex"));
  await storage.acceptWorkspaceInvite(otherInvite.inviteToken, memberId);
  for (const change of ["cf_enrolled=FALSE", "cf_revoked_at=NOW()", "is_disabled=TRUE"]) {
    await pool.query(`UPDATE users SET ${change} WHERE id=$1`, [owner]);
    assert.equal((await call("/api/auth/me")).status, 403, "identity rejects owner membership loss");
    assert.equal((await call("/api/projects")).status, 403);
    assert.equal((await fetch(calendar.url)).status, 404);
    assert.equal((await call("/api/workspaces")).status, 200, "identity rejection retains the actor's login");
    await pool.query("UPDATE users SET cf_enrolled=TRUE,cf_revoked_at=NULL,is_disabled=FALSE WHERE id=$1", [owner]);
  }
  await pool.query("UPDATE users SET is_disabled=TRUE WHERE id=$1", [memberId]);
  assert.equal((await call("/api/auth/me")).status, 403, "disabled actors cannot refresh identity");
  await pool.query("UPDATE users SET is_disabled=FALSE WHERE id=$1", [memberId]);
  // Sign in normally after disablement destroyed the old session. No fixture bypass.
  response = await call("/api/auth/login", "POST", { email: memberEmail, password });
  assert.equal(response.status, 200, "non-enrolled teammate can sign back in through an accepted workspace");
  cookie = response.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await call("/api/workspaces/active", "POST", { workspaceId: owner })).status, 200);
  assert.equal((await call("/api/auth/me")).status, 200);
  await storage.revokeWorkspaceInvite(invite.id, owner);
  assert.equal((await call("/api/auth/me")).status, 403, "identity rejects revoked selected invitation");
  assert.equal((await call("/api/projects")).status, 403);
  assert.equal((await fetch(calendar.url)).status, 404);
  assert.equal((await call("/api/workspaces/active", "POST", { workspaceId: otherOwner })).status, 200);
  response = await call("/api/auth/me");
  assert.equal(response.status, 200, "actor retains access to another valid shared workspace");
  identity = (await response.json()).user;
  assert.equal(identity.id, memberId);
  assert.equal(identity.workspaceOwnerId, otherOwner);
  assert.equal((await call("/api/projects")).status, 200);
  assert.equal((await call("/api/workspaces/active", "POST", { workspaceId: memberId })).status, 403, "non-enrolled actor cannot select personal workspace");
  await call("/api/auth/logout", "POST");
  console.log("Real-app calendar auth passed: non-enrolled acceptance, identity refresh, Projects, feed scope, membership loss, disablement, revocation and recovery.");
} finally {
  // Include accounts created even when a request failed before its response.
  const member = await storage.getUserByEmail(memberEmail);
  const cleanupIds = [...ids, ...(member ? [member.id] : [])];
  await pool.query("DELETE FROM workspace_invites WHERE owner_id=ANY($1::varchar[])", [ids]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [cleanupIds]);
  await pool.end();
}
