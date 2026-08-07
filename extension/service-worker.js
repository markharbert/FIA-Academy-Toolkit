"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

// ─── Context Menu: Save to Swipe File ────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "fia-save-snippet",
    title: "Save to Swipe File",
    contexts: ["selection"],
  });
});

// ─── Section capture: crop & store for popup ─────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action !== "sectionSelected") return;
  const { rect, dpr } = msg;
  const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;

    const sectionTabId = sender.tab?.id;
  chrome.tabs.captureVisibleTab(windowId, { format: "png" }, async (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      console.error("[FIA SW] captureVisibleTab failed:", chrome.runtime.lastError?.message);
      return;
    }
    try {
      const blob   = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);

      const cw = Math.max(1, Math.round(rect.width  * dpr));
      const ch = Math.max(1, Math.round(rect.height * dpr));
      const canvas = new OffscreenCanvas(cw, ch);
      const ctx    = canvas.getContext("2d");
      ctx.drawImage(
        bitmap,
        Math.round(rect.x * dpr), Math.round(rect.y * dpr), cw, ch,
        0, 0, cw, ch
      );

      const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
      const arrayBuffer = await croppedBlob.arrayBuffer();
      const uint8       = new Uint8Array(arrayBuffer);

      // Convert to base64 in chunks (btoa can't handle huge strings in one call)
      const CHUNK = 65536;
      let binary = "";
      for (let i = 0; i < uint8.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
      }
      const croppedDataUrl = "data:image/png;base64," + btoa(binary);

      // Auto-save directly — no popup interaction needed
      const tabTitle = sender.tab?.title ?? "Section Screenshot";
      const item = await swipeAutoSave(croppedDataUrl, tabTitle);
      await chrome.storage.session.set({ swipeRecentlySaved: true });
      injectSaveToast(sectionTabId);
    } catch (err) {
      console.error("[FIA SW] section crop error:", err);
      injectErrorToast(sectionTabId, "Capture failed — try again");
    }
  });
});

// ─── Full Page capture: native scroll-and-stitch ─────────────────────────────

function swSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Page-level toasts (injected into the active tab) ─────────────────────────
function injectSaveToast(tabId) {
  if (!tabId) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ["save-toast.js"] }).catch(() => {});
}

function injectErrorToast(tabId, message) {
  if (!tabId) return;
  chrome.scripting.executeScript({
    target: { tabId },
    func: (msg) => {
      const TOAST_ID = "__fia_save_toast__", STYLE_ID = "__fia_toast_style__";
      [TOAST_ID, STYLE_ID].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = "@keyframes _fia_in{from{opacity:0;transform:translateX(-50%) scale(.75)}to{opacity:1;transform:translateX(-50%) scale(1)}}@keyframes _fia_out{from{opacity:1;transform:translateX(-50%) scale(1)}to{opacity:0;transform:translateX(-50%) scale(.75)}}";
      document.head.appendChild(style);
      const toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.style.cssText = "position:fixed;top:28px;left:50%;transform:translateX(-50%);z-index:2147483647;background:linear-gradient(135deg,#e85d5d 0%,#b52b2b 100%);padding:11px 22px 11px 14px;border-radius:999px;box-shadow:0 8px 28px rgba(185,43,43,.45);display:flex;align-items:center;gap:10px;animation:_fia_in .4s cubic-bezier(.34,1.56,.64,1) both;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;user-select:none;-webkit-user-select:none";
      toast.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" style="flex-shrink:0"><circle cx="13" cy="13" r="12" fill="rgba(255,255,255,0.22)"/><path d="M8.5 8.5l9 9M17.5 8.5l-9 9" stroke="white" stroke-width="2.6" stroke-linecap="round"/></svg><span style="color:#fff;font-size:14px;font-weight:650;white-space:nowrap">${msg}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.animation = "_fia_out .32s ease-in both"; setTimeout(() => { toast.remove(); style.remove(); }, 350); }, 4000);
    },
    args: [message],
  }).catch(() => {});
}

// ── Auto-save helper: upload PNG dataUrl → create swipe item ─────────────────
async function swipeAutoSave(dataUrl, title) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("No API key — open the extension and log in first.");

  const blob = await (await fetch(dataUrl)).blob();

  const upRes = await fetch(`${API_BASE}/api/v1/swipe/request-upload-url`, {
    method: "POST", headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!upRes.ok) throw new Error(`Upload URL failed (${upRes.status})`);
  const { uploadURL, objectPath } = await upRes.json();

  const putRes = await fetch(uploadURL, {
    method: "PUT", headers: { "Content-Type": "image/png" }, body: blob,
  });
  if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

  const itemRes = await fetch(`${API_BASE}/api/v1/swipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ type: "upload", title: title || "Screenshot", imagePath: objectPath }),
  });
  if (!itemRes.ok) throw new Error(`Save failed (${itemRes.status})`);
  const { item } = await itemRes.json();

  // Auto-generate share token so Recent Saves shows thumbnail + "Copy link" immediately
  try {
    const shareRes = await fetch(`${API_BASE}/api/v1/swipe/${item.id}/share`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (shareRes.ok) {
      const { token } = await shareRes.json();
      item.shareToken = token;
    }
  } catch (_) {}

  return item;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "startFullPageCapture") return false;
  sendResponse({ ok: true }); // ack immediately; async work runs below
  handleFullPageCapture(msg.tabId, msg.title);
  return false;
});

async function handleFullPageCapture(tabId, title) {
  const MAX_STEPS   = 20;
  const MAX_H_LOGIC = 14000; // cap logical-px height to stay inside canvas limits

  try {
    // 1. Read page geometry + save original scroll position
    const [{ result: dims }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        scrollH: Math.min(
          Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
          14000
        ),
        vpH:   window.innerHeight,
        vpW:   window.innerWidth,
        origX: window.scrollX,
        origY: window.scrollY,
        dpr:   Math.min(window.devicePixelRatio || 1, 2),
      }),
    });
    const { scrollH, vpH, vpW, origX, origY, dpr } = dims;

    // 2. Scroll to top
    await chrome.scripting.executeScript({
      target: { tabId }, func: () => window.scrollTo(0, 0),
    });
    await swSleep(200);

    // 3. OffscreenCanvas at full-page dimensions
    const canvas = new OffscreenCanvas(Math.round(vpW * dpr), Math.round(scrollH * dpr));
    const ctx    = canvas.getContext("2d");

    // 4. Scroll → capture → stitch
    const totalSteps = Math.min(Math.ceil(scrollH / vpH), MAX_STEPS);
    const windowId   = (await chrome.tabs.get(tabId)).windowId;

    for (let i = 0; i < totalSteps; i++) {
      // Last step always flushes to the very bottom so nothing is clipped
      const scrollTop = (i === totalSteps - 1)
        ? Math.max(0, scrollH - vpH)
        : i * vpH;

      await chrome.scripting.executeScript({
        target: { tabId }, func: (y) => window.scrollTo(0, y), args: [scrollTop],
      });
      await swSleep(150);

      const dataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(windowId, { format: "png" }, url => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(url);
        });
      });

      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      ctx.drawImage(bitmap, 0, Math.round(scrollTop * dpr));
      bitmap.close();
    }

    // 5. Restore scroll position
    await chrome.scripting.executeScript({
      target: { tabId }, func: (x, y) => window.scrollTo(x, y), args: [origX, origY],
    });

    // 6. PNG → base64 dataUrl
    const blob  = await canvas.convertToBlob({ type: "image/png" });
    const u8    = new Uint8Array(await blob.arrayBuffer());
    const CHUNK = 65536;
    let binary  = "";
    for (let i = 0; i < u8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    const finalDataUrl = "data:image/png;base64," + btoa(binary);

    // 7. Auto-save + notify
    const item = await swipeAutoSave(finalDataUrl, title);
    await chrome.storage.session.set({ swipeRecentlySaved: true });
    injectSaveToast(tabId);

  } catch (err) {
    console.error("[FIA SW] full page capture error:", err);
    injectErrorToast(tabId, "Capture failed — try again");
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "fia-save-snippet") return;
  const text      = info.selectionText ?? "";
  const sourceUrl = tab?.url ?? "";
  const title     = (tab?.title ?? "Snippet").substring(0, 120);

  const stored = await chrome.storage.local.get(["apiKey"]);
  const key = stored.apiKey;
  if (!key) return;

  try {
    await fetch(`${API_BASE}/api/v1/swipe`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body:    JSON.stringify({ type: "snippet", title, content: text, sourceUrl }),
    });
    injectSaveToast(tab?.id);
  } catch (err) {
    console.error("[FIA] Snippet save failed:", err.message);
  }
});
// This public key is safe to embed — it is designed to be shared with clients.
const VAPID_PUBLIC_KEY = "BPdIbvBytx7rxn5z3S3QJ2vI0GhB-PTDrtKpnpyyMa52g_nGrS7MCxYnUpbXEUMGPosBYYFydnRbXFm3rmnRBZE";

// ─── Push subscription ────────────────────────────────────────────────────────
function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribeToPush(apiKey) {
  try {
    const existing = await self.registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await fetch(`${API_BASE}/api/extension/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(subscription.toJSON()),
    });

    console.log("[FIA] Push subscription registered");
    return { success: true };
  } catch (err) {
    console.warn("[FIA] Push subscription failed:", err.message);
    return { success: false, error: err.message };
  }
}

async function unsubscribeFromPush(apiKey) {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await fetch(`${API_BASE}/api/extension/unsubscribe`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
    }
  } catch (err) {
    console.warn("[FIA] Unsubscribe failed:", err.message);
  }
}

// ─── Suspended-membership auto-recovery (chrome.alarms) ──────────────────────

const SUSPENDED_ALARM      = "fia-suspended-check";
const SUSPENDED_CHECK_MINS = 5;

// Fires every 5 minutes while the member is suspended.
// Survives popup close because it runs in the service worker.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SUSPENDED_ALARM) return;
  checkMembershipAlarm();
});

async function checkMembershipAlarm() {
  const { apiKey, suspended } = await chrome.storage.local.get(["apiKey", "suspended"]);
  if (!apiKey || !suspended) {
    // State no longer requires background checking — cancel the alarm.
    chrome.alarms.clear(SUSPENDED_ALARM);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/membership/check`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) return; // Silent — will retry on next alarm
    const data = await res.json();
    if (!data.enrolled) return; // Still inactive — will retry on next alarm

    // ── Membership restored ──
    chrome.alarms.clear(SUSPENDED_ALARM);
    await chrome.storage.local.set({ suspended: false });

    // Tell the popup if it is currently open (throws if popup is closed — that's fine).
    try {
      await chrome.runtime.sendMessage({ type: "MEMBERSHIP_RESTORED" });
    } catch {}

    // Show a system notification so the member knows even when the popup is closed.
    try {
      chrome.notifications.create("fia-membership-restored", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "FIA Toolkit — Access Restored 🎉",
        message: "Your membership is active again. Open the extension to continue.",
        priority: 2,
      });
    } catch {}
  } catch {
    // Network error — silent, will retry on next alarm
  }
}

// ─── Runtime messages from popup ─────────────────────────────────────────────
// Uses chrome.runtime.onMessage (the correct MV3 extension messaging API).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, apiKey } = message || {};

  if (type === "START_SUSPENDED_CHECK") {
    chrome.storage.local.set({ suspended: true }).then(() =>
      chrome.alarms.create(SUSPENDED_ALARM, { periodInMinutes: SUSPENDED_CHECK_MINS })
    );
    sendResponse({ ok: true });
    return false;
  }

  if (type === "STOP_SUSPENDED_CHECK") {
    chrome.storage.local.set({ suspended: false }).then(() =>
      chrome.alarms.clear(SUSPENDED_ALARM)
    );
    sendResponse({ ok: true });
    return false;
  }
});

// ─── Event listeners ──────────────────────────────────────────────────────────

// Messages from popup (push subscription — kept on the existing web-SW channel
// used by the rest of the extension push flow).
self.addEventListener("message", (event) => {
  const { type, apiKey } = event.data || {};
  if (type === "SUBSCRIBE_PUSH") {
    event.waitUntil(subscribeToPush(apiKey));
  }
  if (type === "UNSUBSCRIBE_PUSH") {
    event.waitUntil(unsubscribeFromPush(apiKey));
  }
});

// Incoming push notification
self.addEventListener("push", (event) => {
  let data = { title: "FIA Toolkit", body: "" };
  try { data = { ...data, ...event.data.json() }; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icons/icon128.png",
      badge: "icons/icon48.png",
      tag: "fia-toolkit-broadcast",
      renotify: true,
    })
  );
});

// Notification click — open the toolkit
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => c.url.startsWith(API_BASE));
        if (existing) return existing.focus();
        return clients.openWindow(API_BASE);
      })
  );
});
