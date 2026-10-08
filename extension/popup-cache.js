import { authenticatedFetch, getAuthStatus, onAuthChanged, setRequestCacheHandler } from "./extension-auth.js";

const PATHS = ["/api/v1/links?activeOnly=false", "/api/v1/dmo", "/api/v1/dmo/settings", "/api/v1/dmo/history?limit=60"];
const ALARM = "fia-popup-preload";
const FRESH_MS = 60_000;
const IMAGE_BUDGET = 20 * 1024 * 1024;
let dbPromise, generation = 0, cacheUsable = true;
const flights = new Map();
let warming = null;

function openDb() {
  return dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("fia-popup-cache", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("entries");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = null; cacheUsable = false; reject(request.error); };
  });
}
async function store(action, key, value, epoch) {
  const db = await openDb();
  if (epoch !== undefined && epoch !== generation) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("entries", action === "get" || action === "getAll" ? "readonly" : "readwrite");
    const request = tx.objectStore("entries")[action](...(action === "put" ? [value, key] : key === undefined ? [] : [key]));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => { cacheUsable = false; reject(tx.error); };
    tx.onabort = () => { cacheUsable = false; reject(tx.error || new Error("Cache transaction aborted")); };
  });
}
const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const thumbnailSource = (link) => (link.screenshotUrl?.startsWith("/")
  ? `https://toolkit.fearlessmarketinglab.com${link.screenshotUrl}` : link.screenshotUrl) || (link.url
  ? `https://api.microlink.io/?url=${encodeURIComponent(link.url)}&screenshot=true&meta=false&embed=screenshot.url` : "");
const listKey = (id, path) => `list:${id}:${path}`;
const imageKey = (id, src) => `image:${id}:${src}`;
async function broadcast(message) {
  try { await chrome.runtime.sendMessage(message); } catch {}
}
async function clearCaches() {
  generation++;
  flights.clear();
  await store("clear");
  await chrome.storage.local.remove("cachedDmo");
}
async function saveDmo(id) {
  const [dmo, settings] = await Promise.all([
    store("get", listKey(id, PATHS[1])), store("get", listKey(id, PATHS[2])),
  ]);
  if (dmo?.day === dayKey() && (await getAuthStatus()).account?.id === id) {
    await chrome.storage.local.set({ cachedDmo: {
      dmoData: dmo.data, settingsData: settings?.data || null, accountId: id, cacheDay: dmo.day,
    } });
  }
}
async function fresh(path, account) {
  const key = listKey(account.id, path);
  if (flights.has(key)) return flights.get(key);
  const epoch = generation;
  const task = (async () => {
    const response = await authenticatedFetch(path);
    if (!response.headers.get("Content-Type")?.includes("application/json")) throw new Error("Unexpected server response");
    const data = await response.json();
    const latest = await getAuthStatus();
    if (latest.account?.id !== account.id) return { status: 409, data: { message: "Account changed. Please try again." } };
    if (epoch !== generation) return { status: response.status, data };
    if (response.ok) {
      await store("put", key, { accountId: account.id, path, data, updatedAt: Date.now(), day: dayKey() }, epoch);
      if (path === PATHS[0]) void preloadImages(account, data.links || [], epoch).catch(() => {});
      if (path === PATHS[1] || path === PATHS[2]) await saveDmo(account.id);
      await broadcast({ type: "POPUP_DATA_UPDATED", accountId: account.id, path });
    } else if (response.status === 401 || response.status === 403) {
      if (path === PATHS[1] || response.status === 401) {
        await clearCaches();
        await broadcast({ type: "POPUP_ACCESS_BLOCKED", accountId: account.id, status: response.status });
      } else await store("delete", key);
    }
    return { status: response.status, data };
  })().finally(() => { if (flights.get(key) === task) flights.delete(key); });
  flights.set(key, task);
  return task;
}
async function readData(path) {
  const status = await getAuthStatus();
  if (!status.connected || !status.account?.id) return { status: 401, data: { message: "Please sign in." } };
  const cached = await store("get", listKey(status.account.id, path));
  const suspended = (await chrome.storage.local.get("suspended")).suspended;
  if (cached && !suspended && (path !== PATHS[1] || cached.day === dayKey())) {
    if ((await getAuthStatus()).account?.id !== status.account.id) return { status: 401, data: { message: "Please sign in." } };
    if (Date.now() - cached.updatedAt > FRESH_MS) void fresh(path, status.account).catch(() => {});
    return { status: 200, data: cached.data };
  }
  return fresh(path, status.account);
}
async function warm() {
  if (!cacheUsable) return;
  if (warming) return warming;
  warming = (async () => {
    const status = await getAuthStatus();
    if (!status.connected || !status.account?.id) return;
    await Promise.allSettled(PATHS.map(async (path) => {
      const cached = await store("get", listKey(status.account.id, path));
      if (cached && Date.now() - cached.updatedAt < FRESH_MS && (path !== PATHS[1] || cached.day === dayKey())) {
        if (path === PATHS[0]) void preloadImages(status.account, cached.data.links || [], generation).catch(() => {});
        return;
      }
      return fresh(path, status.account);
    }));
  })().finally(() => { warming = null; });
  return warming;
}
async function imageData(src) {
  const url = new URL(src);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid thumbnail URL");
  const response = await fetch(url.href, { credentials: "omit", cache: "force-cache", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")
    || Number(response.headers.get("Content-Length")) > 4 * 1024 * 1024) throw new Error("Unavailable thumbnail");
  // Bound streamed responses too, rather than trusting a missing Content-Length.
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error("Thumbnail too large");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bitmap = await createImageBitmap(new Blob(chunks, { type: response.headers.get("Content-Type") }));
  let blob;
  try {
    const scale = Math.min(1, 360 / bitmap.width, 240 / bitmap.height);
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
  } finally { bitmap.close(); }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1024) binary += String.fromCharCode(...bytes.subarray(i, i + 1024));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
let imagesFlight = null, imageRun = 0;
async function preloadImages(account, links, epoch) {
  const run = ++imageRun;
  // Superseded lists finish safely; the next pass uses the newest saved list.
  if (imagesFlight) {
    await imagesFlight.catch(() => {});
    if (epoch !== generation || run !== imageRun) return;
  }
  const sources = new Set(links.map(thumbnailSource).filter(Boolean));
  const task = (async () => {
    const rows = await store("getAll");
    let budget = 0;
    for (const row of rows) {
      if (!row.src || row.accountId !== account.id) continue;
      if (!sources.has(row.src)) await store("delete", imageKey(account.id, row.src));
      else budget += row.dataUrl?.length || 0;
    }
    const queue = [...sources];
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (queue.length && epoch === generation && run === imageRun && cacheUsable) {
        const src = queue.shift(), key = imageKey(account.id, src);
        const previous = await store("get", key);
        if ((previous?.dataUrl && Date.now() - previous.updatedAt < 86400000) || previous?.retryAt > Date.now()) continue;
        // Stop downloading new images when the local cache is full. Refreshes
        // can replace an existing image without counting its old bytes twice.
        if (budget - (previous?.dataUrl?.length || 0) > IMAGE_BUDGET - 128 * 1024) return;
        try {
          const dataUrl = await imageData(src);
          const latest = await getAuthStatus();
          if (epoch !== generation || run !== imageRun || latest.account?.id !== account.id) return;
          const nextBudget = budget - (previous?.dataUrl?.length || 0) + dataUrl.length;
          if (nextBudget > IMAGE_BUDGET) return;
          budget = nextBudget;
          await store("put", key, { accountId: account.id, src, dataUrl, updatedAt: Date.now() }, epoch);
          await broadcast({ type: "POPUP_THUMBNAIL_READY", accountId: account.id, src, dataUrl });
        } catch {
          if (epoch === generation && run === imageRun && cacheUsable) await store("put", key,
            { ...previous, accountId: account.id, src, retryAt: Date.now() + 3600000 }, epoch);
        }
      }
    }));
  })();
  imagesFlight = task;
  try { await task; } finally { if (imagesFlight === task) imagesFlight = null; }
}
async function snapshot() {
  if (!cacheUsable) return { accountId: null, thumbnails: {} };
  const auth = await getAuthStatus();
  if (!auth.connected || !auth.account?.id) return { accountId: null, thumbnails: {} };
  const [rows, links] = await Promise.all([store("getAll"), store("get", listKey(auth.account.id, PATHS[0]))]);
  const sources = new Set((links?.data?.links || []).map(thumbnailSource));
  return { accountId: auth.account.id, thumbnails: Object.fromEntries(rows.filter((row) =>
    row.accountId === auth.account.id && row.dataUrl && sources.has(row.src)).map((row) => [row.src, row.dataUrl])) };
}
export function installPopupCache() {
  async function invalidate(path) {
    generation++;
    flights.clear();
    const auth = await getAuthStatus();
    if (!auth.account?.id) return;
    const affected = path.startsWith("/api/v1/links") ? [PATHS[0]] : PATHS.slice(1);
    await Promise.all(affected.map((item) => store("delete", listKey(auth.account.id, item))));
    if (!path.startsWith("/api/v1/links")) await chrome.storage.local.remove("cachedDmo");
  }
  const changesData = (context) => context.method !== "GET"
    && /^\/api\/v1\/(links|dmo|membership)(\/|\?|$)/.test(context.path) && !context.path.endsWith("/click");
  setRequestCacheHandler(async (context) => {
    if (!cacheUsable) return null;
    if (context.phase === "before") {
      if (context.method === "GET" && PATHS.includes(context.path)) return readData(context.path);
      if (changesData(context)) await invalidate(context.path);
    } else if (context.status < 400 && changesData(context)) {
      // Readers that started while the write was in flight must not keep the old list.
      await invalidate(context.path);
      void warm().catch(() => {});
    }
    return null;
  });
  onAuthChanged(async () => {
    await clearCaches();
    const auth = await getAuthStatus();
    if (!auth.connected) await broadcast({ type: "POPUP_AUTH_CLEARED" });
    else void warm().catch(() => {});
  });
  const schedule = () => chrome.alarms.create(ALARM, { delayInMinutes: 0.5, periodInMinutes: 5 });
  chrome.runtime.onInstalled.addListener(schedule);
  chrome.runtime.onStartup.addListener(schedule);
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) void warm().catch(() => {}); });
  // Restore the alarm after an extension update or an unexpectedly missing alarm.
  chrome.alarms.get(ALARM).then((alarm) => { if (!alarm) return schedule(); }).catch(() => {});
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!["POPUP_CACHE_WARM", "POPUP_CACHE_SNAPSHOT"].includes(msg?.type)) return false;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) {
      sendResponse({ ok: false, status: 403, error: "Not allowed." }); return false;
    }
    if (msg.type === "POPUP_CACHE_WARM") {
      void warm().catch(() => {}); sendResponse({ ok: true }); return false;
    }
    snapshot().then((data) => sendResponse({ ok: true, ...data })).catch(() => sendResponse({ ok: false, error: "Cache unavailable" }));
    return true;
  });
}
