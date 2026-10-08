import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import session from "express-session";
import { pool } from "./db";
import {
  extensionPkceChallenge, hashExtensionToken, isExtensionApiPath,
  registerExtensionAuthRoutes, resolveExtensionAccess,
} from "./extension-auth";

test("extension device authorization, renewable credentials, ownership, and revocation", async () => {
  const userId = randomUUID();
  const otherId = randomUUID();
  const app = express();
  app.use(express.json());
  app.use(session({ secret: randomBytes(32).toString("hex"), resave: false, saveUninitialized: false }));
  // This test-only server is never registered in the application.
  app.post("/test-session", (req, res) => { req.session.userId = userId; res.json({ ok: true }); });
  registerExtensionAuthRoutes(app, (req, res, next) => {
    if (!req.session.userId) { res.sendStatus(401); return; }
    next();
  });
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.sendStatus(500));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  let cookie = "";
  const call = async (path: string, method = "GET", body?: any, browser = false) => {
    const response = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(browser ? { Cookie: cookie, "X-Toolkit-Request": "extension-device" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, data: await response.json().catch(() => null) };
  };
  try {
    await pool.query("INSERT INTO users(id,email,is_admin) VALUES ($1,$2,true),($3,$4,true)", [
      userId, `extension-test-${userId}@example.invalid`, otherId, `extension-test-${otherId}@example.invalid`,
    ]);
    const login = await call("/test-session", "POST");
    cookie = login.response.headers.get("set-cookie")!.split(";")[0];
    const verifier = randomBytes(32).toString("base64url");
    const start = await call("/api/extension/auth/start", "POST", { codeChallenge: extensionPkceChallenge(verifier) });
    assert.equal(start.response.status, 200);
    assert.match(start.data.userCode, /^[A-F0-9]{4}-[A-F0-9]{4}$/);
    const poll = { requestId: start.data.requestId, pollSecret: start.data.pollSecret, codeVerifier: verifier };
    assert.equal((await call("/api/extension/auth/poll", "POST", poll)).data.status, "pending");
    assert.equal((await call("/api/extension/auth/request/" + poll.requestId)).response.status, 401);
    const info = await call("/api/extension/auth/request/" + poll.requestId, "GET", undefined, true);
    assert.equal(info.data.userCode, start.data.userCode);
    assert.equal((await call("/api/extension/auth/approve", "POST", { requestId: poll.requestId, csrfToken: "wrong", decision: "approve" }, true)).response.status, 403);
    const approval = await call("/api/extension/auth/approve", "POST", {
      requestId: poll.requestId, csrfToken: info.data.csrfToken, decision: "approve",
    }, true);
    assert.equal(approval.response.status, 200);
    assert.equal((await call("/api/extension/auth/poll", "POST", { ...poll, codeVerifier: randomBytes(32).toString("base64url") })).response.status, 401);
    const grant = await call("/api/extension/auth/poll", "POST", poll);
    assert.equal(grant.data.status, "connected");
    const issued = grant.data;
    assert.match(issued.accessToken, /^fte_access_[a-f0-9]{64}$/);
    assert.match(issued.refreshToken, /^fte_refresh_[a-f0-9]{64}$/);
    assert.equal(issued.account.id, userId);
    const retryGrant = await call("/api/extension/auth/poll", "POST", poll);
    assert.equal(retryGrant.data.refreshToken, issued.refreshToken, "lost grant responses are retryable, without issuing another device");
    assert.equal((await resolveExtensionAccess(issued.accessToken))?.user.id, userId);
    const sessions = await call("/api/account/extension-sessions", "GET", undefined, true);
    assert.equal(sessions.data.sessions.length, 1);
    const deviceId = sessions.data.sessions[0].id;
    const stored = (await pool.query("SELECT * FROM extension_device_sessions WHERE id=$1", [deviceId])).rows[0];
    assert.equal(stored.refresh_token_hash, hashExtensionToken(issued.refreshToken));
    assert.ok(!Object.values(stored).includes(issued.refreshToken), "no raw renewal credential is stored");

    // A week-old browser / expired access token can still renew without a website cookie.
    await pool.query("UPDATE extension_device_sessions SET access_expires_at=NOW()-INTERVAL '7 days',last_used_at=NOW()-INTERVAL '7 days' WHERE id=$1", [deviceId]);
    assert.equal(await resolveExtensionAccess(issued.accessToken), null);
    const renew = await call("/api/extension/auth/refresh", "POST", { refreshToken: issued.refreshToken });
    assert.equal(renew.response.status, 200);
    assert.notEqual(renew.data.refreshToken, issued.refreshToken);
    assert.equal((await resolveExtensionAccess(renew.data.accessToken))?.user.id, userId);
    const retryRenew = await call("/api/extension/auth/refresh", "POST", { refreshToken: issued.refreshToken });
    assert.equal(retryRenew.data.refreshToken, renew.data.refreshToken, "retry within the grace period returns the same rotated token");
    assert.equal(retryRenew.data.accessToken, renew.data.accessToken);
    assert.ok(isExtensionApiPath("/api/v1/dmo/settings"));
    assert.ok(isExtensionApiPath("/api/v1/swipe/request-upload-url"));
    assert.ok(!isExtensionApiPath("/api/v1/admin"));
    assert.ok(!isExtensionApiPath("/api/v1/funnels"));
    assert.ok(!isExtensionApiPath("/api/account"));

    // Revoking an arbitrary session owned by somebody else cannot affect that device.
    await pool.query("UPDATE extension_device_sessions SET user_id=$2 WHERE id=$1", [deviceId, otherId]);
    await call("/api/account/extension-sessions/" + deviceId, "DELETE", undefined, true);
    assert.equal((await resolveExtensionAccess(renew.data.accessToken))?.user.id, otherId);
    await pool.query("UPDATE extension_device_sessions SET user_id=$2 WHERE id=$1", [deviceId, userId]);
    const revoke = await call("/api/account/extension-sessions/" + deviceId, "DELETE", undefined, true);
    assert.equal(revoke.response.status, 200);
    assert.equal(await resolveExtensionAccess(renew.data.accessToken), null);
    assert.equal((await call("/api/extension/auth/refresh", "POST", { refreshToken: renew.data.refreshToken })).response.status, 401);
    assert.equal((await call("/api/extension/auth/logout", "POST", { refreshToken: renew.data.refreshToken })).response.status, 200);

    const denied = await call("/api/extension/auth/start", "POST", { codeChallenge: extensionPkceChallenge(verifier) });
    const denialInfo = await call("/api/extension/auth/request/" + denied.data.requestId, "GET", undefined, true);
    await call("/api/extension/auth/approve", "POST", { requestId: denied.data.requestId, csrfToken: denialInfo.data.csrfToken, decision: "deny" }, true);
    assert.equal((await call("/api/extension/auth/poll", "POST", {
      requestId: denied.data.requestId, pollSecret: denied.data.pollSecret, codeVerifier: verifier,
    })).data.status, "denied");
    await pool.query("UPDATE extension_auth_requests SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [denied.data.requestId]);
    assert.equal((await call("/api/extension/auth/poll", "POST", {
      requestId: denied.data.requestId, pollSecret: denied.data.pollSecret, codeVerifier: verifier,
    })).response.status, 410);
    await pool.query("DELETE FROM extension_auth_requests WHERE id=ANY($1)", [[start.data.requestId, denied.data.requestId]]);
  } finally {
    await pool.query("DELETE FROM users WHERE id=ANY($1)", [[userId, otherId]]);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
