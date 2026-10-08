import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { test } from "node:test";
import { pool } from "./db";
import { storage } from "./storage";

test("invite revocation reports success for the owner and refuses another account", async () => {
  const owner = randomUUID(), other = randomUUID();
  let inviteId: string | undefined;
  try {
    // Disabled synthetic users cannot enter any background member-email schedule.
    await pool.query("INSERT INTO users (id,email,is_disabled) VALUES ($1,$2,true),($3,$4,true)",
      [owner, `invite-owner-${owner}@example.invalid`, other, `invite-other-${other}@example.invalid`]);
    const token = randomBytes(32).toString("hex");
    const invite = await storage.createWorkspaceInvite(owner, "invite-fixture@example.invalid", token);
    inviteId = invite.id;
    assert.equal(await storage.revokeWorkspaceInvite(invite.id, other), false);
    assert.equal((await storage.getWorkspaceInviteByToken(token))?.status, "pending");
    assert.equal(await storage.revokeWorkspaceInvite(invite.id, owner), true);
    assert.equal((await storage.getWorkspaceInviteByToken(token))?.status, "revoked");
    assert.equal(await storage.revokeWorkspaceInvite(randomUUID(), owner), false);
  } finally {
    if (inviteId) await pool.query("DELETE FROM workspace_invites WHERE id=$1", [inviteId]);
    await pool.query("DELETE FROM users WHERE id IN ($1,$2)", [owner, other]);
    await pool.end();
  }
});
