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

      await chrome.storage.session.set({
        pendingCapture: { dataUrl: croppedDataUrl, type: "section" },
      });

      chrome.notifications.create("fia-section-ready", {
        type:    "basic",
        iconUrl: "icons/icon128.png",
        title:   "FIA Toolkit — Section Captured",
        message: "Click the extension icon to title and save it.",
      });
    } catch (err) {
      console.error("[FIA SW] section crop error:", err);
    }
  });
});

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
    chrome.notifications.create({
      type:    "basic",
      iconUrl: "icons/icon128.png",
      title:   "FIA Toolkit — Swipe File",
      message: `Snippet saved: "${title.substring(0, 60)}"`,
    });
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
