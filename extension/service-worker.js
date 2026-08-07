"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";
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

// ─── Event listeners ──────────────────────────────────────────────────────────

// Messages from popup
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
