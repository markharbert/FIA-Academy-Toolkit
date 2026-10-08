import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";
import { authStore } from "../extension/auth-store.js";

const state = { theme: "dark", targets: { vision: 20 } };
const listeners = [];
const tabUrls = [];
let fetchHandler;
const storage = {
  async get(keys) { return Object.fromEntries((typeof keys === "string" ? [keys] : keys).map((key) => [key, state[key]])); },
  async set(data) { Object.assign(state, data); },
  async remove(keys) { for (const key of (typeof keys === "string" ? [keys] : keys)) delete state[key]; },
  async setAccessLevel() {},
};
globalThis.chrome = {
  storage: { local: storage },
  alarms: { async create() {}, async clear() {}, onAlarm: { addListener() {} } },
  tabs: { async create({ url }) { tabUrls.push(url); } },
  runtime: { id: "a".repeat(32), getURL: (path) => `chrome-extension://${"a".repeat(32)}/${path}`,
    async sendMessage() {}, onMessage: { addListener(fn) { listeners.push(fn); } } },
};
globalThis.fetch = async (...args) => fetchHandler(...args);
const { getAuthStatus, authenticatedFetch } = await import("../extension/extension-auth.js");
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const trusted = { id: chrome.runtime.id, url: chrome.runtime.getURL("popup.html") };
const message = (data, sender = trusted) => new Promise((resolve, reject) => {
  const handled = listeners[0](data, sender, resolve);
  if (!handled && data.type !== "AUTH_REQUEST") reject(new Error("Message not handled"));
});
const issued = {
  accessToken: "fte_access_" + "a".repeat(64), refreshToken: "fte_refresh_" + "b".repeat(64),
  accessExpiresAt: Date.now() + 900000, refreshExpiresAt: Date.now() + 90 * 86400000,
  account: { id: "member", displayName: "Test member", email: "member@example.invalid" },
};

test("ordinary browser sign-in hands off a PKCE-bound session without exposing credentials", async () => {
  let challenge;
  fetchHandler = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(options.credentials, "omit");
    if (url.endsWith("/start")) {
      challenge = body.codeChallenge;
      assert.match(challenge, /^[\w-]{43}$/);
      return reply({ requestId: "request", pollSecret: "poll", userCode: "ABCD-1234", expiresAt: Date.now() + 600000, verificationPath: "/extension/connect?request=request" });
    }
    if (url.endsWith("/poll")) {
      assert.equal(body.codeVerifier.length, 43);
      const actual = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.codeVerifier))).toString("base64url");
      assert.equal(actual, challenge);
      return reply({ status: "connected", ...issued });
    }
    throw new Error("Unexpected auth request");
  };
  state.apiKey = "obsolete-test-key";
  const started = await message({ type: "AUTH_BEGIN_LOGIN" });
  assert.equal(started.ok, true);
  assert.equal(started.pending.userCode, "ABCD-1234");
  assert.equal(tabUrls[0], "https://toolkit.fearlessmarketinglab.com/extension/connect?request=request");
  assert.ok(!state.apiKey);
  const connected = await getAuthStatus();
  assert.equal(connected.connected, true);
  assert.equal(connected.account.id, "member");
  assert.ok(!JSON.stringify(connected).includes(issued.refreshToken));
  assert.equal(state.theme, "dark");
  assert.deepEqual(state.targets, { vision: 20 });
  assert.ok(!state.extensionAuth, "credentials are never stored in content-script-accessible Chrome local storage");
});

test("expired access renews once for simultaneous requests, and survives worker reload", async () => {
  await authStore.set({ extensionAuth: { ...(await authStore.get("extensionAuth")).extensionAuth, accessExpiresAt: Date.now() - 7 * 86400000 } });
  let renewCount = 0;
  fetchHandler = async (url, options) => {
    if (url.endsWith("/refresh")) {
      renewCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return reply({ ...issued, accessToken: "fte_access_" + "c".repeat(64), refreshToken: "fte_refresh_" + "d".repeat(64) });
    }
    assert.equal(options.headers.Authorization, "Bearer fte_access_" + "c".repeat(64));
    assert.ok(!options.headers["X-API-Key"]);
    return reply({ ok: true });
  };
  await Promise.all(Array.from({ length: 10 }, () => authenticatedFetch("/api/v1/dmo")));
  assert.equal(renewCount, 1);
  // A reloaded service worker has no in-memory token state, but storage persists.
  const rebooted = await import("../extension/extension-auth.js?worker-restart");
  assert.equal((await rebooted.getAuthStatus()).connected, true);
  await rebooted.authenticatedFetch("/api/v1/links");
  assert.equal(renewCount, 1);
});

test("offline and server failures do not erase a session", async () => {
  const auth = (await authStore.get("extensionAuth")).extensionAuth;
  const savedRefresh = auth.refreshToken;
  await authStore.set({ extensionAuth: { ...auth, accessExpiresAt: 0 } });
  fetchHandler = async () => { throw new TypeError("Offline"); };
  await assert.rejects(authenticatedFetch("/api/v1/dmo"), /Offline/);
  assert.equal((await authStore.get("extensionAuth")).extensionAuth.refreshToken, savedRefresh);
  fetchHandler = async () => reply({ message: "Temporarily unavailable" }, 503);
  await assert.rejects(authenticatedFetch("/api/v1/dmo"), /Temporarily unavailable/);
  assert.equal((await authStore.get("extensionAuth")).extensionAuth.refreshToken, savedRefresh);
});

test("content scripts cannot access the authentication broker", async () => {
  const denied = await message({ type: "AUTH_REQUEST", path: "/api/v1/me" }, {
    id: chrome.runtime.id, url: "https://example.test/", tab: { id: 1 },
  });
  assert.equal(denied.status, 403);
});

test("explicit sign-out revokes the device without clearing tool preferences", async () => {
  let revoked = false;
  const auth = (await authStore.get("extensionAuth")).extensionAuth;
  fetchHandler = async (url, options) => {
    assert.ok(url.endsWith("/logout"));
    assert.equal(JSON.parse(options.body).refreshToken, auth.refreshToken);
    revoked = true;
    return reply({ ok: true });
  };
  const result = await message({ type: "AUTH_LOGOUT" });
  assert.equal(result.ok, true);
  assert.ok(revoked);
  assert.ok(!(await authStore.get("extensionAuth")).extensionAuth);
  assert.equal(state.theme, "dark");
});
