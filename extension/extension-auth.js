// All credentials and refreshes stay in the trusted service-worker context.
import { authStore } from "./auth-store.js";
const API_BASE = "https://toolkit.fearlessmarketinglab.com";
const LOGIN_ALARM = "extension-login-poll";
let refreshing = null;
let polling = null;

const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomSecret = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const pkce = async (value) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));

async function authPost(path, body) {
  const res = await fetch(`${API_BASE}/api/extension/auth/${path}`, {
    method: "POST", credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || `Connection error (${res.status})`), { status: res.status, code: data.error });
  return data;
}

async function clearAuth() {
  await authStore.remove(["extensionAuth", "extensionLoginPending"]);
  await chrome.storage.local.remove(["apiKey", "suspended", "lastSuspendedCheckAt"]);
  await chrome.alarms.clear(LOGIN_ALARM);
  await chrome.alarms.clear("fia-suspended-check");
}

async function pollLogin() {
  if (polling) return polling;
  polling = (async () => {
    const { extensionLoginPending: pending } = await authStore.get("extensionLoginPending");
    if (!pending) return;
    if (pending.expiresAt < Date.now()) {
      await authStore.remove("extensionLoginPending");
      await chrome.alarms.clear(LOGIN_ALARM);
      return;
    }
    let data;
    try {
      data = await authPost("poll", { requestId: pending.requestId, pollSecret: pending.pollSecret, codeVerifier: pending.codeVerifier });
    } catch (err) {
      if ([401, 403, 410].includes(err.status)) {
        await authStore.remove("extensionLoginPending");
        await chrome.alarms.clear(LOGIN_ALARM);
      }
      throw err;
    }
    if (data.status === "connected") {
      // A cancelled/replaced request must never finish signing in afterward.
      const latest = (await authStore.get("extensionLoginPending")).extensionLoginPending;
      if (!latest || latest.requestId !== pending.requestId) {
        await authPost("logout", { refreshToken: data.refreshToken });
        return;
      }
      await authStore.set({ extensionAuth: {
        accessToken: data.accessToken, refreshToken: data.refreshToken,
        accessExpiresAt: data.accessExpiresAt, refreshExpiresAt: data.refreshExpiresAt, account: data.account,
      } });
      await authStore.remove("extensionLoginPending");
      await chrome.storage.local.remove(["apiKey", "suspended"]);
      await chrome.alarms.clear(LOGIN_ALARM);
      try { await chrome.runtime.sendMessage({ type: "AUTH_CONNECTED" }); } catch {}
    } else if (data.status === "denied") {
      await authStore.remove("extensionLoginPending");
      await chrome.alarms.clear(LOGIN_ALARM);
    }
  })().finally(() => { polling = null; });
  return polling;
}

export async function getAuthStatus() {
  await pollLogin();
  const { extensionAuth: auth, extensionLoginPending: pending } = await authStore.get(["extensionAuth", "extensionLoginPending"]);
  return {
    connected: !!auth?.refreshToken,
    account: auth?.account ?? null,
    pending: pending ? { userCode: pending.userCode, expiresAt: pending.expiresAt } : null,
  };
}

async function beginLogin() {
  const codeVerifier = randomSecret();
  const data = await authPost("start", { codeChallenge: await pkce(codeVerifier) });
  await authStore.set({ extensionLoginPending: {
    requestId: data.requestId, pollSecret: data.pollSecret, codeVerifier,
    userCode: data.userCode, expiresAt: data.expiresAt,
  } });
  await chrome.storage.local.remove("apiKey");
  await chrome.alarms.create(LOGIN_ALARM, { periodInMinutes: 0.5 });
  await chrome.tabs.create({ url: `${API_BASE}${data.verificationPath}` });
  return { pending: { userCode: data.userCode, expiresAt: data.expiresAt } };
}

async function accessToken(force = false) {
  let { extensionAuth: auth } = await authStore.get("extensionAuth");
  if (!auth) {
    await pollLogin();
    auth = (await authStore.get("extensionAuth")).extensionAuth;
  }
  if (!auth?.refreshToken) throw Object.assign(new Error("Please sign in to the extension."), { status: 401 });
  if (!force && auth.accessToken && auth.accessExpiresAt > Date.now() + 60000) return auth.accessToken;
  if (!refreshing) refreshing = (async () => {
    // Read again inside the lock, since another request may just have renewed it.
    const latest = (await authStore.get("extensionAuth")).extensionAuth;
    if (!latest?.refreshToken) throw Object.assign(new Error("Please sign in again."), { status: 401 });
    let data;
    try {
      data = await authPost("refresh", { refreshToken: latest.refreshToken });
    } catch (err) {
      // Keep credentials on timeouts, offline connections, and server outages.
      if (err.status === 401 || err.code === "account_disabled") await clearAuth();
      throw err;
    }
    const current = (await authStore.get("extensionAuth")).extensionAuth;
    if (!current || current.refreshToken !== latest.refreshToken) {
      throw Object.assign(new Error("You have signed out. Please sign in again."), { status: 401 });
    }
    await authStore.set({ extensionAuth: {
      ...latest, accessToken: data.accessToken, refreshToken: data.refreshToken,
      accessExpiresAt: data.accessExpiresAt, refreshExpiresAt: data.refreshExpiresAt, account: data.account,
    } });
    return data.accessToken;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function authenticatedFetch(path, options = {}) {
  if (!path.startsWith("/api/v1/") || path.includes("\\") || new URL(path, API_BASE).origin !== API_BASE) {
    throw new Error("Invalid extension API request.");
  }
  const send = async (token) => fetch(`${API_BASE}${path}`, {
    ...options, credentials: "omit", signal: AbortSignal.timeout(30000),
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  const attempted = await accessToken();
  let res = await send(attempted);
  if (res.status === 401) {
    const latest = await accessToken();
    res = await send(latest === attempted ? await accessToken(true) : latest);
    if (res.status === 401) await clearAuth();
  }
  return res;
}

async function signOut() {
  const { extensionAuth: auth } = await authStore.get("extensionAuth");
  if (auth?.refreshToken) await authPost("logout", { refreshToken: auth.refreshToken });
  await clearAuth();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOGIN_ALARM) void pollLogin().catch(() => {});
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!["AUTH_STATUS", "AUTH_BEGIN_LOGIN", "AUTH_CANCEL_LOGIN", "AUTH_LOGOUT", "AUTH_REQUEST"].includes(msg?.type)) return false;
  // Never expose token-management or unrestricted requests to injected content scripts.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) {
    sendResponse({ ok: false, status: 403, error: "Not allowed." });
    return false;
  }
  (async () => {
    if (msg.type === "AUTH_STATUS") return getAuthStatus();
    if (msg.type === "AUTH_BEGIN_LOGIN") return beginLogin();
    if (msg.type === "AUTH_LOGOUT") { await signOut(); return {}; }
    if (msg.type === "AUTH_CANCEL_LOGIN") {
      await authStore.remove("extensionLoginPending");
      await chrome.alarms.clear(LOGIN_ALARM);
      return {};
    }
    const res = await authenticatedFetch(msg.path, { method: msg.method || "GET", body: msg.body,
      headers: { "Content-Type": "application/json" } });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  })().then((data) => sendResponse({ ok: true, ...data })).catch((err) => {
    sendResponse({ ok: false, status: err.status || 0, code: err.code, error: err.message || "Could not connect." });
  });
  return true;
});
