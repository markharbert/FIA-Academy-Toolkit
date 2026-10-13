import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import session from "express-session";
import { pool } from "./db";
import { storage } from "./storage";
import { ensureCalendarFeedGrantsTable, registerCalendarSubscriptionRoutes, registerProjectCalendarFeedRoute } from "./calendar-subscriptions";
import { registerWorkspaceRoutes, isSharedWorkspaceRequestAllowed } from "./workspaces";

test("workspace calendar subscriptions authorize every public fetch", async (t) => {
  await ensureCalendarFeedGrantsTable();
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const [actor, ownerA, ownerB, teammate, outsider] = ids;
  const inviteIds: string[] = [];
  const privateTokens = new Map(ids.map(id => [id, randomBytes(24).toString("hex")]));
  const app = express();
  app.use(express.json(), session({ secret: "isolated-calendar-fixture", resave: false, saveUninitialized: false }));
  // Session fixture lives in this isolated test app, never in production.
  app.post("/fixture/login", (req, res) => {
    req.session.userId = req.body.id;
    if (req.body.impersonating) req.session.impersonatingAdminId = ownerA;
    res.json({ ok: true });
  });
  app.get("/fixture/identity", (req, res) => res.json({ actor: req.session.userId }));
  registerWorkspaceRoutes(app, (_req, _res, next) => next());
  registerCalendarSubscriptionRoutes(app, (req, res, next) => {
    if (!req.session.userId) { res.status(401).json({ message: "Sign in" }); return; }
    next();
  });
  // The real public route and real data reads are used; renderer shows the
  // records passed to iCal generation without involving unrelated app routes.
  registerProjectCalendarFeedRoute(app, ({ tasks, projects }) =>
    ["BEGIN:VCALENDAR", ...projects.map(p => p.name), ...tasks.map(p => p.title), "END:VCALENDAR"].join("\r\n"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const call = (path: string, method = "GET", cookie?: string, body?: unknown) => fetch(base + path, {
    method, headers: { Origin: base, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = async (id: string, impersonating = false) =>
    (await call("/fixture/login", "POST", undefined, { id, impersonating })).headers.get("set-cookie")!.split(";")[0];
  const choose = async (cookie: string, workspaceId: string) => {
    assert.equal((await call("/api/workspaces/active", "POST", cookie, { workspaceId })).status, 200);
  };
  const subscribe = async (cookie: string, workspaceId: string) => {
    const response = await call(`/api/calendar/ical-url?workspaceId=${workspaceId}`, "GET", cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.workspaceId, workspaceId);
    return data as { url: string; scope: string; workspaceId: string };
  };
  const readFeed = (url: string) => call(new URL(url).pathname);
  const invite = async (owner: string, member: string) => {
    const value = await storage.createWorkspaceInvite(owner, `calendar-${member}@example.invalid`, randomBytes(32).toString("hex"));
    inviteIds.push(value.id);
    await storage.acceptWorkspaceInvite(value.inviteToken, member);
    return value;
  };
  try {
    for (const id of ids) {
      await pool.query(`INSERT INTO users(id,email,cf_enrolled,ical_token) VALUES($1,$2,TRUE,$3)`,
        [id, `calendar-${id}@example.invalid`, privateTokens.get(id)]);
      const projectId = randomUUID();
      await pool.query(`INSERT INTO projects(id,user_id,name,due_date) VALUES($1,$2,$3,NOW())`, [projectId, id, `Project ${id}`]);
      await pool.query(`INSERT INTO project_tasks(id,user_id,project_id,title,due_date) VALUES($1,$2,$3,$4,NOW())`,
        [randomUUID(), id, projectId, `Task ${id}`]);
    }
    const inviteA = await invite(ownerA, actor);
    await invite(ownerB, actor);
    await invite(ownerA, teammate);
    const cookie = await login(actor);
    const teammateCookie = await login(teammate);
    let urlA = "", urlB = "", teammateUrl = "";

    await t.test("personal URL remains unchanged, two selected shared workspaces have distinct actor grants", async () => {
      const personal = await subscribe(cookie, actor);
      assert.equal(personal.scope, "personal");
      assert.equal(new URL(personal.url).pathname, `/api/calendar/ical/${privateTokens.get(actor)}.ics`);
      assert.equal((await readFeed(personal.url)).status, 200);
      await choose(cookie, ownerA);
      const a = await subscribe(cookie, ownerA); urlA = a.url;
      assert.equal(a.scope, "projects");
      assert.equal((await subscribe(cookie, ownerA)).url, urlA);
      await choose(cookie, ownerB);
      urlB = (await subscribe(cookie, ownerB)).url;
      assert.notEqual(urlA, urlB);
      assert.ok(!urlA.includes(privateTokens.get(ownerA)!));
      assert.ok(!urlB.includes(privateTokens.get(ownerB)!));
      assert.deepEqual(await (await call("/fixture/identity", "GET", cookie)).json(), { actor });
      const { rows } = await pool.query("SELECT actor_id,owner_id,invite_id,scope FROM calendar_feed_grants WHERE actor_id=$1", [actor]);
      assert.equal(rows.length, 2);
      assert.ok(rows.every(row => row.actor_id === actor && row.scope === "projects"));
      assert.equal(rows.find(row => row.owner_id === ownerA).invite_id, inviteA.id);
      await choose(teammateCookie, ownerA);
      teammateUrl = (await subscribe(teammateCookie, ownerA)).url;
      assert.notEqual(teammateUrl, urlA);
    });
    await t.test("anonymous shared feeds contain only the chosen workspace's projects and tasks", async () => {
      for (const [url, owner] of [[urlA, ownerA], [urlB, ownerB]]) {
        const response = await readFeed(url);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type")!, /text\/calendar/);
        assert.match(response.headers.get("cache-control")!, /no-store/);
        const text = await response.text();
        assert.ok(text.includes(`Project ${owner}`) && text.includes(`Task ${owner}`));
        for (const other of ids.filter(id => id !== owner)) assert.ok(!text.includes(other));
      }
    });
    await t.test("stale workspace requests, strangers, anonymous calls and impersonation cannot mint grants", async () => {
      assert.equal((await call(`/api/calendar/ical-url?workspaceId=${ownerA}`, "GET", cookie)).status, 409);
      assert.equal((await call("/api/calendar/rotate-ical-token", "POST", cookie, { workspaceId: ownerA })).status, 409);
      assert.equal((await call("/api/calendar/ical-url", "DELETE", cookie, { workspaceId: ownerA })).status, 409);
      assert.equal((await call("/api/calendar/ical-url")).status, 401);
      const strangerCookie = await login(outsider);
      assert.equal((await call("/api/workspaces/active", "POST", strangerCookie, { workspaceId: ownerA })).status, 403);
      assert.equal((await call("/api/calendar/ical-url", "GET", await login(actor, true))).status, 403);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/calendar/rotate-ical-token"), true);
      assert.equal(isSharedWorkspaceRequestAllowed("/api/calendar/personal-events"), false);
    });
    await t.test("rotation and explicit revocation affect only this actor's selected workspace", async () => {
      await choose(cookie, ownerA);
      const rotated = await call("/api/calendar/rotate-ical-token", "POST", cookie, { workspaceId: ownerA });
      assert.equal(rotated.status, 200);
      const newUrl = (await rotated.json()).url;
      assert.notEqual(newUrl, urlA);
      assert.equal((await readFeed(urlA)).status, 404);
      urlA = newUrl;
      assert.equal((await readFeed(urlA)).status, 200);
      assert.equal((await readFeed(urlB)).status, 200);
      assert.equal((await readFeed(teammateUrl)).status, 200);
      assert.equal((await storage.getUser(ownerA))?.icalToken, privateTokens.get(ownerA));
      assert.equal((await call("/api/calendar/ical-url", "DELETE", cookie, { workspaceId: ownerA })).status, 200);
      assert.equal((await readFeed(urlA)).status, 404);
      urlA = (await subscribe(cookie, ownerA)).url;
      assert.equal((await readFeed(urlA)).status, 200);
    });
    await t.test("owner membership loss, owner disablement and actor disablement are checked on every fetch", async () => {
      for (const change of ["cf_enrolled=FALSE", "cf_revoked_at=NOW()", "is_disabled=TRUE"]) {
        await pool.query(`UPDATE users SET ${change} WHERE id=$1`, [ownerA]);
        assert.equal((await readFeed(urlA)).status, 404);
        assert.equal((await readFeed(teammateUrl)).status, 404);
        assert.equal((await call("/api/calendar/ical-url", "GET", cookie)).status, 403);
        assert.equal((await readFeed(urlB)).status, 200);
        await pool.query("UPDATE users SET cf_enrolled=TRUE,cf_revoked_at=NULL,is_disabled=FALSE WHERE id=$1", [ownerA]);
      }
      await pool.query("UPDATE users SET is_disabled=TRUE WHERE id=$1", [actor]);
      assert.equal((await readFeed(urlA)).status, 404);
      assert.equal((await readFeed(urlB)).status, 404);
      assert.equal((await readFeed(teammateUrl)).status, 200);
      await pool.query("UPDATE users SET is_disabled=FALSE,cf_enrolled=FALSE WHERE id=$1", [actor]);
      assert.equal((await readFeed(urlA)).status, 200); // Collaboration does not require actor's paid membership.
      assert.equal((await call(`/api/calendar/ical/${privateTokens.get(actor)}.ics`)).status, 404);
      await pool.query("UPDATE users SET cf_enrolled=TRUE WHERE id=$1", [actor]);
    });
    await t.test("revoking an invitation stops existing links; a fresh invitation never restores them", async () => {
      await storage.revokeWorkspaceInvite(inviteA.id, ownerA);
      assert.equal((await readFeed(urlA)).status, 404);
      assert.equal((await readFeed(teammateUrl)).status, 200);
      assert.equal((await call("/api/calendar/ical-url", "GET", cookie)).status, 403);
      assert.equal((await readFeed(urlB)).status, 200);
      await invite(ownerA, actor);
      const newUrl = (await subscribe(cookie, ownerA)).url;
      assert.notEqual(newUrl, urlA);
      assert.equal((await readFeed(urlA)).status, 404);
      assert.equal((await readFeed(newUrl)).status, 200);
    });
    await t.test("pending or deleted invitations cannot authorize a bearer", async () => {
      const { rows } = await pool.query("SELECT invite_id FROM calendar_feed_grants WHERE actor_id=$1 AND owner_id=$2", [actor, ownerA]);
      const id = rows[0].invite_id;
      const url = (await subscribe(cookie, ownerA)).url;
      await pool.query("UPDATE workspace_invites SET status='pending' WHERE id=$1", [id]);
      assert.equal((await readFeed(url)).status, 404);
      assert.equal((await call("/api/calendar/ical-url", "GET", cookie)).status, 403);
      await pool.query("UPDATE workspace_invites SET status='accepted' WHERE id=$1", [id]);
      await pool.query("DELETE FROM workspace_invites WHERE id=$1", [id]);
      assert.equal((await readFeed(url)).status, 404);
      await invite(ownerA, actor);
      assert.equal((await readFeed((await subscribe(cookie, ownerA)).url)).status, 200);
    });
    await t.test("concurrent grants are stable; personal revocation and rotation preserve legacy route", async () => {
      const urls = await Promise.all(Array.from({ length: 5 }, () => subscribe(cookie, ownerA)));
      assert.equal(new Set(urls.map(value => value.url)).size, 1);
      await choose(cookie, actor);
      assert.equal((await subscribe(cookie, actor)).url.endsWith(`${privateTokens.get(actor)}.ics`), true);
      const rotated = await (await call("/api/calendar/rotate-ical-token", "POST", cookie, { workspaceId: actor })).json();
      assert.equal((await call(`/api/calendar/ical/${privateTokens.get(actor)}.ics`)).status, 404);
      assert.equal((await readFeed(rotated.url)).status, 200);
      assert.equal((await call("/api/calendar/ical-url", "DELETE", cookie, { workspaceId: actor })).status, 200);
      assert.equal((await readFeed(rotated.url)).status, 404);
      const initialReads = await Promise.all(Array.from({ length: 5 }, () => subscribe(cookie, actor)));
      assert.equal(new Set(initialReads.map(value => value.url)).size, 1);
      assert.equal((await readFeed(initialReads[0].url)).status, 200);
      assert.equal((await call("/api/calendar/ical/not-a-token.ics")).status, 404);
    });
  } finally {
    await pool.query("DELETE FROM workspace_invites WHERE id=ANY($1::varchar[])", [inviteIds]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::varchar[])", [ids]);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
